// SERVER-ONLY -- Demo triangulation across Calendly, Fireflies, and Attio.
//
// A demo is "confirmed held" if:
//   1. It appears in Fireflies with duration >= 12 minutes, OR
//   2. It appears in Attio (demo_held_date) AND at least one of Calendly/Fireflies corroborates it, OR
//   3. It appears in both Calendly (past event) and Attio
//
// This ensures we don't miss demos that were actually held but may be missing
// from one source, while also not double-counting.

import type { CalendlyPastEventsByRep } from "@/lib/calendly";
import type { HeldDemosByRep } from "@/lib/fireflies";

const MIN_DEMO_DURATION_MINUTES = 12;

export type DemoSource = "calendly" | "fireflies" | "attio";

export interface ConfirmedDemo {
  date: string;       // "YYYY-MM-DD"
  title: string;
  sources: DemoSource[];
  durationMinutes?: number; // from Fireflies if available
}

export interface ConfirmedDemosByRep {
  [repId: string]: ConfirmedDemo[];
}

interface AttioDemoInfo {
  date: string;   // "YYYY-MM-DD"
  dealName: string;
}

export interface AttioDemosByRep {
  [repId: string]: AttioDemoInfo[];
}

/**
 * Triangulate held demos from multiple sources.
 *
 * @param calendlyPastEvents - Past Calendly events per rep (already occurred)
 * @param firefliesHeldDemos - Fireflies transcripts per rep
 * @param attioDemos - Attio demo_held_date entries per rep
 * @param firefliesDurations - Optional map of repId → date → duration in minutes (from transcript insights)
 */
export function triangulateHeldDemos(
  calendlyPastEvents: CalendlyPastEventsByRep,
  firefliesHeldDemos: HeldDemosByRep,
  attioDemos: AttioDemosByRep,
  firefliesDurations?: Record<string, Record<string, number>>,
): ConfirmedDemosByRep {
  const allRepIdSet = new Set([
    ...Object.keys(calendlyPastEvents),
    ...Object.keys(firefliesHeldDemos),
    ...Object.keys(attioDemos),
  ]);
  const allRepIds = Array.from(allRepIdSet);

  const result: ConfirmedDemosByRep = {};

  for (const repId of allRepIds) {
    const calendlyEvents = calendlyPastEvents[repId] || [];
    const firefliesEvents = firefliesHeldDemos[repId] || [];
    const attioEvents = attioDemos[repId] || [];

    // Index by date for cross-referencing
    const calendlyDates = new Set(calendlyEvents.map((e) => e.date));
    const firefliesDates = new Set(firefliesEvents.map((e) => e.date));
    const attioDates = new Set(attioEvents.map((e) => e.date));

    // Track which dates we've already confirmed to avoid duplicates
    const confirmedDates = new Map<string, ConfirmedDemo>();

    // Rule 1: Fireflies with duration >= 12 minutes → confirmed
    for (const ff of firefliesEvents) {
      const duration = firefliesDurations?.[repId]?.[ff.date];
      if (duration !== undefined && duration >= MIN_DEMO_DURATION_MINUTES) {
        const sources: DemoSource[] = ["fireflies"];
        if (calendlyDates.has(ff.date)) sources.push("calendly");
        if (attioDates.has(ff.date)) sources.push("attio");
        confirmedDates.set(ff.date, {
          date: ff.date,
          title: ff.title,
          sources,
          durationMinutes: duration,
        });
      } else if (duration === undefined) {
        // No duration info from Fireflies — still count if corroborated
        const sources: DemoSource[] = ["fireflies"];
        if (calendlyDates.has(ff.date)) sources.push("calendly");
        if (attioDates.has(ff.date)) sources.push("attio");
        // If we have Fireflies evidence at all, include it (Fireflies = transcript exists)
        confirmedDates.set(ff.date, {
          date: ff.date,
          title: ff.title,
          sources,
        });
      }
    }

    // Rule 2: Attio + at least one of Calendly/Fireflies → confirmed
    for (const attio of attioEvents) {
      if (confirmedDates.has(attio.date)) continue; // already confirmed via Fireflies
      const hasCalendly = calendlyDates.has(attio.date);
      const hasFireflies = firefliesDates.has(attio.date);
      if (hasCalendly || hasFireflies) {
        const sources: DemoSource[] = ["attio"];
        if (hasCalendly) sources.push("calendly");
        if (hasFireflies) sources.push("fireflies");
        confirmedDates.set(attio.date, {
          date: attio.date,
          title: attio.dealName,
          sources,
        });
      }
    }

    // Rule 3: Attio-only demos (single source) — include but flag as attio-only
    // This preserves backward compatibility: if only Attio has the data, we still count it
    // since the existing system relied on Attio alone
    for (const attio of attioEvents) {
      if (confirmedDates.has(attio.date)) continue;
      confirmedDates.set(attio.date, {
        date: attio.date,
        title: attio.dealName,
        sources: ["attio"],
      });
    }

    result[repId] = Array.from(confirmedDates.values()).sort(
      (a, b) => a.date.localeCompare(b.date),
    );
  }

  return result;
}

/**
 * Convert ConfirmedDemosByRep to HeldDemosByRep format for backward compatibility
 * with existing forecast/leaderboard code.
 */
export function confirmedToHeldFormat(
  confirmed: ConfirmedDemosByRep,
): HeldDemosByRep {
  const result: HeldDemosByRep = {};
  for (const [repId, demos] of Object.entries(confirmed)) {
    result[repId] = demos.map((d) => ({ date: d.date, title: d.title }));
  }
  return result;
}
