// SERVER-ONLY -- Fireflies.ai integration for verifying held demos.
// A transcript existing in Fireflies = the meeting actually happened.
//
// Required env vars:
//   FIREFLIES_API_KEY  – Fireflies API key

const FIREFLIES_GQL = "https://api.fireflies.ai/graphql";

interface FirefliesMeeting {
  id: string;
  title: string;
  date: string; // epoch ms as string
  participants: string[];
  organizer_email: string;
}

export interface HeldDemo {
  date: string; // "YYYY-MM-DD"
  title: string;
}

export interface HeldDemosByRep {
  [repId: string]: HeldDemo[];
}

/**
 * Fetch Fireflies transcripts in a date range and map them to reps.
 * @param reps - Array of { id, email } for each AE/BDR
 * @param startISO - Start date (inclusive) "YYYY-MM-DD"
 * @param endISO - End date (inclusive) "YYYY-MM-DD"
 * @returns Map of rep id → array of held demos
 */
export async function fetchHeldDemosFromFireflies(
  reps: { id: string; email: string }[],
  startISO: string,
  endISO: string,
): Promise<HeldDemosByRep> {
  const result: HeldDemosByRep = {};
  for (const rep of reps) result[rep.id] = [];

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    console.warn(
      "Fireflies integration not configured (missing FIREFLIES_API_KEY). " +
      "Falling back to Attio demo_held_date.",
    );
    return result;
  }

  // Build email → rep id lookup
  const emailToId: Record<string, string> = {};
  for (const rep of reps) {
    emailToId[rep.email.toLowerCase()] = rep.id;
  }

  // Fireflies GraphQL query for transcripts in date range
  const query = `
    query Transcripts($fromDate: DateTime, $toDate: DateTime) {
      transcripts(from_date: $fromDate, to_date: $toDate) {
        id
        title
        date
        participants
        organizer_email
      }
    }
  `;

  const res = await fetch(FIREFLIES_GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        fromDate: new Date(startISO + "T00:00:00Z").toISOString(),
        toDate: new Date(endISO + "T23:59:59Z").toISOString(),
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Fireflies API error (${res.status}):`, text);
    return result;
  }

  const data = await res.json();
  const transcripts: FirefliesMeeting[] = data?.data?.transcripts || [];

  for (const transcript of transcripts) {
    // Convert epoch ms to date string
    const dateMs = Number(transcript.date);
    const dateStr = isNaN(dateMs)
      ? ""
      : new Date(dateMs).toISOString().split("T")[0];

    if (!dateStr) continue;

    // Check organizer and participants against rep emails
    const allEmails = [
      transcript.organizer_email?.toLowerCase(),
      ...(transcript.participants || []).map((p) => p.toLowerCase()),
    ];

    for (const email of allEmails) {
      if (!email) continue;
      const repId = emailToId[email];
      if (repId !== undefined) {
        result[repId].push({ date: dateStr, title: transcript.title });
        break; // count once per transcript per rep
      }
    }
  }

  return result;
}
