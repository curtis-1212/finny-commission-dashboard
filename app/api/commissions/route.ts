import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA, BDR_DATA,
  getMonthRange, parseMonthParam, getAvailableMonths,
} from "@/lib/commission-config";
import { fetchMonthData } from "@/lib/deals";

export const revalidate = 60;

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
    const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);
    const selectedMonthStr = `${year}-${String(month).padStart(2, "0")}`;

    const data = await fetchMonthData(startISO, endISO, monthLabel, selectedMonthStr);

    return NextResponse.json(
      {
        ae: data.aeResults,
        bdr: data.bdrResult,
        meta: data.meta,
        availableMonths: getAvailableMonths(),
        mode: "live",
      },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err: any) {
    console.error("Exec API error:", err);
    return NextResponse.json({ error: "Failed to load commission data" }, { status: 500 });
  }
}
