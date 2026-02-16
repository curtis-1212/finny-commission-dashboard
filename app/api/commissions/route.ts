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
const CHURN_STAGES = ["Closed Lost"];

// Stages that count as demos held
const DEMO_STAGES = ["Introductory Call"];

// The Attio attribute slug for the onboarding date
const ONBOARDING_DATE_ATTR = "onboarding_date_1750812621";

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
                        },
                              ],
                    availableMonths: getAvailableMonths(),
                    mode: "static",
          });
  }

  try {
          const { year, month } = parseMonthParam(monthParam);
          const { startISO, endISO, label: monthLabel, month: selectedMonth } = getMonthRange(year, month);
          const selectedMonthStr = `${year}-${String(month).padStart(2, "0")}`;
          const OWNER_MAP = buildOwnerMap();
          const activeAEs = getActiveAEs(selectedMonthStr);
          console.log(`Exec API: querying ${monthLabel} (${startISO} -> ${endISO}), ${activeAEs.length} active AEs`);
          console.log(`Exec API: OWNER_MAP: ${JSON.stringify(Object.entries(OWNER_MAP))}`);

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

        // Debug: log sample deal attributes
        if (allDeals.length > 0) {
                  const sample = allDeals[0];
                  const attrs = sample?.values ? Object.keys(sample.values) : [];
                  console.log(`Exec API: sample deal attrs: ${attrs.slice(0, 25).join(", ")}`);
                  const onbVal = getVal(sample, ONBOARDING_DATE_ATTR);
                  const closeVal = getVal(sample, "close_date");
                  const ownerVal = getVal(sample, "owner");
                  console.log(`Exec API: sample - onboard: ${onbVal}, close: ${closeVal}, owner: ${ownerVal}`);
        }

        // Filter by onboarding_date with fallback to close_date
        const deals = allDeals.filter((deal: any) => {
                  const onboardDate = getVal(deal, ONBOARDING_DATE_ATTR);
                  const closeDate = getVal(deal, "close_date");
                  const dateToUse = onboardDate || closeDate;
                  if (!dateToUse) return false;
                  const d = String(dateToUse).slice(0, 10);
                  return d >= startISO && d <= endISO;
        });
          console.log(`Exec API: ${deals.length} deals after date filter (onboarding_date with close_date fallback)`);

        // Count deals without any usable date
        const noDate = allDeals.filter((d: any) => !getVal(d, ONBOARDING_DATE_ATTR) && !getVal(d, "close_date")).length;
          console.log(`Exec API: ${noDate} deals have NO usable date`);

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

        // Filter churn deals by date in this month (same fallback logic)
        const churnDealsInMonth = churnDeals.filter((deal: any) => {
                  const onboardDate = getVal(deal, ONBOARDING_DATE_ATTR);
                  const closeDate = getVal(deal, "close_date");
                  const dateToUse = onboardDate || closeDate;
                  if (!dateToUse) return false;
                  const d = String(dateToUse).slice(0, 10);
                  return d >= startISO && d <= endISO;
        });
          console.log(`Exec API: ${churnDeals.length} total churn deals, ${churnDealsInMonth.length} in month`);

        // --- Query demo (Introductory Call) deals ---
        let demoDeals: any[] = [];
          for (const demoStage of DEMO_STAGES) {
                    try {
                                let dOffset = 0;
                                while (true) {
                                              const page = await attioQuery("deals", {
                                                              filter: { stage: demoStage },
                                                              limit: PAGE_SIZE,
                                                              offset: dOffset,
                                              });
                                              const records = page?.data || [];
                                              demoDeals = demoDeals.concat(records);
                                              if (records.length < PAGE_SIZE) break;
                                              dOffset += PAGE_SIZE;
                                }
                    } catch (e) {
                                console.warn(`Exec API: demo stage "${demoStage}" query failed -- skipping.`, e);
                    }
          }
          // Filter demos by date in this month (same fallback logic)
        const demosInMonth = demoDeals.filter((deal: any) => {
                  const onboardDate = getVal(deal, ONBOARDING_DATE_ATTR);
                  const closeDate = getVal(deal, "close_date");
                  const dateToUse = onboardDate || closeDate;
                  if (!dateToUse) return false;
                  const d = String(dateToUse).slice(0, 10);
                  return d >= startISO && d <= endISO;
        });
          console.log(`Exec API: ${demoDeals.length} total demo deals, ${demosInMonth.length} in month`);

        // --- Aggregate deals per AE ---
        const agg: Record<string, {
                  grossARR: number; churnARR: number; netARR: number;
                  dealCount: number; churnCount: number; demoCount: number;
        }> = {};
          for (const ae of activeAEs) {
                    agg[ae.id] = { grossARR: 0, churnARR: 0, netARR: 0, dealCount: 0, churnCount: 0, demoCount: 0 };
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

        // Count demo deals per AE
        for (const deal of demosInMonth) {
                  const ownerUUID = getVal(deal, "owner");
                  const aeId = OWNER_MAP[ownerUUID];
                  if (!aeId || !agg[aeId]) continue;
                  agg[aeId].demoCount += 1;
        }

        // Net ARR = gross - churn
        for (const id of Object.keys(agg)) {
                  agg[id].netARR = agg[id].grossARR - agg[id].churnARR;
        }

        // Log per-AE breakdown
        for (const ae of activeAEs) {
                  const a = agg[ae.id];
                  if (a.dealCount > 0 || a.churnCount > 0) {
                              console.log(`Exec API: ${ae.name}: ${a.dealCount} deals ($${a.grossARR}), ${a.churnCount} churns ($${a.churnARR}), net $${a.netARR}, ${a.demoCount} demos`);
                  }
        }

        // --- Calculate commissions per AE ---
        const aeResults = activeAEs.map((ae) => {
                  const a = agg[ae.id] || { grossARR: 0, churnARR: 0, netARR: 0, dealCount: 0, churnCount: 0, demoCount: 0 };
                  const { commission, attainment, tierBreakdown } = calcAECommission(
                              ae.monthlyQuota, ae.tiers, a.netARR,
                            );
                  // Calculate close/win rate: won / (won + lost)
                                              const totalDecided = a.dealCount + a.churnCount;
                  const cwRate = totalDecided > 0 ? a.dealCount / totalDecided : null;
                  return {
                              id: ae.id, name: ae.name, role: ae.role,
                              initials: ae.initials, color: ae.color, type: "ae" as const,
                              monthlyQuota: ae.monthlyQuota, annualQuota: ae.annualQuota,
                              grossARR: a.grossARR, churnARR: a.churnARR, netARR: a.netARR,
                              dealCount: a.dealCount, excludedCount: a.churnCount,
                              demoCount: a.demoCount,
                              cwRate,
                              attainment, commission,
                              tierBreakdown: tierBreakdown.map((t) => ({ label: t.label, amount: t.amount })),
                  };
        });

        // --- BDR (Max) meetings ---
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
            { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } },
                );
  } catch (err: any) {
          console.error("Exec API error:", err);
          return NextResponse.json({ error: "Failed to load commission data" }, { status: 500 });
  }
}
