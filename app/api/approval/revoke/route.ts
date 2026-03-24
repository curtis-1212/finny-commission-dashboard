import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { getUserRole, isRep } from "@/lib/roles";
import { getVerificationCycle, revokeApproval } from "@/lib/approval";
import { AE_DATA, getActiveAEs, parseMonthParam } from "@/lib/commission-config";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getUserRole(session.user.email);
  if (!role || !isRep(role)) {
    return NextResponse.json({ error: "Only reps can revoke" }, { status: 403 });
  }

  const repId = role.repId;
  const ae = AE_DATA.find((a) => a.id === repId);
  if (!ae) {
    return NextResponse.json({ error: "Only AEs can revoke" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const monthStr = body.month || null;
    const { year, month } = parseMonthParam(monthStr);
    const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

    const cycle = await getVerificationCycle(selectedMonth);
    if (!cycle) {
      return NextResponse.json({ error: "No verification cycle active" }, { status: 400 });
    }

    const activeAEs = getActiveAEs(selectedMonth);
    if (!activeAEs.find((a) => a.id === repId)) {
      return NextResponse.json({ error: "Not an active AE for this month" }, { status: 403 });
    }

    const result = await revokeApproval(selectedMonth, repId);
    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Revoke error:", err);
    return NextResponse.json({ error: "Failed to revoke approval" }, { status: 500 });
  }
}
