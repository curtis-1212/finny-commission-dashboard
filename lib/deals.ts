// SERVER-ONLY -- Shared Attio deal-fetching and aggregation logic.
// Both the exec route and rep route call these functions so the numbers always match.

import { attioQuery, getVal } from "@/lib/attio";
import {
    AEConfig, BDRConfig, buildOwnerMap, getActiveAEs,
    calcAECommission, calcBDRCommission, BDR_DATA,
} from "@/lib/commission-config";

// ─── Constants ──────────────────────────────────────────────────────────────

// Churn = Closed Won customer who requested to cancel (subscription_cancel_request_date on deal).
const CHURN_REQUEST_DATE_ATTR = process.env.ATTIO_CHURN_REQUEST_DATE_ATTR || "subscription_cancel_request_date";

const PAGE_SIZE = 500;

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
    const dateToUse = closeDate;
    if (!dateToUse) return null;
    return String(dateToUse).slice(0, 10); // "YYYY-MM-DD"
}

/** Check if a deal is a churn (customer who cancelled in trial period) */
function isChurnedDeal(deal: any): boolean {
  const churnVal = getVal(deal, CHURN_REQUEST_DATE_ATTR);
  if (churnVal == null) return false;
  if (typeof churnVal === "string") return churnVal.trim() !== "";
  // Attio may return { value: "YYYY-MM-DD" } for date attributes
  if (typeof churnVal === "object" && churnVal?.value != null) return true;
  return true; // any other truthy value (e.g. object) = has churn date
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

  const closedWonDeals = await fetchAllDeals({ stage: "Closed Won" });
  const wonInMonth = closedWonDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

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
    const churned = isChurnedDeal(deal);
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

  const aeResults = activeAEs.map((ae) => {
    const a = agg[ae.id] || {
      grossARR: 0, churnARR: 0, netARR: 0,
      dealCount: 0, churnCount: 0,
      closedLostCount: 0, closedLostARR: 0,
    };
    const { commission, attainment, tierBreakdown } = calcAECommission(
      ae.monthlyQuota, ae.tiers, a.netARR,
    );
    const totalDecided = a.dealCount + a.closedLostCount;
    const cwRate = totalDecided > 0 ? a.dealCount / totalDecided : null;
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
