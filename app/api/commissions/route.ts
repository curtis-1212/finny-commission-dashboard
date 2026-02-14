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
import { attioQuery, getVal } from "@/lib/attio";

export const revalidate = 60;

// Commissionable stages: count toward quota
const COMMISSIONABLE_STAGES = ["Closed Won", "To Be Onboarded", "Live"];

// Helper: build Attio $or filter for stages
function stageOr(stages: string[]) {
  return { "$or": stages.map((s) => ({ stage: s })) };
}

export async function GET(request: NextRequest) {
  const useLive = request.nextUrl.searchParams.get("live") === "true";
  const monthParam = request.nextUrl.searchParams.get("month");

  // If not live, return config shape for manual mode + available months
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

  // ─── Live mode: pull from Attio ─────────────────────────────────────────
  try {
    const OWNER_MAP = buildOwnerMap();
    const { year, month } = parseMonthParam(monthParam);
    const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);

    console.log(`Exec API: querying ${monthLabel} (${startISO} → ${endISO})`);

    // ─── Query commissionable deals (stage filter only) ─────────────
    // NOTE: Attio silently ignores close_date filter (likely a list attribute),
    // so we fetch by stage only and filter dates in JavaScript.
    const dealsRes = await attioQuery("deals", {
      filter: stageOr(COMMISSIONABLE_STAGES),
      limit: 500,
    });
    const allDeals = dealsRes?.data || [];

    console.log(`Exec API: got ${allDeals.length} total commissionable deals (pre-date-filter)`);

    // ─── Client-side date filter ────────────────────────────────────
    // Try multiple possible date attribute slugs
    const deals = allDeals.filter((deal: any) => {
      const closeDate = getVal(deal, "close_date")
        || getVal(deal, "closed_date")
        || getVal(deal, "expected_close_date");
      if (!closeDate) return false;
      const d = String(closeDate).slice(0, 10); // "YYYY-MM-DD"
      return d >= startISO && d <= endISO;
    });

    // Diagnostic: log first few deals' date values to help debug
    if (allDeals.length > 0 && deals.length === 0) {
      const sample = allDeals.slice(0, 3).map((d: any) => {
        const vals = d?.values || {};
        const dateKeys = Object.keys(vals).filter(k =>
          k.includes("date") || k.includes("close") || k.includes("closed")
        );
        return { dateKeys, sampleValues: dateKeys.map(k => ({ [k]: vals[k]?.[0] })) };
      });
      console.warn("Exec API: 0 deals after date filter! Sample date fields:", JSON.stringify(sample, null, 2));
      console.warn("Exec API: All attribute keys on first deal:", Object.keys(allDeals[0]?.values || {}));
    }

    console.log(`Exec API: ${deals.length} deals after date filter (${startISO} → ${endISO})`);

    // ─── Get churned people (graceful if slug doesn't exist) ────────
    let churnedSet = new Set<string>();
    try {
      const churnRes = await attioQuery("people", {
        filter: { churn_reason: { "$not_empty": true } },
        limit: 500,
      });
      churnedSet = new Set(
        (churnRes?.data || []).map((p: any) => p.id?.record_id).filter(Boolean)
      );
      console.log(`Exec API: ${churnedSet.size} churned people found`);
    } catch (e) {
      console.warn("Exec API: churn_reason query failed — skipping churn detection.", e);
    }

    // ─── Aggregate deals per AE ───────────────────────────────────
    const agg: Record<string, {
      grossARR: number; churnARR: number; netARR: number;
      dealCount: number; excludedCount: number;
    }> = {};
    for (const ae of AE_DATA) {
      agg[ae.id] = { grossARR: 0, churnARR: 0, netARR: 0, dealCount: 0, excludedCount: 0 };
    }

    for (const deal of deals) {
      const ownerUUID = getVal(deal, "owner");
      const aeId = OWNER_MAP[ownerUUID];
      if (!aeId || !agg[aeId]) continue;

      const value = getVal(deal, "value") || 0;
      const people = getVal(deal, "associated_people") || [];
      const isChurned = churnedSet.size > 0 &&
        Array.isArray(people) &&
        people.some((pid: string) => churnedSet.has(pid));

      agg[aeId].grossARR += value;
      agg[aeId].dealCount += 1;

      if (isChurned) {
        agg[aeId].churnARR += value;
        agg[aeId].excludedCount += 1;
      }
    }

    // Net ARR = gross - churn (matches Excel logic)
    for (const id of Object.keys(agg)) {
      agg[id].netARR = agg[id].grossARR - agg[id].churnARR;
    }

    // ─── Calculate commissions per AE (using tiered rates) ────────
    const aeResults = AE_DATA.map((ae) => {
      const a = agg[ae.id];
      const { commission, attainment, tierBreakdown } = calcAECommission(
        ae.monthlyQuota, ae.tiers, a.netARR
      );
      return {
        id: ae.id, name: ae.name, role: ae.role,
        initials: ae.initials, color: ae.color, type: "ae" as const,
        monthlyQuota: ae.monthlyQuota, annualQuota: ae.annualQuota,
        grossARR: a.grossARR,
        churnARR: a.churnARR,
        netARR: a.netARR,
        dealCount: a.dealCount,
        excludedCount: a.excludedCount,
        attainment,
        commission,
        tierBreakdown: tierBreakdown.map((t) => ({
          label: t.label, amount: t.amount,
        })),
      };
    });

    // ─── BDR: count Max's qualified meetings ──────────────────────
    // Max gets credit for any deal where he's lead_owner AND demo happened
    // (i.e., stage is NOT Introductory Call)
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
      totalMeetings: maxMeetings,
      netMeetings: maxMeetings,
      attainment: bdrAttainment,
      commission: bdrCommission,
    };

    // ─── Sanity check ─────────────────────────────────────────────
    const today = new Date().getUTCDate();
    const warning =
      deals.length === 0 && today > 5
        ? "No deals found for this month — check Attio attribute slugs or date range"
        : undefined;

    return NextResponse.json(
      {
        ae: aeResults,
        bdr: bdrResult,
        meta: {
          fetchedAt: new Date().toISOString(),
          dealCount: deals.length,
          monthLabel,
          selectedMonth: `${year}-${String(month).padStart(2, "0")}`,
          warning,
        },
        availableMonths: getAvailableMonths(),
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
    return NextResponse.json(
      { error: "Failed to fetch commission data. Check server logs." },
      { status: 500 }
    );
  }
}
