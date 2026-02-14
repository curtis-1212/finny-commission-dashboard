import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA,
  BDR_DATA,
  calcAECommission,
  calcBDRCommission,
  getMonthRange,
  parseMonthParam,
  getAvailableMonths,
  buildOwnerMap,
} from "@/lib/commission-config";
import { attioQuery, getVal, validateToken } from "@/lib/attio";

export const revalidate = 60;

// ─── Stage buckets ──────────────────────────────────────────────────────────
const CLOSED_WON_STAGES = ["Closed Won"];
const TO_BE_ONBOARDED_STAGES = ["To Be Onboarded"];
const CLOSED_LOST_STAGES = ["Closed Lost"];
const INTRO_CALL_STAGES = ["Introductory Call"];

// All stages we query — bucket server-side
const ALL_TRACKED_STAGES = [
  ...CLOSED_WON_STAGES,
  ...TO_BE_ONBOARDED_STAGES,
  ...CLOSED_LOST_STAGES,
  ...INTRO_CALL_STAGES,
  "Live",
];

// Helper: Attio $or for stages
function stageOr(stages: string[]) {
  return { "$or": stages.map((s) => ({ stage: s })) };
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

  const validReps = ["jason", "kelcy", "max"];
  if (!validReps.includes(repId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const OWNER_MAP = buildOwnerMap();
    const { year, month } = parseMonthParam(monthParam);
    const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);
    const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

    console.log(`Rep API (${repId}): querying ${monthLabel} (${startISO} → ${endISO})`);

    // ─── Query all tracked-stage deals for this month ───────────
    const dealsRes = await attioQuery("deals", {
      filter: {
        "$and": [
          { close_date: { "$gte": startISO, "$lte": endISO } },
          stageOr(ALL_TRACKED_STAGES),
        ],
      },
      limit: 500,
    });
    const deals = dealsRes?.data || [];

    console.log(`Rep API (${repId}): got ${deals.length} deals across all stages`);

    // ─── Churned people (graceful if slug doesn't exist) ────────
    let churnedSet = new Set<string>();
    try {
      const churnRes = await attioQuery("people", {
        filter: { churn_reason: { "$not_empty": true } },
        limit: 500,
      });
      churnedSet = new Set(
        (churnRes?.data || []).map((p: any) => p.id?.record_id).filter(Boolean)
      );
    } catch {
      console.warn(`Rep API (${repId}): churn_reason query failed — skipping churn detection`);
    }

    // ═══════════════════════════════════════════════════════════════
    // BDR PATH
    // ═══════════════════════════════════════════════════════════════
    if (repId === "max") {
      let meetings = 0;
      let introCallCount = 0;

      for (const deal of deals) {
        const leadOwner = getVal(deal, "lead_owner");
        if (leadOwner !== process.env.ATTIO_MAX_UUID) continue;

        const stage = getVal(deal, "stage") || "";

        // Intro calls: scheduled but demo hasn't happened yet
        if (INTRO_CALL_STAGES.includes(stage)) {
          introCallCount += 1;
        } else {
          // All other stages = demo happened = meeting credit
          meetings += 1;
        }
      }

      const { commission, attainment } = calcBDRCommission(meetings);

      return NextResponse.json({
        rep: {
          id: "max", name: BDR_DATA.name, role: BDR_DATA.role,
          initials: BDR_DATA.initials, color: BDR_DATA.color, type: "bdr",
        },
        metrics: {
          netMeetings: meetings,
          monthlyTarget: BDR_DATA.monthlyQuota,
          attainment,
          commission,
          introCallsScheduled: introCallCount,
        },
        meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth },
        availableMonths: getAvailableMonths(),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // AE PATH
    // ═══════════════════════════════════════════════════════════════
    const ae = AE_DATA.find((a) => a.id === repId);
    if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Bucket deals by stage for this rep
    let grossARR = 0;
    let churnARR = 0;
    let closedWonCount = 0, closedWonARR = 0;
    let closedLostCount = 0, closedLostARR = 0;
    let toBeOnboardedCount = 0, toBeOnboardedARR = 0;
    let churnedCount = 0;
    let introCallCount = 0;
    let totalDealCount = 0;

    for (const deal of deals) {
      const ownerUUID = getVal(deal, "owner");
      if (OWNER_MAP[ownerUUID] !== repId) continue;

      const value = getVal(deal, "value") || 0;
      const stage = getVal(deal, "stage") || "";
      const people = getVal(deal, "associated_people") || [];
      const isChurned = churnedSet.size > 0 &&
        Array.isArray(people) &&
        people.some((pid: string) => churnedSet.has(pid));

      // Intro calls
      if (INTRO_CALL_STAGES.includes(stage)) {
        introCallCount += 1;
        continue;
      }

      // Closed Lost
      if (CLOSED_LOST_STAGES.includes(stage)) {
        closedLostCount += 1;
        closedLostARR += value;
        continue;
      }

      // Commissionable stages: Closed Won, To Be Onboarded, Live
      totalDealCount += 1;
      grossARR += value;

      if (isChurned) {
        churnedCount += 1;
        churnARR += value;
      }

      if (CLOSED_WON_STAGES.includes(stage) || stage === "Live") {
        closedWonCount += 1;
        closedWonARR += value;
      } else if (TO_BE_ONBOARDED_STAGES.includes(stage)) {
        toBeOnboardedCount += 1;
        toBeOnboardedARR += value;
      }
    }

    // Net ARR = gross commissionable - churn (matches Excel)
    const netARR = grossARR - churnARR;
    const { commission, attainment, tierBreakdown } = calcAECommission(
      ae.monthlyQuota, ae.tiers, netARR
    );

    return NextResponse.json({
      rep: {
        id: ae.id, name: ae.name, role: ae.role,
        initials: ae.initials, color: ae.color, type: "ae",
      },
      metrics: {
        grossARR,
        churnARR,
        netARR,
        monthlyQuota: ae.monthlyQuota,
        attainment,
        commission,
        tierBreakdown: tierBreakdown.map((t) => ({
          label: t.label, amount: t.amount,
        })),
        // Pipeline breakdown
        introCallsScheduled: introCallCount,
        toBeOnboarded: { count: toBeOnboardedCount, arr: toBeOnboardedARR },
        closedWon: { count: closedWonCount, arr: closedWonARR },
        closedLost: { count: closedLostCount, arr: closedLostARR },
        churned: { count: churnedCount, arr: churnARR },
        dealCount: totalDealCount,
        excludedCount: churnedCount,
      },
      meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth },
      availableMonths: getAvailableMonths(),
    });
  } catch (err: any) {
    console.error(`Rep API error (${repId}):`, err);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
