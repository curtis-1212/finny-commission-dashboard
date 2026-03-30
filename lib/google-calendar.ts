// SERVER-ONLY -- Google Calendar integration for fetching scheduled demos.
// Uses a Google Workspace service account with domain-wide delegation to
// read events from AE/BDR calendars.
//
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  – service account email
//   GOOGLE_SERVICE_ACCOUNT_KEY    – private key (PEM, newlines as \n)
//   GOOGLE_DEMO_CALENDAR_KEYWORD  – keyword to match in event titles (default: "demo")

import { google } from "googleapis";

const DEMO_KEYWORD = (process.env.GOOGLE_DEMO_CALENDAR_KEYWORD || "demo").toLowerCase();

/**
 * Build a Google Calendar client impersonating the given user email.
 * Requires domain-wide delegation on the service account.
 */
function getCalendarClient(userEmail: string) {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"],
    subject: userEmail,
  });
  return google.calendar({ version: "v3", auth });
}

/**
 * Count events matching the demo keyword on a user's calendar
 * between `afterISO` (exclusive) and `endISO` (inclusive).
 */
async function countDemoEvents(
  userEmail: string,
  afterISO: string,
  endISO: string,
): Promise<number> {
  const calendar = getCalendarClient(userEmail);

  // timeMin is exclusive-ish (Google uses RFC3339), timeMax is exclusive.
  // We want events starting strictly after today through end of month.
  const timeMin = new Date(afterISO + "T23:59:59Z").toISOString();
  const timeMax = new Date(endISO + "T23:59:59Z").toISOString();

  let count = 0;
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId: userEmail,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });

    const events = res.data.items || [];
    for (const event of events) {
      const title = (event.summary || "").toLowerCase();
      if (title.includes(DEMO_KEYWORD) && event.status !== "cancelled") {
        count++;
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return count;
}

export interface CalendarDemoCounts {
  [repId: string]: number;
}

/**
 * Fetch scheduled demo counts for a list of reps from Google Calendar.
 * @param reps - Array of { id, email } for each AE/BDR
 * @param afterISO - Start date (exclusive), typically today "YYYY-MM-DD"
 * @param endISO - End date (inclusive), typically month-end "YYYY-MM-DD"
 * @returns Map of rep id → number of scheduled demos
 */
export async function fetchScheduledDemosFromCalendar(
  reps: { id: string; email: string }[],
  afterISO: string,
  endISO: string,
): Promise<CalendarDemoCounts> {
  const hasServiceAccount =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!hasServiceAccount) {
    console.warn(
      "Google Calendar integration not configured (missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY). " +
      "Falling back to zero scheduled demos.",
    );
    const counts: CalendarDemoCounts = {};
    for (const rep of reps) counts[rep.id] = 0;
    return counts;
  }

  const counts: CalendarDemoCounts = {};

  // Fetch all calendars in parallel
  const results = await Promise.allSettled(
    reps.map(async (rep) => {
      const n = await countDemoEvents(rep.email, afterISO, endISO);
      return { id: rep.id, count: n };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      counts[result.value.id] = result.value.count;
    } else {
      console.error("Failed to fetch calendar events:", result.reason);
    }
  }

  // Fill in zeros for any that failed
  for (const rep of reps) {
    if (counts[rep.id] === undefined) counts[rep.id] = 0;
  }

  return counts;
}
