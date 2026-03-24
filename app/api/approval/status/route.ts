import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { getUserRole, isExec } from "@/lib/roles";
import { getVerificationCycle, getAllApprovalStates } from "@/lib/approval";
import { parseMonthParam } from "@/lib/commission-config";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getUserRole(session.user.email);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get("month");
  const { year, month } = parseMonthParam(monthParam);
  const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

  try {
    const cycle = await getVerificationCycle(selectedMonth);

    if (!cycle) {
      return NextResponse.json({
        month: selectedMonth,
        cycleStarted: false,
        approvals: [],
        allApproved: false,
      });
    }

    const allStates = await getAllApprovalStates(selectedMonth);

    // Reps only see their own entry
    const approvals = (role.type === "rep")
      ? allStates.filter((s) => s.repId === role.repId)
      : allStates;

    const allApproved = allStates.every((s) => s.record?.approved === true);

    return NextResponse.json({
      month: selectedMonth,
      cycleStarted: true,
      startedAt: cycle.startedAt,
      approvals: approvals.map((s) => ({
        repId: s.repId,
        name: s.name,
        approved: s.record?.approved ?? false,
        approvedAt: s.record?.approvedAt ?? null,
      })),
      allApproved,
    });
  } catch (err: any) {
    console.error("Approval status error:", err);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
