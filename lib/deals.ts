// SERVER-ONLY -- Shared Attio deal-fetching and aggregation logic.
// Both the exec route and rep route call these functions so the numbers always match.

import { attioQuery, attioListEntriesQuery, getVal, getEntryVal } from "@/lib/attio";
import {
    AEConfig, BDRConfig, buildOwnerMap, getActiveAEs,
    calcAECommission, calcBDRCommission, BDR_DATA,
} from "@/lib/commission-config";

// ─── Constants ──────────────────────────────────────────────────────────────

// Churn: from Users list (entry has subscription_cancel_request_date) or fallback to same attr on deal.
const CHURN_REQUEST_DATE_ATTR = process.env.ATTIO_CHURN_REQUEST_DATE_ATTR || "subscription_cancel_request_date";
// Users list slug in Attio (list containing customer records with subscription_cancel_request_date).
const USERS_LIST_SLUG = process.env.ATTIO_USERS_LIST_SLUG ?? "users";
// Deals link to People -- the person record_id matches the Users list parent_record_id.
const DEAL_PARENT_ATTR = process.env.ATTIO_DEAL_PARENT_ATTR || "associated_person";

const DEMO_HELD_DATE_ATTR = process.env.ATTIO_DEMO_HELD_DATE_ATTR || "demo_held_date";

