import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature, sendSlackBlocks, updateSlackMessage, replaceActionsWithStatus } from "@/lib/slack";
import { getVerificationCycle, submitApproval, getAllApprovalStates, markExecNotified } from "@/lib/approval";
import { AE_DATA } from "@/lib/commission-config";
import { computeDealSnapshot } from "@/lib/deal-snapshot";

export const revalidate = 0;

const fmt = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export async function POST(request: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json({ error: "SLACK_SIGNING_SECRET not configured" }, { status: 500 });
  }

  // Slack sends interaction payloads as application/x-www-form-urlencoded
  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature") || "";
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";

  if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Only handle block_actions
  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return new NextResponse("", { status: 200 });
  }

  const action = payload.actions[0];
  const actionId: string = action.action_id || "";
  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const originalBlocks = payload.message?.blocks || [];
  const slackUser = payload.user?.name || payload.user?.username || "Unknown";

  // Parse action_id: "approve_{month}_{repId}" or "challenge_{month}_{repId}"
  const match = actionId.match(/^(approve|challenge)_(\d{4}-\d{2})_(.+)$/);
  if (!match) {
    return new NextResponse("", { status: 200 });
  }

  const [, actionType, month, repId] = match;

  const ae = AE_DATA.find((a) => a.id === repId);
  if (!ae) {
    return new NextResponse("", { status: 200 });
  }

  try {
    if (actionType === "approve") {
      // Verify cycle exists
      const cycle = await getVerificationCycle(month);
      if (!cycle) {
        // Update message to show error
        if (channel && messageTs) {
          await updateSlackMessage(channel, messageTs, replaceActionsWithStatus(originalBlocks, "challenged"), "No active verification cycle");
        }
        return new NextResponse("", { status: 200 });
      }

      // Compute fresh deal snapshot and submit approval
      const snapshot = await computeDealSnapshot(repId, month);
      const { allComplete } = await submitApproval(
        month, repId, snapshot.dealSnapshot, snapshot.netARR, snapshot.commission,
      );

      // Update the message: replace buttons with approval confirmation
      if (channel && messageTs) {
        const now = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" });
        await updateSlackMessage(
          channel,
          messageTs,
          replaceActionsWithStatus(originalBlocks, "approved", now),
          `${ae.name} approved deals`,
        );
      }

      // Send progress notification
      const allStates = await getAllApprovalStates(month);
      const approvedCount = allStates.filter((s) => s.record?.approved === true).length;
      const totalCount = allStates.length;

      await sendSlackBlocks([
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *${ae.name}* verified their deals for *${snapshot.monthLabel}* (via Slack)\n💰 Commission to enter in Gusto: *${fmt(snapshot.commission)}* (Net ARR: ${fmt(snapshot.netARR)})\n📊 Progress: ${approvedCount} of ${totalCount} AEs complete`,
          },
        },
      ]);

      // If all approved, send exec summary
      if (allComplete) {
        const lines = allStates.map(
          (s) => `• *${s.name}*: ${fmt(s.record?.commission ?? 0)}`
        ).join("\n");
        const totalComm = allStates.reduce((sum, s) => sum + (s.record?.commission ?? 0), 0);

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

        await markExecNotified(month);
      }
    } else if (actionType === "challenge") {
      // Update message: replace buttons with challenge notice
      if (channel && messageTs) {
        await updateSlackMessage(
          channel,
          messageTs,
          replaceActionsWithStatus(originalBlocks, "challenged"),
          `${ae.name} challenged their deals`,
        );
      }

      // Notify exec
      await sendSlackBlocks([
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *${ae.name}* has challenged their deal classifications for *${month}*.\nPlease follow up with them directly.`,
          },
        },
      ]);
    }
  } catch (err) {
    console.error("Slack interaction error:", err);
  }

  // Slack expects a 200 within 3 seconds
  return new NextResponse("", { status: 200 });
}
