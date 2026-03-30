// SERVER-ONLY -- Calendly integration for fetching scheduled demos.
//
// Required env vars:
//   CALENDLY_API_TOKEN      – Personal Access Token or OAuth token
//   CALENDLY_ORG_URI        – Organization URI (e.g. "https://api.calendly.com/organizations/XXXX")

const CALENDLY_BASE = "https://api.calendly.com";

interface CalendlyEvent {
  uri: string;
  name: string;
  status: "active" | "canceled";
  start_time: string;
  end_time: string;
  event_memberships: { user: string; user_email: string }[];
}

interface CalendlyListResponse {
  collection: CalendlyEvent[];
  pagination: { next_page_token?: string };
}

export interface ScheduledDemoCounts {
  [repId: string]: number;
}

/**
 * Fetch all active Calendly events for the org in a date range.
 * Returns raw events so the caller can map them to reps.
 */
async function fetchCalendlyEvents(
  minTime: string,
  maxTime: string,
): Promise<CalendlyEvent[]> {
  const token = process.env.CALENDLY_API_TOKEN;
  const orgUri = process.env.CALENDLY_ORG_URI;
  if (!token || !orgUri) return [];

  const allEvents: CalendlyEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      organization: orgUri,
      min_start_time: minTime,
      max_start_time: maxTime,
      status: "active",
      count: "100",
    });
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(`${CALENDLY_BASE}/scheduled_events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Calendly API error (${res.status}):`, text);
      break;
    }

    const data: CalendlyListResponse = await res.json();
    allEvents.push(...data.collection);
    pageToken = data.pagination.next_page_token;
  } while (pageToken);

  return allEvents;
}

/**
 * Fetch scheduled demo counts for a list of reps from Calendly.
 * @param reps - Array of { id, email } for each AE/BDR
 * @param afterISO - Start date (exclusive), typically today "YYYY-MM-DD"
 * @param endISO - End date (inclusive), typically month-end "YYYY-MM-DD"
 * @returns Map of rep id → number of scheduled demos
 */
export async function fetchScheduledDemosFromCalendly(
  reps: { id: string; email: string }[],
  afterISO: string,
  endISO: string,
): Promise<ScheduledDemoCounts> {
  const counts: ScheduledDemoCounts = {};
  for (const rep of reps) counts[rep.id] = 0;

  if (!process.env.CALENDLY_API_TOKEN || !process.env.CALENDLY_ORG_URI) {
    console.warn(
      "Calendly integration not configured (missing CALENDLY_API_TOKEN or CALENDLY_ORG_URI). " +
      "Falling back to zero scheduled demos.",
    );
    return counts;
  }

  // Calendly uses ISO 8601 timestamps. afterISO is exclusive (start of next day),
  // endISO is inclusive (so we go to end of that day).
  const minTime = new Date(afterISO + "T23:59:59Z").toISOString();
  const maxTime = new Date(endISO + "T23:59:59Z").toISOString();

  const events = await fetchCalendlyEvents(minTime, maxTime);

  // Build email → rep id lookup
  const emailToId: Record<string, string> = {};
  for (const rep of reps) {
    emailToId[rep.email.toLowerCase()] = rep.id;
  }

  // Count events per rep based on event membership email
  for (const event of events) {
    for (const membership of event.event_memberships) {
      const repId = emailToId[membership.user_email.toLowerCase()];
      if (repId !== undefined) {
        counts[repId]++;
      }
    }
  }

  return counts;
}
