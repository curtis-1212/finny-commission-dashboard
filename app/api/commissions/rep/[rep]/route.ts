import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA, BDR_DATA, calcAECommission, calcBDRCommission,
  getMonthRange, parseMonthParam, getAvailableMonths,
  buildOwnerMap, getActiveAEs,
} from "@/lib/commission-config";
import { fetchChurnedRecordIdsFromUsersList, isChurnedDeal } from "@/lib/deals";
import { attioQuery, getVal, validateToken } from "@/lib/attio";

export const revalidate = 60;

const ONBOARDING_DATE_ATTR = "onboarding_date_1750812621";
const PAGE_SIZE = 500;

function getDealDate(deal: any): string | null {
  const onboardDate = getVal(deal, ONBOARDING_DATE_ATTR);
  const closeDate = getVal(deal, "close_date");
  const dateToUse = onboardDate || closeDate;
  if (!dateToUse) return null;
  return String(dateToUse).slice(0, 10);
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
  const token = request.nextUrl.searchParams.get("token");
  const monthParam = request.nextUrl.searchParams.get("month");

  if (!validateToken(repId, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const churnedRecordIds = await fetchChurnedRecordIdsFromUsersList();

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

    let grossARR = 0, churnARR = 0, closedWonCount = 0, closedWonARR = 0;
    let churnedCount = 0, closedLostCount = 0, closedLostARR = 0, introCallCount = 0;

    for (const deal of wonInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      const value = getVal(deal, "value") || 0;
      grossARR += value;
      if (isChurnedDeal(deal, churnedRecordIds)) { churnedCount += 1; churnARR += value; }
      else { closedWonCount += 1; closedWonARR += value; }
    }

    for (const deal of lostInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      closedLostCount += 1; closedLostARR += getVal(deal, "value") || 0;
    }

    for (const deal of introInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      introCallCount += 1;
    }

    const netARR = grossARR - churnARR;
    const { commission, attainment, tierBreakdown } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR);

    const activeAEs = getActiveAEs(selectedMonth);
    const leaderboard = activeAEs.map((lbAe) => {
      let lbGross = 0, lbChurn = 0;
      for (const deal of wonInMonth) {
        if (OWNER_MAP[getVal(deal, "owner")] !== lbAe.id) continue;
        const v = getVal(deal, "value") || 0;
        if (isChurnedDeal(deal, churnedRecordIds)) lbChurn += v; else lbGross += v;
      }
      return { id: lbAe.id, name: lbAe.name, initials: lbAe.initials, color: lbAe.color, netARR: lbGross - lbChurn };
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
