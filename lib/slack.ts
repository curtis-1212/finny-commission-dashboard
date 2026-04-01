// SERVER-ONLY -- Shared Slack notification helpers.

import crypto from "crypto";
import type { DealDetail } from "@/lib/deals";

// ─── Webhook (existing) ─────────────────────────────────────────────────────

export async function sendSlackBlocks(blocks: any[]): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
  return res.ok;
}

// ─── Bot API ────────────────────────────────────────────────────────────────

export async function postSlackMessage(
  channel: string,
  blocks: any[],
  text?: string,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set" };

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      blocks,
      text: text || "Commission Verification",
    }),
  });
  return res.json();
}

export async function updateSlackMessage(
  channel: string,
  ts: string,
  blocks: any[],
  text?: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not set" };

  const res = await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      ts,
      blocks,
      text: text || "Commission Verification",
    }),
  });
  return res.json();
}

// ─── Signature Verification ─────────────────────────────────────────────────

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const basestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(basestring).digest("hex");
  const expected = `v0=${hmac}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ─── Message Builders ───────────────────────────────────────────────────────

const fmt = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function buildAEVerificationBlocks(
  aeName: string,
  monthLabel: string,
  closedWonDeals: DealDetail[],
  optOutDeals: DealDetail[],
  grossARR: number,
  optOutARR: number,
  netARR: number,
  commission: number,
  month: string,
  repId: string,
  opts?: { alreadyApproved?: boolean; approvedAt?: string | null },
): any[] {
  const dealLines = closedWonDeals.length > 0
    ? closedWonDeals.map((d) => `• ${d.name} — ${fmt(d.value)}`).join("\n")
    : "_No closed-won deals this month_";

  const optOutLines = optOutDeals.length > 0
    ? optOutDeals.map((d) => `• ${d.name} — -${fmt(d.value)}`).join("\n")
    : null;

  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📋 ${aeName} — Commission Verification` },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Review your deals for *${monthLabel}*:\n\n*Closed Won Deals:*\n${dealLines}`,
      },
    },
  ];

  if (optOutLines) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Opt-Out Deductions:*\n${optOutLines}`,
      },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Summary:*\nGross ARR: ${fmt(grossARR)}${optOutARR > 0 ? ` | Opt-Out: -${fmt(optOutARR)}` : ""}\nNet ARR: *${fmt(netARR)}*\n💰 Commission: *${fmt(commission)}*`,
    },
  });

  if (opts?.alreadyApproved) {
    const approvedTime = opts.approvedAt
      ? new Date(opts.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "previously";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `✅ *Already approved* (${approvedTime})` },
    });
  } else {
    blocks.push({
      type: "actions",
      block_id: `verify_${month}_${repId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Approve My Deals" },
          style: "primary",
          action_id: `approve_${month}_${repId}`,
          confirm: {
            title: { type: "plain_text", text: "Confirm Approval" },
            text: { type: "mrkdwn", text: `Are you sure you want to approve your deals for *${monthLabel}*?\n\nCommission: *${fmt(commission)}*` },
            confirm: { type: "plain_text", text: "Yes, Approve" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ Challenge" },
          style: "danger",
          action_id: `challenge_${month}_${repId}`,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Replace the action buttons with a confirmation or challenge message.
 */
export function replaceActionsWithStatus(
  originalBlocks: any[],
  status: "approved" | "challenged",
  timestamp?: string,
): any[] {
  return originalBlocks.map((block) => {
    if (block.type === "actions") {
      const text = status === "approved"
        ? `✅ *Approved* at ${timestamp || new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`
        : `❌ *Challenged* — follow up needed`;
      return {
        type: "section",
        text: { type: "mrkdwn", text },
      };
    }
    return block;
  });
}
