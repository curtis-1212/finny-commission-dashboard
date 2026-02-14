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
            getActiveAEs,
} from "@/lib/commission-config";
import { attioQuery, getVal } from "@/lib/attio";

export const revalidate = 60;

// Stages that count as churn (customer stopped paying)
const CHURN_STAGES = ["Churned", "Closed Lost"];

export async function GET(request: NextRequest) {
            const useLive = request.nextUrl.searchParams.get("live") === "true";
            const monthParam = request.nextUrl.searchParams.get("month");

  if (!useLive) {
                return NextResponse.json({
                                reps: [
                                                  ...AE_DATA.map((ae) => ({
                                                                      id: ae.id, name: ae.name, role: ae.role,
                                                                      initials: ae.initials, color: ae.color, type: "ae",
                                                                      monthlyQuota: ae.monthlyQuota, annualQuota: ae.annualQuota,
                                                                      tierLabels: ae.tiers.map((t) => t.label),
                                                  })),
                                          {
                                                              id: BDR_DATA.id, name: BDR_DATA.name, role: BDR_DATA.role,
                                                              initials: BDR_DATA.initials, color: BDR_DATA.color, type: "bdr",
                                                              monthlyQuota: BDR_DATA.monthlyQuota,
                                          },
                                                ],
                                availableMonths: getAvailableMonths(),
                                mode: "manual",
                });
  }

  try {
                const OWNER_MAP = buildOwnerMap();
                const { year, month } = parseMonthParam(monthParam);
                const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);
                const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

              const activeAEs = getActiveAEs(selectedMonth);
                console.log(`Exec API: querying ${monthLabel} (${startISO} -> ${endISO}), ${activeAEs.length} active AEs`);

              // --- Query Closed Won deals ---
              let allDeals: any[] = [];
                let offset = 0;
                const PAGE_SIZE = 500;
                while (true) {
                                const page = await attioQuery("deals", {
                                                  filter: { stage: "Closed Won" },
                                                  limit: PAGE_SIZE,
                                                  offset,
                                });
                                const records = page?.data || [];
                                allDeals = allDeals.concat(records);
                                if (records.length < PAGE_SIZE) break;
                                offset += PAGE_SIZE;
                }
                console.log(`Exec API: got ${allDeals.length} Closed Won deals total`);

              // Filter by close_date in this month
              const deals = allDeals.filter((deal: any) => {
                              const closeDate = getVal(deal, "close_date")
                                || getVal(deal, "closed_date")
                                || getVal(deal, "expected_close_date");
                              if (!closeDate) return false;
                              const d = String(closeDate).slice(0, 10);
                              return d >= startISO && d <= endISO;
              });
                console.log(`Exec API: ${deals.length} deals after date filter`);

              // --- Query churned deals in this month ---
              let churnDeals: any[] = [];
                for (const churnStage of CHURN_STAGES) {
                                try {
                                                  let cOffset = 0;
                                                  while (true) {
                                                                      const page = await attioQuery("deals", {
                                                                                            filter: { stage: churnStage },
                                                                                            limit: PAGE_SIZE,
                                                                                            offset: cOffset,
                                                                      });
                                                                      const records = page?.data || [];
                                                                      churnDeals = churnDeals.concat(records);
                                                                      if (records.length < PAGE_SIZE) break;
                                                                      cOffset += PAGE_SIZE;
                                                  }
                                } catch (e) {
                                                  console.warn(`Exec API: churn stage "${churnStage}" query failed -- skipping.`, e);
                                }
                }

              // Filter churn deals by close_date in this month
              const churnDealsInMonth = churnDeals.filter((deal: any) => {
                              const closeDate = getVal(deal, "close_date")
                                || getVal(deal, "closed_date")
                                || getVal(deal, "expected_close_date");
                              if (!closeDate) return false;
                              const d = String(closeDate).slice(0, 10);
                              return d >= startISO && d <= endISO;
              });
                console.log(`Exec API: ${churnDeals.length} total churn deals, ${churnDealsInMonth.length} in month`);

              // --- Aggregate deals per AE ---
              const agg: Record<string, {
                              grossARR: number; churnARR: number; netARR: number;
                              dealCount: number; churnCount: number;
              }> = {};
                for (const ae of activeAEs) {
                                agg[ae.id] = { grossARR: 0, churnARR: 0, netARR: 0, dealCount: 0, churnCount: 0 };
                }

              // Count Closed Won deals
              for (const deal of deals) {
                              const ownerUUID = getVal(deal, "owner");
                              const aeId = OWNER_MAP[ownerUUID];
                              if (!aeId || !agg[aeId]) continue;
                              const value = getVal(deal, "value") || 0;
                              agg[aeId].grossARR += value;
                              agg[aeId].dealCount += 1;
              }

              // Subtract churn deals
              for (const deal of churnDealsInMonth) {
                              const ownerUUID = getVal(deal, "owner");
                              const aeId = OWNER_MAP[ownerUUID];
                              if (!aeId || !agg[aeId]) continue;
                              const value = getVal(deal, "value") || 0;
                              agg[aeId].churnARR += value;
                              agg[aeId].churnCount += 1;
              }

              // Net ARR = gross - churn
              for (const id of Object.keys(agg)) {
                              agg[id].netARR = agg[id].grossARR - agg[id].churnARR;
              }

              // Log per-AE breakdown
              for (const ae of activeAEs) {
                              const a = agg[ae.id];
                              if (a.dealCount > 0 || a.churnCount > 0) {
                                                console.log(`Exec API: ${ae.name}: ${a.dealCount} deals ($${a.grossARR}), ${a.churnCount} churns ($${a.churnARR}), net $${a.netARR}`);
                              }
              }

              // --- Calculate commissions per AE ---
              const aeResults = activeAEs.map((ae) => {
                              const a = agg[ae.id] || { grossARR: 0, churnARR: 0, netARR: 0, dealCount: 0, churnCount: 0 };
                              const { commission, attainment, tierBreakdown } = calcAECommission(
                                                ae.monthlyQuota, ae.tiers, a.netARR
                                              );
                              return {
                                                id: ae.id, name: ae.name, role: ae.role,
                                                initials: ae.initials, color: ae.color, type: "ae" as const,
                                                monthlyQuota: ae.monthlyQuota, annualQuota: ae.annualQuota,
                                                grossARR: a.grossARR, churnARR: a.churnARR, netARR: a.netARR,
                                                dealCount: a.dealCount, excludedCount: a.churnCount,
                                                attainment, commission,
                                                tierBreakdown: tierBreakdown.map((t) => ({
                                                                    label: t.label, amount: t.amount,
                                                })),
                              };
              });

              // --- BDR: count Max's qualified meetings ---
              let maxMeetings = 0;
                for (const deal of deals) {
                                const leadOwner = getVal(deal, "lead_owner");
                                if (leadOwner === process.env.ATTIO_MAX_UUID) {
                                                  maxMeetings += 1;
                                }
                }
                const { commission: bdrCommission, attainment: bdrAttainment } = calcBDRCommission(maxMeetings);

              const bdrResult = {
                              id: "max",
                              name: BDR_DATA.name, role: BDR_DATA.role,
                              initials: BDR_DATA.initials, color: BDR_DATA.color,
                              type: "bdr" as const,
                              monthlyQuota: BDR_DATA.monthlyQuota,
                              totalMeetings: maxMeetings, netMeetings: maxMeetings,
                              attainment: bdrAttainment, commission: bdrCommission,
              };

              const today = new Date().getUTCDate();
                const warning =
                                deals.length === 0 && today > 5
                    ? "No deals found for this month -- check Attio attribute slugs or date range"
                                  : undefined;

              return NextResponse.json(
                        {
                                          ae: aeResults, bdr: bdrResult,
                                          meta: {
                                                              fetchedAt: new Date().toISOString(),
                                                              dealCount: deals.length, monthLabel, selectedMonth, warning,
                                          },
                                          availableMonths: getAvailableMonths(), mode: "live",
                        },
                        { headers: { "Cache-Control": "private, s-maxage=60, stale-while-revalidate=60" } }
                            );
  } catch (err: any) {
                console.error("Commission API error:", err);
                return NextResponse.json(
                          { error: "Failed to fetch commission data. Check server logs." },
                          { status: 500 }
                              );
  }
}
