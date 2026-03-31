// SERVER-ONLY -- Fireflies.ai integration for verifying held demos
// and extracting transcript-level insights (talk ratio, duration, sentiment).
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

interface FirefliesTranscript {
  id: string;
  title: string;
  date: string; // epoch ms as string
  duration: number; // minutes
  participants: string[];
  organizer_email: string;
  speakers: { name: string; email: string; duration: number }[]; // duration in seconds
  sentiment: string; // "positive" | "negative" | "neutral"
}

export interface HeldDemo {
  date: string; // "YYYY-MM-DD"
  title: string;
}

export interface HeldDemosByRep {
  [repId: string]: HeldDemo[];
}

export interface TranscriptInsight {
  id: string;
  title: string;
  date: string;           // "YYYY-MM-DD"
  durationMinutes: number;
  talkRatio: number;      // 0-1, AE talk time / total talk time
  sentiment: "positive" | "negative" | "neutral";
  outcome?: "won" | "lost" | "pending";
}

export interface AETranscriptMetrics {
  avgTalkRatio: number | null;
  avgDurationMinutes: number | null;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  wonMetrics: { avgTalkRatio: number | null; avgDuration: number | null; avgSentimentScore: number | null } | null;
  lostMetrics: { avgTalkRatio: number | null; avgDuration: number | null; avgSentimentScore: number | null } | null;
  totalAnalyzed: number;
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

// ─── Transcript Insights ─────────────────────────────────────────────────────

/**
 * Fetch richer transcript data (speakers, duration, sentiment) for insight computation.
 */
export async function fetchTranscriptInsights(
  reps: { id: string; email: string }[],
  startISO: string,
  endISO: string,
): Promise<Record<string, TranscriptInsight[]>> {
  const result: Record<string, TranscriptInsight[]> = {};
  for (const rep of reps) result[rep.id] = [];

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return result;

  const emailToId: Record<string, string> = {};
  for (const rep of reps) emailToId[rep.email.toLowerCase()] = rep.id;

  const query = `
    query Transcripts($fromDate: DateTime, $toDate: DateTime) {
      transcripts(from_date: $fromDate, to_date: $toDate) {
        id
        title
        date
        duration
        participants
        organizer_email
        speakers {
          name
          email
          duration
        }
        sentiment
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
    console.error(`Fireflies insights API error (${res.status}):`, text);
    return result;
  }

  const data = await res.json();
  const transcripts: FirefliesTranscript[] = data?.data?.transcripts || [];

  for (const t of transcripts) {
    const dateMs = Number(t.date);
    const dateStr = isNaN(dateMs) ? "" : new Date(dateMs).toISOString().split("T")[0];
    if (!dateStr) continue;

    // Identify which rep owns this transcript
    const allEmails = [
      t.organizer_email?.toLowerCase(),
      ...(t.participants || []).map((p) => p.toLowerCase()),
    ];
    let matchedRepId: string | undefined;
    let repEmail: string | undefined;
    for (const email of allEmails) {
      if (!email) continue;
      if (emailToId[email] !== undefined) {
        matchedRepId = emailToId[email];
        repEmail = email;
        break;
      }
    }
    if (!matchedRepId || !repEmail) continue;

    // Compute talk ratio from speaker data
    const speakers = t.speakers || [];
    const totalSpeakTime = speakers.reduce((s, sp) => s + (sp.duration || 0), 0);
    const repSpeakTime = speakers
      .filter((sp) => sp.email?.toLowerCase() === repEmail)
      .reduce((s, sp) => s + (sp.duration || 0), 0);
    const talkRatio = totalSpeakTime > 0 ? repSpeakTime / totalSpeakTime : 0.5;

    // Normalize sentiment
    const rawSentiment = (t.sentiment || "").toLowerCase();
    const sentiment: TranscriptInsight["sentiment"] =
      rawSentiment === "positive" ? "positive"
      : rawSentiment === "negative" ? "negative"
      : "neutral";

    result[matchedRepId].push({
      id: t.id,
      title: t.title,
      date: dateStr,
      durationMinutes: t.duration || 0,
      talkRatio,
      sentiment,
    });
  }

  return result;
}

/**
 * Compute aggregated transcript metrics for a single AE, including win/loss comparison.
 */
export function computeTranscriptMetrics(insights: TranscriptInsight[]): AETranscriptMetrics {
  const empty: AETranscriptMetrics = {
    avgTalkRatio: null,
    avgDurationMinutes: null,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    wonMetrics: null,
    lostMetrics: null,
    totalAnalyzed: 0,
  };
  if (insights.length === 0) return empty;

  // Overall averages
  const totalRatio = insights.reduce((s, i) => s + i.talkRatio, 0);
  const totalDuration = insights.reduce((s, i) => s + i.durationMinutes, 0);
  const breakdown = { positive: 0, neutral: 0, negative: 0 };
  for (const i of insights) breakdown[i.sentiment]++;

  // Win/loss splits
  const won = insights.filter((i) => i.outcome === "won");
  const lost = insights.filter((i) => i.outcome === "lost");

  function sentimentScore(items: TranscriptInsight[]): number | null {
    if (items.length === 0) return null;
    const score = items.reduce((s, i) =>
      s + (i.sentiment === "positive" ? 1 : i.sentiment === "neutral" ? 0.5 : 0), 0);
    return score / items.length;
  }

  function avgOf(items: TranscriptInsight[], fn: (i: TranscriptInsight) => number): number | null {
    if (items.length === 0) return null;
    return items.reduce((s, i) => s + fn(i), 0) / items.length;
  }

  return {
    avgTalkRatio: totalRatio / insights.length,
    avgDurationMinutes: totalDuration / insights.length,
    sentimentBreakdown: breakdown,
    wonMetrics: won.length > 0 ? {
      avgTalkRatio: avgOf(won, (i) => i.talkRatio),
      avgDuration: avgOf(won, (i) => i.durationMinutes),
      avgSentimentScore: sentimentScore(won),
    } : null,
    lostMetrics: lost.length > 0 ? {
      avgTalkRatio: avgOf(lost, (i) => i.talkRatio),
      avgDuration: avgOf(lost, (i) => i.durationMinutes),
      avgSentimentScore: sentimentScore(lost),
    } : null,
    totalAnalyzed: insights.length,
  };
}
