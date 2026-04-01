// SERVER-ONLY -- Shared deal-fetching + commission computation for approval flows.

import {
  AE_DATA, buildOwnerMap, getActiveAEs, getMonthRange,
  parseMonthParam, calcAECommission, getAERampInfo,
} from "@/lib/commission-config";
import {
  fetchChurnedUsersFromUsersList, buildOptOutAggregation,
  fetchAllDeals, type DealDetail,
} from "@/lib/deals";
import { getVal } from "@/lib/attio";

function getDealDate(deal: any): string | null {
  const closeDate = getVal(deal, "close_date");
  if (!closeDate) return null;
  return String(closeDate).slice(0, 10);
}

export interface DealSnapshotResult {
  dealSnapshot: DealDetail[];
  closedWonDeals: DealDetail[];
  optOutDeals: DealDetail[];
  grossARR: number;
  optOutARR: number;
  netARR: number;
  commission: number;
  monthLabel: string;
}

/**
 * Compute the full deal snapshot and commission for a given AE + month.
 * Shared by the dashboard approve endpoint and the Slack interactions handler.
 */
export async function computeDealSnapshot(repId: string, monthStr: string): Promise<DealSnapshotResult> {
  const { year, month } = parseMonthParam(monthStr);
  const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;
  const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);

  const ae = AE_DATA.find((a) => a.id === repId);
  if (!ae) throw new Error(`AE not found: ${repId}`);

  const activeAEs = getActiveAEs(selectedMonth);
  const OWNER_MAP = buildOwnerMap();
  const closedWonAll = await fetchAllDeals({ stage: "Closed Won" });

  const wonInMonth = closedWonAll.filter((deal: any) => {
    const d = getDealDate(deal);
    return d && d >= startISO && d <= endISO;
  });

  let grossARR = 0;
  const closedWonDeals: DealDetail[] = [];
  for (const deal of wonInMonth) {
    if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
    const value = getVal(deal, "value") || 0;
    const closeDate = getDealDate(deal) || "";
    const dealName = getVal(deal, "name") || "Unnamed Deal";
    grossARR += value;
    closedWonDeals.push({ name: String(dealName), value, closeDate });
  }

  // Opt-out calculation
  const churnedUsers = await fetchChurnedUsersFromUsersList();
  const activeAEIds = new Set(activeAEs.map((a) => a.id));
  const selectedDate = new Date(startISO);
  const priorMonth = selectedDate.getUTCMonth();
  const priorYear = priorMonth === 0
    ? selectedDate.getUTCFullYear() - 1
    : selectedDate.getUTCFullYear();
  const priorMonthNum = priorMonth === 0 ? 12 : priorMonth;
  const priorStart = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
  const priorEnd = new Date(Date.UTC(priorYear, priorMonthNum, 0));
  const churnWindowStart = priorStart.toISOString().split("T")[0]!;
  const churnWindowEnd = priorEnd.toISOString().split("T")[0]!;

  const closedWonInPriorMonth = closedWonAll.filter((deal: any) => {
    const d = getDealDate(deal);
    return d && d >= churnWindowStart && d <= churnWindowEnd;
  });
  const optOutAgg = buildOptOutAggregation(
    churnedUsers, churnWindowStart, churnWindowEnd,
    closedWonInPriorMonth, OWNER_MAP, activeAEIds,
  );

  const optOutARR = optOutAgg.perAE[repId]?.optOutARR || 0;
  const optOutDeals: DealDetail[] = optOutAgg.perAE[repId]?.deals || [];
  const netARR = grossARR - optOutARR;

  const rampInfo = getAERampInfo(ae, selectedMonth);
  const { commission } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR, rampInfo.rampFactor);

  const dealSnapshot = [
    ...closedWonDeals,
    ...optOutDeals.map((d) => ({ ...d, value: -d.value })),
  ];

  return {
    dealSnapshot,
    closedWonDeals,
    optOutDeals,
    grossARR,
    optOutARR,
    netARR,
    commission,
    monthLabel,
  };
}
