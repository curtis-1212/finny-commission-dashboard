import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  AE_DATA, BDR_DATA, calcAECommission, calcBDRCommission,
  getMonthRange, parseMonthParam, getAvailableMonths,
  buildOwnerMap, getActiveAEs,
} from "@/lib/commission-config";
import { fetchChurnedUsersFromUsersList, buildChurnAggregation, buildOptOutAggregation, fetchAllDeals, getDemoHeldDate, getDealPersonIds, getScheduledOnboardingDate, getDealStage, type DealDetail } from "@/lib/deals";
import { attioQuery, getVal } from "@/lib/attio";
import { authOptions } from "@/lib/auth";
import { getUserRole } from "@/lib/roles";

export const revalidate = 0;

function getDealDate(deal: any): string | null {
  const closeDate = getVal(deal, "close_date");
  if (!closeDate) return null;
  return String(closeDate).slice(0, 10);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { rep: string } }
) {
  const repId = params.rep;
  const monthParam = request.nextUrl.searchParams.get("month");

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getUserRole(session.user.email);
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
    let toBeOnboardedAll: any[] = [];
    try { toBeOnboardedAll = await fetchAllDeals({ stage: "To Be Onboarded" }); } catch {}

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

    // Opt-out aggregation: for a given reporting month, opt-outs are driven by
    // churn_request_date in the previous calendar month. A deal is an opt-out
    // for the reporting month if its linked user has churn_request_date in that
    // prior month window and the churn date is within 30 days of the deal's
    // close_date.
    const selectedDate = new Date(startISO);
    const priorMonth = selectedDate.getUTCMonth(); // 0-indexed, gives prior month
    const priorYear = priorMonth === 0
      ? selectedDate.getUTCFullYear() - 1
      : selectedDate.getUTCFullYear();
    const priorMonthNum = priorMonth === 0 ? 12 : priorMonth;
    const priorStart = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
    const priorEnd = new Date(Date.UTC(priorYear, priorMonthNum, 0));
    const churnWindowStart = priorStart.toISOString().split("T")[0];
    const churnWindowEnd = priorEnd.toISOString().split("T")[0];

    const closedWonInPriorMonth = closedWonAll.filter((deal: any) => {
      const d = getDealDate(deal);
      if (!d) return false;
      return d >= churnWindowStart && d <= churnWindowEnd;
    });
    const optOutAgg = buildOptOutAggregation(
      churnedUsers, churnWindowStart, churnWindowEnd,
      closedWonInPriorMonth, OWNER_MAP, activeAEIds,
    );

    if (repId === "max") {
      // BDR meetings: count deals where BDR is lead_owner and demo_held_date is in this month
      const allDeals = await fetchAllDeals({});
      const demoInMonth = allDeals.filter((deal: any) => {
        const d = getDemoHeldDate(deal);
        if (!d) return false;
        return d >= startISO && d <= endISO;
      });
      
      let meetings = 0, introCallCount = 0;
      for (const deal of demoInMonth) {
        if (getVal(deal, "lead_owner") === process.env.ATTIO_MAX_UUID) meetings += 1;
      }
      for (const deal of introInMonth) {
        if (getVal(deal, "lead_owner") === process.env.ATTIO_MAX_UUID) introCallCount += 1;
      }
      const { commission, attainment, monthlyQuota } = calcBDRCommission(meetings, selectedMonth);
      return NextResponse.json({
        rep: { id: "max", name: BDR_DATA.name, role: BDR_DATA.role, initials: BDR_DATA.initials, color: BDR_DATA.color, type: "bdr" },
        metrics: { netMeetings: meetings, monthlyTarget: monthlyQuota, attainment, commission, introCallsScheduled: introCallCount },
        meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth },
        availableMonths: getAvailableMonths(),
      });
    }

    const ae = AE_DATA.find((a) => a.id === repId);
    if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Count ALL Closed Won deals as gross ARR (no deal-level churn exclusion)
    let grossARR = 0, closedWonCount = 0, closedWonARR = 0;
    let closedLostCount = 0, closedLostARR = 0, introCallCount = 0;
    let toBeOnboardedCount = 0, toBeOnboardedARR = 0;
    const closedWonDealDetails: DealDetail[] = [];

    for (const deal of wonInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      const value = getVal(deal, "value") || 0;
      const closeDate = getDealDate(deal) || "";
      const dealName = getVal(deal, "name") || "Unnamed Deal";
      grossARR += value;
      closedWonCount += 1;
      closedWonARR += value;
      closedWonDealDetails.push({ name: String(dealName), value, closeDate });
    }

    for (const deal of lostInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      closedLostCount += 1; closedLostARR += getVal(deal, "value") || 0;
    }

    for (const deal of introInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      introCallCount += 1;
    }

    // To Be Onboarded: current pipeline deals (not filtered by month)
    for (const deal of toBeOnboardedAll) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      toBeOnboardedCount += 1;
      toBeOnboardedARR += getVal(deal, "value") || 0;
    }

    // Apply user-centric churn for this rep
    const repChurn = churnAgg.perAE[repId] || { churnCount: 0, churnARR: 0 };
    const churnedCount = repChurn.churnCount;
    const churnARR = repChurn.churnARR;

    // Apply opt-out data for this rep
    const repOptOut = optOutAgg.perAE[repId] || { optOutCount: 0, optOutARR: 0, deals: [] };
    const optOutCount = repOptOut.optOutCount;
    const optOutARR = repOptOut.optOutARR;
    const optOutDealDetails: DealDetail[] = repOptOut.deals || [];

    // Close rates: cohort-based — of demos held this month, how many converted?
    // Match demo deals to CW/TBO deals via shared associated_people person IDs.
    const allDeals = await fetchAllDeals({});
    const demosInMonth = allDeals.filter((deal: any) => {
      const d = getDemoHeldDate(deal);
      if (!d) return false;
      return d >= startISO && d <= endISO;
    });

    // Collect person IDs from this rep's demos
    const demoPeople = new Set<string>();
    for (const deal of demosInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      for (const pid of getDealPersonIds(deal)) demoPeople.add(pid);
    }
    const demoCount = demoPeople.size;

    // Build sets of person IDs that reached CW (all time) or are in TBO
    const cwPersonIds = new Set<string>();
    for (const deal of closedWonAll) {
      for (const pid of getDealPersonIds(deal)) cwPersonIds.add(pid);
    }
    const tboPersonIds = new Set<string>();
    for (const deal of toBeOnboardedAll) {
      for (const pid of getDealPersonIds(deal)) tboPersonIds.add(pid);
    }

    let cwConverted = 0, tboConverted = 0;
    for (const pid of Array.from(demoPeople)) {
      if (cwPersonIds.has(pid)) cwConverted++;
      if (cwPersonIds.has(pid) || tboPersonIds.has(pid)) tboConverted++;
    }
    const cwRate = demoCount > 0 ? cwConverted / demoCount : null;
    const tboRate = demoCount > 0 ? tboConverted / demoCount : null;

    const netARR = grossARR - optOutARR;
    const { commission, attainment, tierBreakdown } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR);

    // ─── Forecast segments (current month only) ──────────────────────────
    const nowUtc = new Date();
    const currentMonthValue = `${nowUtc.getUTCFullYear()}-${String(nowUtc.getUTCMonth() + 1).padStart(2, "0")}`;
    const isCurrentMonth = selectedMonth === currentMonthValue;
    let forecast: { closedWonARR: number; scheduledToCloseARR: number; opportunitiesARR: number; quota: number } | undefined;

    if (isCurrentMonth) {
      const todayISO = nowUtc.toISOString().split("T")[0];
      let scheduledToCloseARR = 0;
      let opportunitiesARR = 0;

      // TBO deals: split into scheduled-to-close vs opportunities
      for (const deal of toBeOnboardedAll) {
        if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
        const schedDate = getScheduledOnboardingDate(deal);
        const value = getVal(deal, "value") || 0;

        if (schedDate && schedDate >= todayISO && schedDate <= endISO) {
          scheduledToCloseARR += value;
        } else {
          // No date, date in the past, or date after this month
          opportunitiesARR += value;
        }
      }

      // Demo held but not progressed to TBO/CW/CL
      const excludedStages = new Set(["Closed Won", "To Be Onboarded", "Closed Lost"]);
      for (const deal of allDeals) {
        if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
        const stage = getDealStage(deal);
        if (stage && excludedStages.has(stage)) continue;
        if (!getDemoHeldDate(deal)) continue;
        opportunitiesARR += getVal(deal, "value") || 0;
      }

      forecast = { closedWonARR: netARR, scheduledToCloseARR, opportunitiesARR, quota: ae.monthlyQuota };
    }

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
        toBeOnboarded: { count: toBeOnboardedCount, arr: toBeOnboardedARR },
        closedWon: { count: closedWonCount, arr: closedWonARR },
        closedLost: { count: closedLostCount, arr: closedLostARR },
        churned: { count: churnedCount, arr: churnARR },
        optOut: { count: optOutCount, arr: optOutARR },
        demoCount,
        cwRate,
        tboRate,
        dealCount: closedWonCount, excludedCount: churnedCount,
        closedWonDeals: closedWonDealDetails,
        optOutDeals: optOutDealDetails,
        forecast,
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
