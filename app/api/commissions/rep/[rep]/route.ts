import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA, BDR_DATA, calcAECommission, calcBDRCommission,
  getMonthRange, parseMonthParam, getAvailableMonths,
  buildOwnerMap, getActiveAEs,
} from "@/lib/commission-config";
import { fetchChurnedUsersFromUsersList, buildChurnAggregation, buildOptOutAggregation } from "@/lib/deals";
import { attioQuery, getVal } from "@/lib/attio";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/roles";

export const revalidate = 0;

const PAGE_SIZE = 500;

function getDealDate(deal: any): string | null {
  const closeDate = getVal(deal, "close_date");
  if (!closeDate) return null;
  return String(closeDate).slice(0, 10);
}

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

export async function GET(
  request: NextRequest,
  { params }: { params: { rep: string } }
) {
  const repId = params.rep;
  const monthParam = request.nextUrl.searchParams.get("month");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getUserRole(user.email);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (role.type === "rep" && role.repId !== repId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const validReps = ["jason", "kelcy", "max", "austin", "roy"];
  if (!validReps.includes(repId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const OWNER_MAP = buildOwnerMap();
    const { year, month } = parseMonthParam(monthParam);
    const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);
    const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

    // User-centric churn: fetch churned users with dates, attribute via deals
    const churnedUsers = await fetchChurnedUsersFromUsersList();

    const closedWonAll = await fetchAllDeals({ stage: "Closed Won" });
    const closedLostAll = await fetchAllDeals({ stage: "Closed Lost" });
    let introCallAll: any[] = [];
    try { introCallAll = await fetchAllDeals({ stage: "Introductory Call" }); } catch {}

    const filterByMonth = (deals: any[]) => deals.filter((deal: any) => {
      const d = getDealDate(deal);
      if (!d) return false;
      return d >= startISO && d <= endISO;
    });

    const wonInMonth = filterByMonth(closedWonAll);
    const lostInMonth = filterByMonth(closedLostAll);
    const introInMonth = filterByMonth(introCallAll);

    // Build churn aggregation from Users list → deals → AEs
    const activeAEs = getActiveAEs(selectedMonth);
    const activeAEIds = new Set(activeAEs.map(ae => ae.id));
    const churnAgg = buildChurnAggregation(
      churnedUsers, startISO, endISO,
      closedWonAll, OWNER_MAP, activeAEIds,
    );

    // Calculate prior month range for opt-out calculation (opt-outs lag by one month)
    const selectedDate = new Date(startISO);
    const priorMonth = selectedDate.getUTCMonth(); // 0-indexed, so this gives prior month
    const priorYear = priorMonth === 0 
      ? selectedDate.getUTCFullYear() - 1 
      : selectedDate.getUTCFullYear();
    const priorMonthNum = priorMonth === 0 ? 12 : priorMonth;
    const priorStart = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
    const priorEnd = new Date(Date.UTC(priorYear, priorMonthNum, 0));
    const priorStartISO = priorStart.toISOString().split("T")[0];
    const priorEndISO = priorEnd.toISOString().split("T")[0];

    // Build opt-out aggregation: deals where user churned within 30 days of close
    // Uses PRIOR month's churn dates so opt-out totals are finalized
    const optOutAgg = buildOptOutAggregation(
      churnedUsers, priorStartISO, priorEndISO,
      closedWonAll, OWNER_MAP, activeAEIds,
    );

    if (repId === "max") {
      let meetings = 0, introCallCount = 0;
      for (const deal of wonInMonth) {
        if (getVal(deal, "lead_owner") === process.env.ATTIO_MAX_UUID) meetings += 1;
      }
      for (const deal of introInMonth) {
        if (getVal(deal, "lead_owner") === process.env.ATTIO_MAX_UUID) introCallCount += 1;
      }
      const { commission, attainment } = calcBDRCommission(meetings);
      return NextResponse.json({
        rep: { id: "max", name: BDR_DATA.name, role: BDR_DATA.role, initials: BDR_DATA.initials, color: BDR_DATA.color, type: "bdr" },
        metrics: { netMeetings: meetings, monthlyTarget: BDR_DATA.monthlyQuota, attainment, commission, introCallsScheduled: introCallCount },
        meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth },
        availableMonths: getAvailableMonths(),
      });
    }

    const ae = AE_DATA.find((a) => a.id === repId);
    if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Count ALL Closed Won deals as gross ARR (no deal-level churn exclusion)
    let grossARR = 0, closedWonCount = 0, closedWonARR = 0;
    let closedLostCount = 0, closedLostARR = 0, introCallCount = 0;

    for (const deal of wonInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      const value = getVal(deal, "value") || 0;
      grossARR += value;
      closedWonCount += 1;
      closedWonARR += value;
    }

    for (const deal of lostInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      closedLostCount += 1; closedLostARR += getVal(deal, "value") || 0;
    }

    for (const deal of introInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      introCallCount += 1;
    }

    // Apply user-centric churn for this rep
    const repChurn = churnAgg.perAE[repId] || { churnCount: 0, churnARR: 0 };
    const churnedCount = repChurn.churnCount;
    const churnARR = repChurn.churnARR;

    // Apply opt-out data for this rep
    const repOptOut = optOutAgg.perAE[repId] || { optOutCount: 0, optOutARR: 0 };
    const optOutCount = repOptOut.optOutCount;
    const optOutARR = repOptOut.optOutARR;

    const netARR = grossARR - optOutARR;
    const { commission, attainment, tierBreakdown } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR);

    // Leaderboard uses opt-out data (not churn)
    const leaderboard = activeAEs.map((lbAe) => {
      let lbGross = 0;
      for (const deal of wonInMonth) {
        if (OWNER_MAP[getVal(deal, "owner")] !== lbAe.id) continue;
        lbGross += getVal(deal, "value") || 0;
      }
      const lbOptOutARR = optOutAgg.perAE[lbAe.id]?.optOutARR || 0;
      return { id: lbAe.id, name: lbAe.name, initials: lbAe.initials, color: lbAe.color, netARR: lbGross - lbOptOutARR };
    }).sort((a, b) => b.netARR - a.netARR);

    return NextResponse.json({
      rep: { id: ae.id, name: ae.name, role: ae.role, initials: ae.initials, color: ae.color, type: "ae" },
      metrics: {
        grossARR, churnARR, netARR, monthlyQuota: ae.monthlyQuota, attainment, commission,
        tierBreakdown: tierBreakdown.map((t) => ({ label: t.label, amount: t.amount })),
        introCallsScheduled: introCallCount,
        toBeOnboarded: { count: 0, arr: 0 },
        closedWon: { count: closedWonCount, arr: closedWonARR },
        closedLost: { count: closedLostCount, arr: closedLostARR },
        churned: { count: churnedCount, arr: churnARR },
        optOut: { count: optOutCount, arr: optOutARR },
        dealCount: closedWonCount, excludedCount: churnedCount,
      },
      leaderboard,
      meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth },
      availableMonths: getAvailableMonths(),
    });
  } catch (err: any) {
    console.error("Rep API error (" + repId + "):", err);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
