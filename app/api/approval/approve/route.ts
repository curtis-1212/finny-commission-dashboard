import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { getUserRole, isRep } from "@/lib/roles";
import { getVerificationCycle, submitApproval, markExecNotified, getAllApprovalStates } from "@/lib/approval";
import {
  AE_DATA, buildOwnerMap, getActiveAEs, getMonthRange,
  parseMonthParam, calcAECommission,
} from "@/lib/commission-config";
import {
  fetchChurnedUsersFromUsersList, buildOptOutAggregation,
  fetchAllDeals, type DealDetail,
} from "@/lib/deals";
import { getVal } from "@/lib/attio";
import { sendSlackBlocks } from "@/lib/slack";

export const revalidate = 0;

function getDealDate(deal: any): string | null {
  const closeDate = getVal(deal, "close_date");
  if (!closeDate) return null;
  return String(closeDate).slice(0, 10);
}

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
    const { startISO, endISO, label: monthLabel } = getMonthRange(year, month);

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

    // Fetch deal data server-side (same logic as rep route)
    const OWNER_MAP = buildOwnerMap();
    const closedWonAll = await fetchAllDeals({ stage: "Closed Won" });

    const wonInMonth = closedWonAll.filter((deal: any) => {
      const d = getDealDate(deal);
      return d && d >= startISO && d <= endISO;
    });

    let grossARR = 0;
    const closedWonDealDetails: DealDetail[] = [];
    for (const deal of wonInMonth) {
      if (OWNER_MAP[getVal(deal, "owner")] !== repId) continue;
      const value = getVal(deal, "value") || 0;
      const closeDate = getDealDate(deal) || "";
      const dealName = getVal(deal, "name") || "Unnamed Deal";
      grossARR += value;
      closedWonDealDetails.push({ name: String(dealName), value, closeDate });
    }

    // Opt-out calculation (same as rep route)
    const churnedUsers = await fetchChurnedUsersFromUsersList();
    const activeAEIds = new Set(activeAEs.map((a) => a.id));
    const selectedDate = new Date(startISO);
    const priorMonth = selectedDate.getUTCMonth();
    const priorYear = priorMonth === 0
      ? selectedDate.getUTCFullYear() - 1
      : selectedDate.getUTCFullYear();
    const priorMonthNum = priorMonth === 0 ? 12 : priorMonth;
    const priorStart = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
    const priorEnd = new Date(Date.UTC(priorYear, priorMonthNum, 0));
    const churnWindowStart = priorStart.toISOString().split("T")[0]!;
    const churnWindowEnd = priorEnd.toISOString().split("T")[0]!;

    const closedWonInPriorMonth = closedWonAll.filter((deal: any) => {
      const d = getDealDate(deal);
      return d && d >= churnWindowStart && d <= churnWindowEnd;
    });
    const optOutAgg = buildOptOutAggregation(
      churnedUsers, churnWindowStart, churnWindowEnd,
      closedWonInPriorMonth, OWNER_MAP, activeAEIds,
    );

    const optOutARR = optOutAgg.perAE[repId]?.optOutARR || 0;
    const optOutDealDetails: DealDetail[] = optOutAgg.perAE[repId]?.deals || [];
    const netARR = grossARR - optOutARR;
    const { commission } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR);

    // Combine deal snapshots
    const dealSnapshot = [...closedWonDealDetails, ...optOutDealDetails.map((d) => ({ ...d, value: -d.value }))];

    const { allComplete } = await submitApproval(selectedMonth, repId, dealSnapshot, netARR, commission);

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
          text: `✅ *${ae.name}* verified their deals for *${monthLabel}*\n💰 Commission to enter in Gusto: *${fmt(commission)}* (Net ARR: ${fmt(netARR)})\n📊 Progress: ${approvedCount} of ${totalCount} AEs complete`,
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
        { type: "header", text: { type: "plain_text", text: `✅ All Commissions Approved — ${monthLabel}` } },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `All AEs have verified their deal classifications for *${monthLabel}*. Ready for payout.\n\n${lines}\n\n*Total: ${fmt(totalComm)}*`,
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
