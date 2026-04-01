import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { getUserRole, isRep } from "@/lib/roles";
import { getVerificationCycle, submitApproval, markExecNotified, getAllApprovalStates } from "@/lib/approval";
import { AE_DATA, getActiveAEs, parseMonthParam } from "@/lib/commission-config";
import { sendSlackBlocks } from "@/lib/slack";
import { computeDealSnapshot } from "@/lib/deal-snapshot";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getUserRole(session.user.email);
  if (!role || !isRep(role)) {
    return NextResponse.json({ error: "Only reps can approve" }, { status: 403 });
  }

  const repId = role.repId;

  // BDR excluded
  const ae = AE_DATA.find((a) => a.id === repId);
  if (!ae) {
    return NextResponse.json({ error: "Only AEs can approve (BDR excluded)" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const monthStr = body.month || null;
    const { year, month } = parseMonthParam(monthStr);
    const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;

    // Verify cycle is active
    const cycle = await getVerificationCycle(selectedMonth);
    if (!cycle) {
      return NextResponse.json({ error: "No verification cycle active for this month" }, { status: 400 });
    }

    // Verify this AE is active for this month
    const activeAEs = getActiveAEs(selectedMonth);
    if (!activeAEs.find((a) => a.id === repId)) {
      return NextResponse.json({ error: "You are not an active AE for this month" }, { status: 403 });
    }

    // Compute deal snapshot using shared helper
    const snapshot = await computeDealSnapshot(repId, monthStr);

    const { allComplete } = await submitApproval(
      selectedMonth, repId, snapshot.dealSnapshot, snapshot.netARR, snapshot.commission,
    );

    // Notify exec that this individual AE has verified
    const allStatesForProgress = await getAllApprovalStates(selectedMonth);
    const approvedCount = allStatesForProgress.filter((s) => s.record?.approved === true).length;
    const totalCount = allStatesForProgress.length;
    const fmt = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    await sendSlackBlocks([
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *${ae.name}* verified their deals for *${snapshot.monthLabel}*\n💰 Commission to enter in Gusto: *${fmt(snapshot.commission)}* (Net ARR: ${fmt(snapshot.netARR)})\n📊 Progress: ${approvedCount} of ${totalCount} AEs complete`,
        },
      },
    ]);

    // If all AEs approved, notify exec via Slack with Gusto-ready summary
    if (allComplete) {
      const lines = allStatesForProgress.map(
        (s) => `• *${s.name}*: ${fmt(s.record?.commission ?? 0)}`
      ).join("\n");
      const totalComm = allStatesForProgress.reduce((sum, s) => sum + (s.record?.commission ?? 0), 0);

      await sendSlackBlocks([
        { type: "header", text: { type: "plain_text", text: `✅ All Commissions Approved — ${snapshot.monthLabel}` } },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `All AEs have verified their deal classifications for *${snapshot.monthLabel}*. Ready for payout.\n\n${lines}\n\n*Total: ${fmt(totalComm)}*`,
          },
        },
      ]);

      await markExecNotified(selectedMonth);
    }

    return NextResponse.json({ success: true, allComplete });
  } catch (err: any) {
    console.error("Approve error:", err);
    return NextResponse.json({ error: "Failed to submit approval" }, { status: 500 });
  }
}
