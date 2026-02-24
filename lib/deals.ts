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

export interface ChurnedUser {
  personRecordId: string;
  churnDate: string; // "YYYY-MM-DD"
}

export interface ChurnAggregation {
  perAE: Record<string, { churnCount: number; churnARR: number }>;
  unattributed: { churnCount: number; churnARR: number };
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

/** Parse a churn date value from Attio into a "YYYY-MM-DD" string. */
function parseChurnDate(val: any): string | null {
  if (val == null) return null;
  let raw: string;
  if (typeof val === "string") {
    raw = val.trim();
  } else if (typeof val === "object" && val?.value != null) {
    raw = String(val.value).trim();
  } else {
    raw = String(val).trim();
  }
  if (!raw) return null;
  const dateStr = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return dateStr;
}

/**
 * Fetch users from the Users list who have subscription_cancel_request_date set.
 * Returns an array of ChurnedUser with personRecordId and the actual churn date,
 * so callers can filter by month.
 * Wrapped in try/catch so a failure here never crashes the whole dashboard.
 */
export async function fetchChurnedUsersFromUsersList(): Promise<ChurnedUser[]> {
  const churnedUsers: ChurnedUser[] = [];
  if (!USERS_LIST_SLUG) return churnedUsers;

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
        if (!hasChurnDate(churnVal) || !entry.parent_record_id) continue;
        const dateStr = parseChurnDate(churnVal);
        if (!dateStr) continue;
        churnedUsers.push({
          personRecordId: String(entry.parent_record_id),
          churnDate: dateStr,
        });
      }
      if (entries.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
    console.log(`[churn-debug] Scanned ${totalEntries} entries from "${USERS_LIST_SLUG}", found ${churnedUsers.length} churned records`);
  } catch (err: any) {
    console.error(`[churn] Failed to fetch from Users list "${USERS_LIST_SLUG}":`, err?.message ?? err);
  }
  return churnedUsers;
}

/** Convert ChurnedUser array to a Set of person record IDs (for backward compat). */
export function churnedUsersToIdSet(users: ChurnedUser[]): Set<string> {
  return new Set(users.map(u => u.personRecordId));
}

/**
 * User-centric churn aggregation: starts from the Users list (churned users),
 * traces back through deals to attribute churn to AEs.
 *
 * For each user who churned in the selected month:
 *   1. Find their Closed Won deals (any close date) via associated_person
 *   2. Use the most recent deal's owner as the responsible AE
 *   3. Use that deal's value as churnARR
 */
export function buildChurnAggregation(
  churnedUsers: ChurnedUser[],
  startISO: string,
  endISO: string,
  closedWonDeals: any[],
  ownerMap: Record<string, string>,
  activeAEIds: Set<string>,
): ChurnAggregation {
  // Step 1: Filter to users who churned in the selected month
  const churnedInMonth = churnedUsers.filter(u =>
    u.churnDate >= startISO && u.churnDate <= endISO
  );

  // Step 2: Build reverse map from personRecordId → deals
  const dealsByPerson = new Map<string, any[]>();
  for (const deal of closedWonDeals) {
    const rawVals = deal?.values?.[DEAL_PARENT_ATTR];
    const personIds: string[] = [];
    if (Array.isArray(rawVals)) {
      for (const v of rawVals) {
        const id = v?.target_record_id ?? v?.value;
        if (id) personIds.push(String(id));
      }
    } else {
      const id = getVal(deal, DEAL_PARENT_ATTR);
      if (id) personIds.push(String(id));
    }
    for (const pid of personIds) {
      if (!dealsByPerson.has(pid)) dealsByPerson.set(pid, []);
      dealsByPerson.get(pid)!.push(deal);
    }
  }

  // Step 3: For each churned user, attribute to AE via most recent deal
  const perAE: Record<string, { churnCount: number; churnARR: number }> = {};
  let unattributedCount = 0;
  let unattributedARR = 0;

  for (const user of churnedInMonth) {
    const deals = dealsByPerson.get(user.personRecordId) || [];
    if (deals.length === 0) {
      unattributedCount += 1;
      continue;
    }

    // Find most recent deal by close_date
    let bestDeal = deals[0];
    let bestDate = getDealDate(deals[0]) || "";
    for (let i = 1; i < deals.length; i++) {
      const d = getDealDate(deals[i]) || "";
      if (d > bestDate) {
        bestDate = d;
        bestDeal = deals[i];
      }
    }

    const ownerUUID = getVal(bestDeal, "owner");
    const aeId = ownerMap[ownerUUID];
    const value = getVal(bestDeal, "value") || 0;

    if (!aeId || !activeAEIds.has(aeId)) {
      unattributedCount += 1;
      unattributedARR += value;
      continue;
    }

    if (!perAE[aeId]) perAE[aeId] = { churnCount: 0, churnARR: 0 };
    perAE[aeId].churnCount += 1;
    perAE[aeId].churnARR += value;
  }

  console.log(
    `[churn] Month ${startISO} to ${endISO}: ${churnedInMonth.length} users churned, ` +
    `attributed to ${Object.keys(perAE).length} AEs, ` +
    `${unattributedCount} unattributed`
  );

  return {
    perAE,
    unattributed: { churnCount: unattributedCount, churnARR: unattributedARR },
  };
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

  // User-centric churn: fetch churned users with dates, then attribute to AEs via deals
  const churnedUsers = await fetchChurnedUsersFromUsersList();

  const closedWonDeals = await fetchAllDeals({ stage: "Closed Won" });
  const wonInMonth = closedWonDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

  // Build churn aggregation from Users list → deals → AEs
  const activeAEIds = new Set(activeAEs.map(ae => ae.id));
  const churnAgg = buildChurnAggregation(
    churnedUsers, startISO, endISO,
    closedWonDeals, OWNER_MAP, activeAEIds,
  );

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

  // Count ALL Closed Won deals in month as gross ARR (no deal-level churn exclusion)
  for (const deal of wonInMonth) {
    const ownerUUID = getVal(deal, "owner");
    const aeId = OWNER_MAP[ownerUUID];
    if (!aeId || !agg[aeId]) continue;
    const value = getVal(deal, "value") || 0;
    agg[aeId].grossARR += value;
    agg[aeId].dealCount += 1;
  }

  // Apply user-centric churn data
  for (const [aeId, churnData] of Object.entries(churnAgg.perAE)) {
    if (!agg[aeId]) continue;
    agg[aeId].churnCount = churnData.churnCount;
    agg[aeId].churnARR = churnData.churnARR;
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
