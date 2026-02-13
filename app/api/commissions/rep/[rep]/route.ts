import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA,
  BDR_DATA,
  getCurrentMonthRange,
  buildOwnerMap,
} from "@/lib/commission-config";
import { attioQuery, getVal, validateToken } from "@/lib/attio";

export const revalidate = 60;

// ─── Stage buckets ──────────────────────────────────────────────────────────
// Adjust these stage names to match your exact Attio stage values.
const CLOSED_WON_STAGES = ["Closed Won"];
const TO_BE_ONBOARDED_STAGES = ["To Be Onboarded"];
const CLOSED_LOST_STAGES = ["Closed Lost"];
const INTRO_CALL_STAGES = ["Introductory Call"];

// All stages we want to query — cast a wide net so we can bucket server-side
const ALL_TRACKED_STAGES = [
  ...CLOSED_WON_STAGES,
  ...TO_BE_ONBOARDED_STAGES,
  ...CLOSED_LOST_STAGES,
  ...INTRO_CALL_STAGES,
  "Live", // Also count as closed won for commission purposes
];

export async function GET(
  request: NextRequest,
  { params }: { params: { rep: string } }
) {
  const repId = params.rep;
  const token = request.nextUrl.searchParams.get("token");

  if (!validateToken(repId, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const validReps = ["jason", "kelcy", "max"];
  if (!validReps.includes(repId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const OWNER_MAP = buildOwnerMap();
    const { startISO, endISO, label: monthLabel } = getCurrentMonthRange();

    // ─── Query deals across all tracked stages for this month ───────
    const dealsRes = await attioQuery("deals", {
      filter: {
        close_date: { gte: startISO, lte: endISO },
        stage: { in: ALL_TRACKED_STAGES },
      },
      limit: 500,
    });
    const deals = dealsRes?.data || [];

    // ─── Query intro calls scheduled this month (may use a different
    //     date field like "scheduled_date" or "intro_call_date") ─────
    // We also query deals in Introductory Call stage separately in case
    // they don't have a close_date set yet but do have a scheduled date.
    let introCallDeals: any[] = [];
    try {
      const introRes = await attioQuery("deals", {
        filter: {
          stage: { in: INTRO_CALL_STAGES },
          // Try with close_date — update this slug if you use a different
          // date field like "intro_call_date" or "scheduled_date"
          close_date: { gte: startISO, lte: endISO },
        },
        limit: 500,
      });
      introCallDeals = introRes?.data || [];
    } catch {
      // If the query fails (wrong slug), fall back to filtering from main set
      introCallDeals = deals.filter((d: any) => {
        const stage = getVal(d, "stage");
        return INTRO_CALL_STAGES.includes(stage);
      });
    }

    // ─── Get churned people ─────────────────────────────────────────
    const churnRes = await attioQuery("people", {
      filter: { churn_reason: { is_not_empty: true } },
      limit: 500,
    });
    const churnedSet = new Set(
      (churnRes?.data || []).map((p: any) => p.id?.record_id).filter(Boolean)
    );

    // ═══════════════════════════════════════════════════════════════════
    // BDR PATH
    // ═══════════════════════════════════════════════════════════════════
    if (repId === "max") {
      let meetings = 0;
      // Count intro calls where Max is lead owner
      let introCallCount = 0;
      for (const deal of introCallDeals) {
        const leadOwner = getVal(deal, "lead_owner");
        if (leadOwner === process.env.ATTIO_MAX_UUID) introCallCount += 1;
      }
      // Count total meetings from all deal stages
      for (const deal of deals) {
        const leadOwner = getVal(deal, "lead_owner");
        if (leadOwner === process.env.ATTIO_MAX_UUID) meetings += 1;
      }

      const attainment = BDR_DATA.monthlyQuota > 0 ? meetings / BDR_DATA.monthlyQuota : 0;

      return NextResponse.json({
        rep: {
          id: "max", name: BDR_DATA.name, role: BDR_DATA.role,
          initials: BDR_DATA.initials, color: BDR_DATA.color, type: "bdr",
        },
        metrics: {
          netMeetings: meetings,
          monthlyTarget: BDR_DATA.monthlyQuota,
          attainment,
          introCallsScheduled: introCallCount,
        },
        meta: { fetchedAt: new Date().toISOString(), monthLabel },
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // AE PATH
    // ═══════════════════════════════════════════════════════════════════
    const ae = AE_DATA.find((a) => a.id === repId);
    if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Bucket deals by stage for this rep
    let netARR = 0;
    let closedWonCount = 0;
    let closedWonARR = 0;
    let closedLostCount = 0;
    let closedLostARR = 0;
    let toBeOnboardedCount = 0;
    let toBeOnboardedARR = 0;
    let churnedCount = 0;
    let churnedARR = 0;

    for (const deal of deals) {
      const ownerUUID = getVal(deal, "owner");
      if (OWNER_MAP[ownerUUID] !== repId) continue;

      const value = getVal(deal, "value") || 0;
      const stage = getVal(deal, "stage") || "";
      const people = getVal(deal, "associated_people") || [];
      const isChurned = Array.isArray(people) && people.some((pid: string) => churnedSet.has(pid));

      // Check churned first — applies across stages
      if (isChurned && (CLOSED_WON_STAGES.includes(stage) || stage === "Live")) {
        churnedCount += 1;
        churnedARR += value;
        continue; // Don't double-count in closed won
      }

      // Bucket by stage
      if (CLOSED_WON_STAGES.includes(stage) || stage === "Live") {
        closedWonCount += 1;
        closedWonARR += value;
        netARR += value;
      } else if (TO_BE_ONBOARDED_STAGES.includes(stage)) {
        toBeOnboardedCount += 1;
        toBeOnboardedARR += value;
        netARR += value; // These count toward quota
      } else if (CLOSED_LOST_STAGES.includes(stage)) {
        closedLostCount += 1;
        closedLostARR += value;
      }
    }

    // Count intro calls for this AE
    let introCallCount = 0;
    for (const deal of introCallDeals) {
      const ownerUUID = getVal(deal, "owner");
      if (OWNER_MAP[ownerUUID] === repId) introCallCount += 1;
    }

    const attainment = ae.monthlyQuota > 0 ? netARR / ae.monthlyQuota : 0;

    return NextResponse.json({
      rep: {
        id: ae.id, name: ae.name, role: ae.role,
        initials: ae.initials, color: ae.color, type: "ae",
      },
      metrics: {
        netARR,
        monthlyQuota: ae.monthlyQuota,
        attainment,
        // Pipeline breakdown
        introCallsScheduled: introCallCount,
        toBeOnboarded: { count: toBeOnboardedCount, arr: toBeOnboardedARR },
        closedWon: { count: closedWonCount, arr: closedWonARR },
        closedLost: { count: closedLostCount, arr: closedLostARR },
        churned: { count: churnedCount, arr: churnedARR },
      },
      meta: { fetchedAt: new Date().toISOString(), monthLabel },
    });
  } catch (err: any) {
    console.error(`Rep API error (${repId}):`, err);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}
