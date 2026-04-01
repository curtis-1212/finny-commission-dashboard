import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { getUserRole, isExec } from "@/lib/roles";
import { startVerificationCycle } from "@/lib/approval";
import { getActiveAEs, getMonthRange, parseMonthParam } from "@/lib/commission-config";
import { sendSlackBlocks, postSlackMessage, buildAEVerificationBlocks } from "@/lib/slack";
import { computeDealSnapshot } from "@/lib/deal-snapshot";

export const revalidate = 0;

export async function POST(request: NextRequest) {
  // Auth: exec or cron secret
  const auth = request.headers.get("authorization");
  const isCron = auth === `Bearer ${process.env.CRON_SECRET}`;
  let startedBy = "cron";

  if (!isCron) {
    const session = await getAppSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = getUserRole(session.user.email);
    if (!role || !isExec(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    startedBy = session.user.email;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const monthStr = body.month || null;
    const { year, month } = parseMonthParam(monthStr);
    const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;
    const { label: monthLabel } = getMonthRange(year, month);

    const { cycle, aeIds, alreadyExists } = await startVerificationCycle(selectedMonth, startedBy);

    // Send Slack notifications (only on first start)
    if (!alreadyExists) {
      const activeAEs = getActiveAEs(selectedMonth);
      const channelId = process.env.SLACK_CHANNEL_ID;

      // Send per-AE verification messages with deal details + approve/challenge buttons
      if (channelId) {
        // Send a header message first
        await postSlackMessage(channelId, [
          { type: "header", text: { type: "plain_text", text: `📋 Commission Verification Open — ${monthLabel}` } },
          { type: "divider" },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `AEs, please review your deals below and approve or challenge.\nStarted by ${startedBy} at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`,
            },
          },
        ], `Commission Verification Open — ${monthLabel}`);

        // Send individual deal messages per AE
        for (const ae of activeAEs) {
          try {
            const snapshot = await computeDealSnapshot(ae.id, monthStr);
            const blocks = buildAEVerificationBlocks(
              ae.name, monthLabel,
              snapshot.closedWonDeals, snapshot.optOutDeals,
              snapshot.grossARR, snapshot.optOutARR, snapshot.netARR, snapshot.commission,
              selectedMonth, ae.id,
            );
            await postSlackMessage(channelId, blocks, `${ae.name} — Commission Verification`);
          } catch (err) {
            console.error(`Failed to send verification message for ${ae.name}:`, err);
          }
        }
      } else {
        // Fallback to webhook if no bot token/channel configured
        const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "";
        const aeLines = activeAEs.map(
          (ae) => `• *${ae.name}* → <${baseUrl}/dashboard/${ae.id}|View Dashboard>`
        ).join("\n");

        await sendSlackBlocks([
          { type: "header", text: { type: "plain_text", text: `📋 Commission Verification Open — ${monthLabel}` } },
          { type: "divider" },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `AEs, please review and approve your deal classifications for *${monthLabel}*.\n\n${aeLines}`,
            },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Started by ${startedBy} at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET` }],
          },
        ]);
      }
    }

    return NextResponse.json({
      success: true,
      alreadyExists,
      month: selectedMonth,
      aesRequested: aeIds,
      startedAt: cycle.startedAt,
    });
  } catch (err: any) {
    console.error("Start verification error:", err);
    return NextResponse.json({ error: "Failed to start verification" }, { status: 500 });
  }
}
