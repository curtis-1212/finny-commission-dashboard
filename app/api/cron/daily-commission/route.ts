import { NextRequest, NextResponse } from "next/server";
import { BDR_DATA, fmt, getCurrentMonthRange } from "@/lib/commission-config";
import { fetchMonthData } from "@/lib/deals";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { startISO, endISO, label: monthLabel, year, month } = getCurrentMonthRange();
    const selectedMonthStr = year + "-" + String(month).padStart(2, "0");

    const data = await fetchMonthData(startISO, endISO, monthLabel, selectedMonthStr);

    const bar = (att: number) => {
      const filled = Math.min(Math.round(att * 10), 15);
      return String.fromCharCode(9608).repeat(filled) + String.fromCharCode(9617).repeat(Math.max(10 - filled, 0));
    };
    const pct = (n: number) => (n * 100).toFixed(0) + "%";

    let totalNetARR = 0;
    let totalComm = 0;
    const blocks: any[] = [
      { type: "header", text: { type: "plain_text", text: "📊 " + monthLabel + " Commission Update" } },
      { type: "divider" },
    ];

    for (const ae of data.aeResults) {
      totalNetARR += ae.netARR;
      totalComm += ae.commission;
      const emoji = ae.attainment >= 1.2 ? "🔥" : ae.attainment >= 1.0 ? "✅" : "⏳";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*" + ae.name + "* (AE) " + emoji + "\n" +
                bar(ae.attainment) + " *" + pct(ae.attainment) + "* attainment\n" +
                "Net ARR: *" + fmt(ae.netARR) + "* / " + fmt(ae.monthlyQuota) + " quota | " + ae.dealCount + " deals\n" +
                "Commission: *" + fmt(ae.commission) + "*",
        },
      });
    }

    const bdr = data.bdrResult;
    totalComm += bdr.commission;
    const bdrEmoji = bdr.attainment >= 1.25 ? "⚡" : bdr.attainment >= 1.0 ? "✅" : "⏳";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🟣 *" + bdr.name + "* (BDR) " + bdrEmoji + "\n" +
              bar(bdr.attainment) + " *" + pct(bdr.attainment) + "* attainment\n" +
              "Meetings: *" + bdr.netMeetings + "* / " + bdr.monthlyQuota + " target\n" +
              "Commission: *" + fmt(bdr.commission) + "*",
      },
    });

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Team Total:* Net ARR " + fmt(totalNetARR) + " | Total Commission " + fmt(totalComm) },
    });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "Data from Attio at " + new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" }) + " ET • " + data.meta.dealCount + " deals processed" }],
    });

    if (!process.env.SLACK_WEBHOOK_URL) {
      return NextResponse.json({ success: true, skippedSlack: true, totalNetARR, totalComm });
    }

    const slackRes = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      return NextResponse.json({ error: "Slack post failed" }, { status: 502 });
    }

    return NextResponse.json({ success: true, totalNetARR, totalComm });
  } catch (err: any) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
