import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    const res = await fetch(`${base}/api/commissions`);
    if (!res.ok) throw new Error(`Commission API failed: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
    const f = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
    const p = (n: number) => (n * 100).toFixed(1) + "%";
    const bar = (a: number) => "▓".repeat(Math.min(Math.round(a * 10), 10)) + "░".repeat(10 - Math.min(Math.round(a * 10), 10));
    const emojis: Record<string, string> = { jason: "🔵", austin: "🟢", kelcy: "🟡" };
    const vars: Record<string, number> = { jason: 120000, austin: 120000, kelcy: 72000 };

    const totalNet = data.ae.reduce((s: number, a: any) => s + a.netARR, 0);
    const totalComm = data.ae.reduce((s: number, a: any) => s + a.commission, 0) + data.bdr.commission;

    const blocks: any[] = [
      { type: "header", text: { type: "plain_text", text: `📊 February Commission Update — ${today}`, emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: `*Team Totals:*  Net ARR: *${f(totalNet)}*  |  Total Commission: *${f(totalComm)}*` } },
      { type: "divider" },
    ];

    for (const ae of data.ae) {
      const vs = ae.commission - (vars[ae.id] || 120000) / 12;
      const st = ae.attainment >= 1.2 ? "🔥" : ae.attainment >= 1.0 ? "✅" : ae.attainment >= 0.7 ? "📈" : "⏳";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: [
        `${emojis[ae.id] || "⚪"} *${ae.name}*  ${st}`,
        `${bar(ae.attainment)}  *${p(ae.attainment)}* attainment`,
        `Gross ARR: ${f(ae.grossARR)}  →  Net: *${f(ae.netARR)}*  (${ae.dealCount} deals, ${f(ae.churnARR)} churned)`,
        `Commission: *${f(ae.commission)}*  |  vs Target: ${vs >= 0 ? "+" : ""}${f(vs)}`,
      ].join("\n") } });
    }

    blocks.push({ type: "divider" });
    const bdrVs = data.bdr.commission - 10000 / 12;
    const bdrSt = data.bdr.attainment >= 1.25 ? "⚡" : data.bdr.attainment >= 1.0 ? "✅" : "⏳";
    blocks.push({ type: "section", text: { type: "mrkdwn", text: [
      `🟣 *${data.bdr.name}* (BDR)  ${bdrSt}`,
      `${bar(data.bdr.attainment)}  *${p(data.bdr.attainment)}* attainment`,
      `Meetings: *${data.bdr.netMeetings}* / 15 target`,
      `Commission: *${f(data.bdr.commission)}*  |  vs Target: ${bdrVs >= 0 ? "+" : ""}${f(bdrVs)}`,
    ].join("\n") } });
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Data from Attio at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET  •  ${data.meta.dealCount} deals` }] });

    const slack = await fetch(process.env.SLACK_WEBHOOK_URL!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks }) });
    if (!slack.ok) throw new Error(`Slack failed: ${slack.status}`);

    return NextResponse.json({ success: true, totalNet, totalComm });
  } catch (err: any) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
