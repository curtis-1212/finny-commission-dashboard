import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA, BDR_DATA,
  getMonthRange, parseMonthParam, getAvailableMonths,
} from "@/lib/commission-config";
import { fetchMonthData } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/roles";

export const revalidate = 0;  // always fresh -- churn data must reflect opt-out window

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getUserRole(user.email);
  if (!role || role.type !== "exec") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: any) {
    console.error("Exec API error:", err);
    return NextResponse.json({ error: "Failed to load commission data" }, { status: 500 });
  }
}
