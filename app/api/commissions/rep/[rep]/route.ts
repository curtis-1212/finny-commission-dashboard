import { NextRequest, NextResponse } from "next/server";
import {
        AE_DATA,
        BDR_DATA,
        getCurrentMonthRange,
        buildOwnerMap,
} from "@/lib/commission-config";
import { attioQuery, getVal, validateToken } from "@/lib/attio";

export const revalidate = 60;

// --- Stage buckets (must match exact Attio Deal stage names) ---
const CLOSED_WON_STAGES = ["Closed Won"];
const TO_BE_ONBOARDED_STAGES = ["To Be Onboarded"];
const CLOSED_LOST_STAGES = ["Closed Lost"];
const INTRO_CALL_STAGES = ["Introductory Call"];

const ALL_TRACKED_STAGES = [
  ...CLOSED_WON_STAGES,
  ...TO_BE_ONBOARDED_STAGES,
  ...CLOSED_LOST_STAGES,
  ...INTRO_CALL_STAGES,
  "Live",
];

function stageFilter(stages: string[]) {
        if (stages.length === 1) return { stage: stages[0] };
        return { "$or": stages.map((s) => ({ stage: s })) };
}

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

          const dealsRes = await attioQuery("deals", {
                      filter: {
                                    "$and": [
                                          { close_date: { "$gte": startISO, "$lte": endISO } },
                                                    stageFilter(ALL_TRACKED_STAGES),
                                                  ],
                      },
                      limit: 500,
          });
            const deals = dealsRes?.data || [];

const introCallDeals = deals.filter((d: any) => {
  const stage = getVal(d, "stage");
  return INTRO_CALL_STAGES.includes(stage);
});
          // Try to get churned people (non-fatal if attribute doesn't exist)
          let churnedSet = new Set<string>();
            try {
                        const churnRes = await attioQuery("people", {
                                      filter: { cause_of_churn: { "$not_empty": true } },
                                      limit: 500,
                        });
                        churnedSet = new Set(
                                      (churnRes?.data || []).map((p: any) => p.id?.record_id).filter(Boolean)
                                    );
            } catch {
                        // cause_of_churn attribute may not exist - skip churn detection
            }

          // === BDR PATH ===
          if (repId === "max") {
                      let meetings = 0;
                      let introCallCount = 0;
                      for (const deal of introCallDeals) {
                                    const leadOwner = getVal(deal, "lead_owner");
                                    if (leadOwner === process.env.ATTIO_MAX_UUID) introCallCount += 1;
                      }
                     for (const deal of deals) {
  const leadOwner = getVal(deal, "lead_owner");
  if (leadOwner !== process.env.ATTIO_MAX_UUID) continue;
  const stage = getVal(deal, "stage") || "";
  if (!INTRO_CALL_STAGES.includes(stage)) {
    meetings += 1;
  }
}
                                                                   const attainment =
                                                                                 BDR_DATA.monthlyQuota > 0 ? meetings / BDR_DATA.monthlyQuota : 0;

              return NextResponse.json({
                            rep: {
                                            id: "max",
                                            name: BDR_DATA.name,
                                            role: BDR_DATA.role,
                                            initials: BDR_DATA.initials,
                                            color: BDR_DATA.color,
                                            type: "bdr",
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

          // === AE PATH ===
          const ae = AE_DATA.find((a) => a.id === repId);
            if (!ae) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
                      const isChurned =
                                    Array.isArray(people) &&
                                    people.some((pid: string) => churnedSet.has(pid));

              if (isChurned && CLOSED_WON_STAGES.includes(stage)) {
                            churnedCount += 1;
                            churnedARR += value;
                            continue;
              }

              if (CLOSED_WON_STAGES.includes(stage)) {
                            closedWonCount += 1;
                            closedWonARR += value;
                            netARR += value;
              } else if (TO_BE_ONBOARDED_STAGES.includes(stage)) {
                            toBeOnboardedCount += 1;
                            toBeOnboardedARR += value;
                            netARR += value;
              } else if (CLOSED_LOST_STAGES.includes(stage)) {
                            closedLostCount += 1;
                            closedLostARR += value;
              }
          }

          let introCallCount = 0;
            for (const deal of introCallDeals) {
                        const ownerUUID = getVal(deal, "owner");
                        if (OWNER_MAP[ownerUUID] === repId) introCallCount += 1;
            }

          const attainment = ae.monthlyQuota > 0 ? netARR / ae.monthlyQuota : 0;

          return NextResponse.json({
                      rep: {
                                    id: ae.id,
                                    name: ae.name,
                                    role: ae.role,
                                    initials: ae.initials,
                                    color: ae.color,
                                    type: "ae",
                      },
                      metrics: {
                                    netARR,
                                    monthlyQuota: ae.monthlyQuota,
                                    attainment,
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
