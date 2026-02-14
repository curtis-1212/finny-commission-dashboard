import { NextRequest, NextResponse } from "next/server";
import {
    AE_DATA,
    BDR_DATA,
    calcAECommission,
    calcBDRCommission,
    fmt,
    getCurrentMonthRange,
    buildOwnerMap,
} from "@/lib/commission-config";
import { attioQuery, getVal } from "@/lib/attio";

export const revalidate = 60;

export async function GET(request: NextRequest) {
    const useLive = request.nextUrl.searchParams.get("live") === "true";

  // If not live, return the config shape for manual mode
  if (!useLive) {
        return NextResponse.json({
                reps: [
                          ...AE_DATA.map((ae) => ({
                                      id: ae.id,
                                      name: ae.name,
                                      role: ae.role,
                                      initials: ae.initials,
                                      color: ae.color,
                                      type: "ae",
                                      monthlyQuota: ae.monthlyQuota,
                                      annualQuota: ae.annualQuota,
                                      // Expose tier labels but NOT rates for the rate card footer
                                      tierLabels: ae.tiers.map((t) => t.label),
                          })),
                  {
                              id: BDR_DATA.id,
                              name: BDR_DATA.name,
                              role: BDR_DATA.role,
                              initials: BDR_DATA.initials,
                              color: BDR_DATA.color,
                              type: "bdr",
                              monthlyQuota: BDR_DATA.monthlyQuota,
                  },
                        ],
                mode: "manual",
        });
  }

  // -- Live mode: pull from Attio --
  try {
        const OWNER_MAP = buildOwnerMap();
        const { startISO, endISO, label: monthLabel } = getCurrentMonthRange();

      // Query Attio for deals closed this month
      const dealsRes = await attioQuery("deals", {
              filter: {
                        "$and": [
                          { close_date: { "$gte": startISO, "$lte": endISO } },
                            { "$or": [{ stage: "Closed Won" }, { stage: "To Be Onboarded" }] },
                                  ],
              },
              limit: 500,
      });
        const deals = dealsRes?.data || [];

    // Query churned people
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

      // -- Aggregate deals per AE --
      const agg: Record<string, { grossARR: number; churnARR: number; dealCount: number; excludedCount: number }> = {};
        for (const ae of AE_DATA) agg[ae.id] = { grossARR: 0, churnARR: 0, dealCount: 0, excludedCount: 0 };

      for (const deal of deals) {
              const ownerUUID = getVal(deal, "owner");
              const aeId = OWNER_MAP[ownerUUID];
              if (!aeId || !agg[aeId]) continue;

          const value = getVal(deal, "value") || 0;
              const people = getVal(deal, "associated_people") || [];
              const isChurned =
                        Array.isArray(people) &&
                        people.some((pid: string) => churnedSet.has(pid));

          if (isChurned) {
                    agg[aeId].churnARR += value;
                    agg[aeId].excludedCount += 1;
          } else {
                    agg[aeId].grossARR += value;
                    agg[aeId].dealCount += 1;
          }
                    }

      // Build AE results
      const aeResults = AE_DATA.map((ae) => {
              const a = agg[ae.id];
              const netARR = a.grossARR - a.churnARR;
              const { commission, attainment, tierBreakdown } = calcAECommission(
                        ae.monthlyQuota,
                        ae.tiers,
                        netARR
                      );
              return {
                        id: ae.id,
                        name: ae.name,
                        role: ae.role,
                        initials: ae.initials,
                        color: ae.color,
                        type: "ae" as const,
                        monthlyQuota: ae.monthlyQuota,
                        annualQuota: ae.annualQuota,
                        grossARR: a.grossARR + a.churnARR,
                        churnARR: a.churnARR,
                        netARR,
                        dealCount: a.dealCount,
                        excludedCount: a.excludedCount,
                        attainment,
                        commission,
                        tierBreakdown: tierBreakdown.map((t) => ({
                                    label: t.label,
                                    amount: t.amount,
                        })),
              };
      });

      // -- BDR: count Max's meetings --
      let maxMeetings = 0;
        for (const deal of deals) {
                const leadOwner = getVal(deal, "lead_owner");
                if (leadOwner === process.env.ATTIO_MAX_UUID) maxMeetings += 1;
        }

      const { commission: bdrCommission, attainment: bdrAttainment } = calcBDRCommission(maxMeetings);

      const bdrResult = {
              id: "max",
              name: BDR_DATA.name,
              role: BDR_DATA.role,
              initials: BDR_DATA.initials,
              color: BDR_DATA.color,
              type: "bdr" as const,
              monthlyQuota: BDR_DATA.monthlyQuota,
              netMeetings: maxMeetings,
              attainment: bdrAttainment,
              commission: bdrCommission,
      };

      // -- Sanity check --
      const today = new Date().getUTCDate();
        const warning =
                deals.length === 0 && today > 5
            ? "No deals found for this month - check Attio attribute slugs"
                  : undefined;

      return NextResponse.json(
        {
                  ae: aeResults,
                  bdr: bdrResult,
                  meta: {
                              fetchedAt: new Date().toISOString(),
                              dealCount: deals.length,
                              monthLabel,
                              warning,
                  },
                  mode: "live",
        },
        {
                  headers: {
                              "Cache-Control": "private, s-maxage=60, stale-while-revalidate=60",
                  },
        }
            );
  } catch (err: any) {
        console.error("Commission API error:", err);
        // FIX: Generic error message - don't leak Attio internals
      return NextResponse.json(
        { error: "Failed to fetch commission data. Check server logs." },
        { status: 500 }
            );
  }
}
