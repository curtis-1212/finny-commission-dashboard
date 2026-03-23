import { NextRequest, NextResponse } from "next/server";
import { startVerificationCycle, getVerificationCycle } from "@/lib/approval";
import { getActiveAEs, getMonthRange } from "@/lib/commission-config";
import { sendSlackBlocks } from "@/lib/slack";

export const revalidate = 0;

/**
 * Returns true if today is the last weekday (Mon–Fri) of the current month.
 */
function isLastBusinessDay(): boolean {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = now.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Find the last weekday
  let lastWeekday = lastDay;
  while (lastWeekday > 0) {
    const dayOfWeek = new Date(Date.UTC(year, month, lastWeekday)).getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) break; // not Sat/Sun
    lastWeekday--;
  }

  return today === lastWeekday;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only run on the last business day of the month
  if (!isLastBusinessDay()) {
    return NextResponse.json({ skipped: true, reason: "Not the last business day" });
  }

  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;
    const { label: monthLabel } = getMonthRange(year, month);

    // Idempotent: if cycle already exists, skip
    const existing = await getVerificationCycle(selectedMonth);
    if (existing) {
      return NextResponse.json({ skipped: true, reason: "Cycle already exists" });
    }

    const { cycle, aeIds } = await startVerificationCycle(selectedMonth, "cron");

    // Send Slack notification
    const activeAEs = getActiveAEs(selectedMonth);
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
          text: `It's end of month! AEs, please review and approve your deal classifications for *${monthLabel}*.\n\n${aeLines}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Auto-started by cron at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET` }],
      },
    ]);

    return NextResponse.json({ success: true, month: selectedMonth, aesRequested: aeIds });
  } catch (err: any) {
    console.error("Start verification cron error:", err);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
