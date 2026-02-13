import { NextRequest, NextResponse } from "next/server";
import {
  AE_DATA,
  BDR_DATA,
  calcAECommission,
  calcBDRCommission,
  fmt,
  fmtPct,
  getCurrentMonthRange,
  buildOwnerMap,
} from "@/lib/commission-config";
import { attioQuery, getVal } from "@/lib/attio";

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const OWNER_MAP = buildOwnerMap();
    const { startISO, endISO, label: monthLabel } = getCurrentMonthRange();

    // ─── Query Attio directly (don't call own API) ────────────────────
    const dealsRes = await attioQuery("deals", {
      filter: {
        close_date: { gte: startISO, lte: endISO },
        stage: { in: ["Closed Won", "To Be Onboarded", "Live"] },
      },
      limit: 500,
    });
    const deals = dealsRes?.data || [];

    const churnRes = await attioQuery("people", {
      filter: { churn_reason: { is_not_empty: true } },
      limit: 500,
    });
    const churnedSet = new Set(
      (churnRes?.data || []).map((p: any) => p.id?.record_id).filter(Boolean)
    );

    // ─── Aggregate per AE ─────────────────────────────────────────────
    const agg: Record<string, { grossARR: number; churnARR: number; dealCount: number }> = {};
    for (const ae of AE_DATA) agg[ae.id] = { grossARR: 0, churnARR: 0, dealCount: 0 };

    for (const deal of deals) {
      const ownerUUID = getVal(deal, "owner");
      const aeId = OWNER_MAP[ownerUUID];
      if (!aeId || !agg[aeId]) continue;

      const value = getVal(deal, "value") || 0;
      const people = getVal(deal, "associated_people") || [];
      const isChurned = Array.isArray(people) && people.some((pid: string) => churnedSet.has(pid));

      if (isChurned) {
        agg[aeId].churnARR += value;
      } else {
        agg[aeId].grossARR += value;
        agg[aeId].dealCount += 1;
      }
    }

    // ─── Build AE results ─────────────────────────────────────────────
    const aeResults = AE_DATA.map((ae) => {
      const a = agg[ae.id];
      const netARR = a.grossARR;
      const { commission, attainment } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR);
      return { ...ae, netARR, grossARR: a.grossARR + a.churnARR, churnARR: a.churnARR, dealCount: a.dealCount, attainment, commission };
    });

    // ─── BDR ──────────────────────────────────────────────────────────
    let maxMeetings = 0;
    for (const deal of deals) {
      const leadOwner = getVal(deal, "lead_owner");
      if (leadOwner === process.env.ATTIO_MAX_UUID) maxMeetings += 1;
    }
    const { commission: bdrComm, attainment: bdrAtt } = calcBDRCommission(maxMeetings);

    // ─── Slack message ────────────────────────────────────────────────
    const bar = (att: number) => {
      const filled = Math.min(Math.round(att * 10), 15);
      return "█".repeat(filled) + "░".repeat(Math.max(10 - filled, 0));
    };
    const pct = (n: number) => (n * 100).toFixed(0) + "%";

    let totalNetARR = 0;
    let totalComm = 0;

    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `📊 ${monthLabel} Commission Update` },
      },
      { type: "divider" },
    ];

    for (const ae of aeResults) {
      totalNetARR += ae.netARR;
      totalComm += ae.commission;
      const vsTarget = ae.commission - ae.variable / 12;
      const emoji = ae.attainment >= 1.2 ? "🔥" : ae.attainment >= 1.0 ? "✅" : "⏳";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*${ae.name}* (AE)  ${emoji}`,
            `${bar(ae.attainment)}  *${pct(ae.attainment)}* attainment`,
            `Net ARR: *${fmt(ae.netARR)}* / ${fmt(ae.monthlyQuota)} quota  |  ${ae.dealCount} deals`,
            `Commission: *${fmt(ae.commission)}*  |  vs Target: ${vsTarget >= 0 ? "+" : ""}${fmt(vsTarget)}`,
          ].join("\n"),
        },
      });
    }

    totalComm += bdrComm;
    const bdrVs = bdrComm - BDR_DATA.monthlyTargetVariable;
    const bdrEmoji = bdrAtt >= 1.25 ? "⚡" : bdrAtt >= 1.0 ? "✅" : "⏳";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `🟣 *${BDR_DATA.name}* (BDR)  ${bdrEmoji}`,
          `${bar(bdrAtt)}  *${pct(bdrAtt)}* attainment`,
          `Meetings: *${maxMeetings}* / ${BDR_DATA.monthlyQuota} target`,
          `Commission: *${fmt(bdrComm)}*  |  vs Target: ${bdrVs >= 0 ? "+" : ""}${fmt(bdrVs)}`,
        ].join("\n"),
      },
    });

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Team Total:*  Net ARR ${fmt(totalNetARR)}  |  Total Commission ${fmt(totalComm)}`,
      },
    });

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Data from Attio at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET  •  ${deals.length} deals processed`,
        },
      ],
    });

    // ─── Post to Slack ────────────────────────────────────────────────
    if (!process.env.SLACK_WEBHOOK_URL) {
      console.warn("SLACK_WEBHOOK_URL not set — skipping Slack post");
      return NextResponse.json({ success: true, skippedSlack: true, totalNetARR, totalComm });
    }

    const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      console.error(`Slack post failed: ${slackRes.status}`);
      return NextResponse.json({ error: "Slack post failed" }, { status: 502 });
    }

    return NextResponse.json({ success: true, totalNetARR, totalComm });
  } catch (err: any) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