const PAGE_SIZE = 500;
const LIST_PAGE_SIZE = 500;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AERollup {
  grossARR: number;
  churnARR: number;
  netARR: number;
  dealCount: number;
  churnCount: number;
  closedLostCount: number;
  closedLostARR: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract the commission-relevant date from a deal (close_date — the month the deal was moved to Closed Won) */
function getDealDate(deal: any): string | null {
  const closeDate = getVal(deal, "close_date");
  if (!closeDate) return null;
  return String(closeDate).slice(0, 10);
}

function getDemoHeldDate(deal: any): string | null {
  const d = getVal(deal, DEMO_HELD_DATE_ATTR);
  if (!d) return null;
  return String(d).slice(0, 10);
}

function getDealStage(deal: any): string | null {
  const s = getVal(deal, "stage");
  if (!s) return null;
  if (typeof s === "object" && s?.title) return s.title;
  return String(s);
}

/** Check if value indicates churn (non-empty date). */
function hasChurnDate(val: any): boolean {
  if (val == null) return false;
  if (typeof val === "string") return val.trim() !== "";
  if (typeof val === "object" && val?.value != null) return true;
  return true;
}

/**
 * Fetch parent_record_ids from the Users list where subscription_cancel_request_date is set.
 * Returns a Set of person record IDs that can be matched against deals' associated_person.
 * Wrapped in try/catch so a failure here never crashes the whole dashboard.
 */
export async function fetchChurnedRecordIdsFromUsersList(): Promise<Set<string>> {
  const churnedIds = new Set<string>();
  if (!USERS_LIST_SLUG) return churnedIds;

  try {
    let offset = 0;
    let totalEntries = 0;
    while (true) {
      const page = await attioListEntriesQuery(USERS_LIST_SLUG, {
        limit: LIST_PAGE_SIZE,
        offset,
      });
      const entries = page?.data ?? [];
      totalEntries += entries.length;

      if (entries.length > 0 && offset === 0) {
        const sample = entries[0];
        const entryKeys = Object.keys(sample?.entry_values ?? {});
        const recordKeys = Object.keys(sample?.record_values ?? {});
        const valueKeys = Object.keys(sample?.values ?? {});
        console.log(
          `[churn-debug] Users list "${USERS_LIST_SLUG}" first entry:`,
          JSON.stringify({
            parent_record_id: sample.parent_record_id,
            parent_object: sample.parent_object,
            entry_value_keys: entryKeys.slice(0, 20),
            record_value_keys: recordKeys.slice(0, 20),
            value_keys: valueKeys.slice(0, 20),
            looking_for: CHURN_REQUEST_DATE_ATTR,
            found_in_entry_values: entryKeys.includes(CHURN_REQUEST_DATE_ATTR),
            found_in_record_values: recordKeys.includes(CHURN_REQUEST_DATE_ATTR),
            found_in_values: valueKeys.includes(CHURN_REQUEST_DATE_ATTR),
          }),
        );
      }

      for (const entry of entries) {
        const churnVal = getEntryVal(entry, CHURN_REQUEST_DATE_ATTR);
        if (hasChurnDate(churnVal) && entry.parent_record_id) {
          churnedIds.add(String(entry.parent_record_id));
        }
      }
      if (entries.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
    console.log(`[churn-debug] Scanned ${totalEntries} entries from "${USERS_LIST_SLUG}", found ${churnedIds.size} churned records`);
  } catch (err: any) {
    console.error(`[churn] Failed to fetch from Users list "${USERS_LIST_SLUG}":`, err?.message ?? err);
  }
  return churnedIds;
}

/**
 * Deal is churned if its linked record (e.g. company) is in the churned set,
 * OR the deal itself carries subscription_cancel_request_date.
 *
 * The linked-record attribute (associated_person) can surface as:
 *   - a single target_record_id string (getVal returns it)
 *   - multiple entries in the values array (getVal only returns the first)
 * We check all entries in the raw values array to be thorough.
 */
export function isChurnedDeal(deal: any, churnedRecordIds: Set<string>): boolean {
  if (churnedRecordIds.size > 0) {
    const rawVals = deal?.values?.[DEAL_PARENT_ATTR];
    if (Array.isArray(rawVals)) {
      for (const v of rawVals) {
        const id = v?.target_record_id ?? v?.value;
        if (id && churnedRecordIds.has(String(id))) return true;
      }
    } else {
      const linkedId = getVal(deal, DEAL_PARENT_ATTR);
      if (linkedId && churnedRecordIds.has(String(linkedId))) return true;
    }
  }
  const churnVal = getVal(deal, CHURN_REQUEST_DATE_ATTR);
  return hasChurnDate(churnVal);
}

// ─── Paginated Attio query ──────────────────────────────────────────────────

async function fetchAllDeals(filter: object): Promise<any[]> {
  let allDeals: any[] = [];
  let offset = 0;
  while (true) {
    const page = await attioQuery("deals", { filter, limit: PAGE_SIZE, offset });
    const records = page?.data || [];
    allDeals = allDeals.concat(records);
    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allDeals;
}

// ─── Main data-fetching function ────────────────────────────────────────────

export interface MonthData {
  aeResults: {
    id: string; name: string; role: string; initials: string; color: string;
    type: "ae"; monthlyQuota: number; annualQuota: number;
    grossARR: number; churnARR: number; netARR: number;
    dealCount: number; churnCount: number; closedLostCount: number; closedLostARR: number;
    cwRate: number | null;
    attainment: number; commission: number;
    tierBreakdown: { label?: string; amount: number }[];
  }[];
  bdrResult: {
    id: string; name: string; role: string; initials: string; color: string;
    type: "bdr"; monthlyQuota: number;
    totalMeetings: number; netMeetings: number;
    attainment: number; commission: number;
  };
  meta: {
    fetchedAt: string; dealCount: number; monthLabel: string;
    selectedMonth: string; warning?: string;
  };
}

export async function fetchMonthData(
    startISO: string,
    endISO: string,
    monthLabel: string,
    selectedMonthStr: string,
  ): Promise<MonthData> {
    const OWNER_MAP = buildOwnerMap();
  const activeAEs = getActiveAEs(selectedMonthStr);

  const churnedRecordIds = await fetchChurnedRecordIdsFromUsersList();

  const closedWonDeals = await fetchAllDeals({ stage: "Closed Won" });
  const wonInMonth = closedWonDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

  if (wonInMonth.length > 0) {
    const sample = wonInMonth[0];
    const rawParent = sample?.values?.[DEAL_PARENT_ATTR];
    console.log(
      `[churn-debug] Deal→Person link: attr="${DEAL_PARENT_ATTR}"`,
      JSON.stringify({
        raw_value: rawParent,
        resolved: getVal(sample, DEAL_PARENT_ATTR),
        deal_attr_keys: Object.keys(sample?.values ?? {}).slice(0, 25),
        churned_set_size: churnedRecordIds.size,
        churned_sample: Array.from(churnedRecordIds).slice(0, 3),
      }),
    );
  }

  const closedLostDeals = await fetchAllDeals({ stage: "Closed Lost" });
  const lostInMonth = closedLostDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

  const agg: Record<string, AERollup> = {};
  for (const ae of activeAEs) {
    agg[ae.id] = {
      grossARR: 0, churnARR: 0, netARR: 0,
      dealCount: 0, churnCount: 0,
      closedLostCount: 0, closedLostARR: 0,
    };
  }

  for (const deal of wonInMonth) {
    const ownerUUID = getVal(deal, "owner");
    const aeId = OWNER_MAP[ownerUUID];
    if (!aeId || !agg[aeId]) continue;
    const value = getVal(deal, "value") || 0;
    const churned = isChurnedDeal(deal, churnedRecordIds);
    agg[aeId].grossARR += value;
    if (churned) {
      agg[aeId].churnARR += value;
      agg[aeId].churnCount += 1;
    } else {
      agg[aeId].dealCount += 1;
    }
  }

  for (const deal of lostInMonth) {
    const ownerUUID = getVal(deal, "owner");
    const aeId = OWNER_MAP[ownerUUID];
    if (!aeId || !agg[aeId]) continue;
    const value = getVal(deal, "value") || 0;
    agg[aeId].closedLostCount += 1;
    agg[aeId].closedLostARR += value;
  }

  for (const id of Object.keys(agg)) {
    agg[id].netARR = agg[id].grossARR - agg[id].churnARR;
  }

  // CW Rate: based on deals with demo_held_date in this month (any stage)
  const allDeals = await fetchAllDeals({});
  const demoInMonth = allDeals.filter((deal: any) => {
    const d = getDemoHeldDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });
  const demoCounts: Record<string, { total: number; won: number }> = {};
  for (const ae of activeAEs) {
    demoCounts[ae.id] = { total: 0, won: 0 };
  }
  for (const deal of demoInMonth) {
    const ownerUUID = getVal(deal, "owner");
    const aeId = OWNER_MAP[ownerUUID];
    if (!aeId || !demoCounts[aeId]) continue;
    demoCounts[aeId].total += 1;
    const stage = getDealStage(deal);
    if (stage === "Closed Won") demoCounts[aeId].won += 1;
  }

  const aeResults = activeAEs.map((ae) => {
    const a = agg[ae.id] || {
      grossARR: 0, churnARR: 0, netARR: 0,
      dealCount: 0, churnCount: 0,
      closedLostCount: 0, closedLostARR: 0,
    };
    const { commission, attainment, tierBreakdown } = calcAECommission(
      ae.monthlyQuota, ae.tiers, a.netARR,
    );
    const dc = demoCounts[ae.id] || { total: 0, won: 0 };
    const cwRate = dc.total > 0 ? dc.won / dc.total : null;
    return {
      id: ae.id, name: ae.name, role: ae.role,
      initials: ae.initials, color: ae.color,
      type: "ae" as const,
      monthlyQuota: ae.monthlyQuota, annualQuota: ae.annualQuota,
      grossARR: a.grossARR, churnARR: a.churnARR, netARR: a.netARR,
      dealCount: a.dealCount, churnCount: a.churnCount,
      closedLostCount: a.closedLostCount, closedLostARR: a.closedLostARR,
      cwRate,
      attainment, commission,
      tierBreakdown: tierBreakdown.map((t) => ({ label: t.label, amount: t.amount })),
    };
  });

  let maxMeetings = 0;
  for (const deal of wonInMonth) {
    const leadOwner = getVal(deal, "lead_owner");
    if (leadOwner === process.env.ATTIO_MAX_UUID) maxMeetings += 1;
  }

  const { commission: bdrCommission, attainment: bdrAttainment } = calcBDRCommission(maxMeetings);
  const bdrResult = {
    id: "max", name: BDR_DATA.name, role: BDR_DATA.role,
    initials: BDR_DATA.initials, color: BDR_DATA.color,
    type: "bdr" as const,
    monthlyQuota: BDR_DATA.monthlyQuota,
    totalMeetings: maxMeetings, netMeetings: maxMeetings,
    attainment: bdrAttainment, commission: bdrCommission,
  };

  const totalDeals = wonInMonth.length;
  const today = new Date().getUTCDate();
  const warning = totalDeals === 0 && today > 5
    ? "No Closed Won deals found for this month -- check Attio data"
    : undefined;

  return {
    aeResults,
    bdrResult,
    meta: {
      fetchedAt: new Date().toISOString(),
      dealCount: totalDeals,
      monthLabel,
      selectedMonth: selectedMonthStr,
      warning,
    },
  };
}
