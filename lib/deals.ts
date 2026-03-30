// SERVER-ONLY -- Shared Attio deal-fetching and aggregation logic.
// Both the exec route and rep route call these functions so the numbers always match.

import { attioQuery, getVal } from "@/lib/attio";
import {
    AEConfig, BDRConfig, buildOwnerMap, getActiveAEs,
    calcAECommission, calcBDRCommission, BDR_DATA,
} from "@/lib/commission-config";
import { fetchScheduledDemosFromCalendly, ScheduledDemoCounts } from "@/lib/calendly";
import { fetchHeldDemosFromFireflies, HeldDemosByRep } from "@/lib/fireflies";

// ─── Constants ──────────────────────────────────────────────────────────────

// Churn: from Users object (has subscription_cancel_request_date attribute).
const CHURN_REQUEST_DATE_ATTR = process.env.ATTIO_CHURN_REQUEST_DATE_ATTR || "subscription_cancel_request_date";
// Users object slug in Attio (object containing customer records with subscription_cancel_request_date).
// Can be a slug like "users" or the object UUID.
const USERS_OBJECT_SLUG = process.env.ATTIO_USERS_OBJECT_SLUG ?? "users";
// Attribute on Users object that links to the Person record.
const USERS_PERSON_ATTR = process.env.ATTIO_USERS_PERSON_ATTR ?? "person";
// Deals link to People -- the person record_id matches the Users' person attribute.
// Note: SQL shows "associated_people" (plural) - the code tries both.
const DEAL_PARENT_ATTR = process.env.ATTIO_DEAL_PARENT_ATTR || "associated_people";

const DEMO_HELD_DATE_ATTR = process.env.ATTIO_DEMO_HELD_DATE_ATTR || "demo_held_date";

const PAGE_SIZE = 500;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AERollup {
  grossARR: number;
  churnARR: number;
  netARR: number;
  dealCount: number;
  churnCount: number;
  closedLostCount: number;
  closedLostARR: number;
  optOutARR: number;
  optOutCount: number;
}

export interface ChurnedUser {
  personRecordId: string;
  churnDate: string; // "YYYY-MM-DD"
}

export interface ChurnAggregation {
  perAE: Record<string, { churnCount: number; churnARR: number }>;
  unattributed: { churnCount: number; churnARR: number };
}

export interface OptOutAggregation {
  perAE: Record<string, { optOutCount: number; optOutARR: number; deals: DealDetail[] }>;
}

export interface DealDetail {
  name: string;
  value: number;
  closeDate: string;
  recordId?: string;  // Attio record ID for deep-linking
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract the commission-relevant date from a deal (close_date — the month the deal was moved to Closed Won) */
function getDealDate(deal: any): string | null {
  const closeDate = getVal(deal, "close_date");
  if (!closeDate) return null;
  return String(closeDate).slice(0, 10);
}

export function getDemoHeldDate(deal: any): string | null {
  const d = getVal(deal, DEMO_HELD_DATE_ATTR);
  if (!d) return null;
  return String(d).slice(0, 10);
}


function getDealStage(deal: any): string | null {
  const s = getVal(deal, "stage");
  if (!s) return null;
  if (typeof s === "object") {
    if (s?.title) return s.title;
    if (s?.status?.title) return s.status.title;
  }
  return String(s);
}

/** Extract associated person record IDs from a deal. */
export function getDealPersonIds(deal: any): string[] {
  const rawVals = deal?.values?.[DEAL_PARENT_ATTR];
  const personIds: string[] = [];
  if (Array.isArray(rawVals)) {
    for (const v of rawVals) {
      const id = v?.target_record_id ?? v?.value;
      if (id) personIds.push(String(id));
    }
  } else {
    const id = getVal(deal, DEAL_PARENT_ATTR);
    if (id) personIds.push(String(id));
  }
  return personIds;
}

/** Check if value indicates churn (non-empty date). */
function hasChurnDate(val: any): boolean {
  if (val == null) return false;
  if (typeof val === "string") return val.trim() !== "";
  if (typeof val === "object" && val?.value != null) return true;
  return true;
}

/** Parse a churn date value from Attio into a "YYYY-MM-DD" string. */
function parseChurnDate(val: any): string | null {
  if (val == null) return null;
  let raw: string;
  if (typeof val === "string") {
    raw = val.trim();
  } else if (typeof val === "object" && val?.value != null) {
    raw = String(val.value).trim();
  } else {
    raw = String(val).trim();
  }
  if (!raw) return null;
  const dateStr = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return dateStr;
}

/**
 * Fetch users from the Users object who have subscription_cancel_request_date set.
 * Returns an array of ChurnedUser with personRecordId and the actual churn date,
 * so callers can filter by month.
 * 
 * The Users object has a "person" attribute that links to the Person record.
 * Deals link to People via "associated_person", so we use the person link from
 * the User record as the personRecordId.
 * 
 * Wrapped in try/catch so a failure here never crashes the whole dashboard.
 */
export async function fetchChurnedUsersFromUsersList(): Promise<ChurnedUser[]> {
  const churnedUsers: ChurnedUser[] = [];
  if (!USERS_OBJECT_SLUG) return churnedUsers;

  try {
    let offset = 0;
    let totalRecords = 0;
    while (true) {
      const page = await attioQuery(USERS_OBJECT_SLUG, {
        limit: PAGE_SIZE,
        offset,
      });
      const records = page?.data ?? [];
      totalRecords += records.length;

      for (const record of records) {
        const churnVal = getVal(record, CHURN_REQUEST_DATE_ATTR);
        if (!hasChurnDate(churnVal)) continue;
        
        // Get the linked Person record ID from the Users object
        const personId = getVal(record, USERS_PERSON_ATTR);
        if (!personId) continue;
        
        const dateStr = parseChurnDate(churnVal);
        if (!dateStr) continue;
        
        churnedUsers.push({
          personRecordId: String(personId),
          churnDate: dateStr,
        });
      }
      if (records.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    console.log(`[churn] Scanned ${totalRecords} user records, found ${churnedUsers.length} with churn dates`);
  } catch (err: any) {
    console.error(`[churn] Failed to fetch from Users object "${USERS_OBJECT_SLUG}":`, err?.message ?? err);
  }
  return churnedUsers;
}

/** Convert ChurnedUser array to a Set of person record IDs (for backward compat). */
export function churnedUsersToIdSet(users: ChurnedUser[]): Set<string> {
  return new Set(users.map(u => u.personRecordId));
}

/**
 * User-centric churn aggregation: starts from the Users list (churned users),
 * traces back through deals to attribute churn to AEs.
 *
 * For each user who churned in the selected month:
 *   1. Find their Closed Won deals (any close date) via associated_person
 *   2. Use the most recent deal's owner as the responsible AE
 *   3. Use that deal's value as churnARR
 */
export function buildChurnAggregation(
  churnedUsers: ChurnedUser[],
  startISO: string,
  endISO: string,
  closedWonDeals: any[],
  ownerMap: Record<string, string>,
  activeAEIds: Set<string>,
): ChurnAggregation {
  // Step 1: Filter to users who churned in the selected month
  const churnedInMonth = churnedUsers.filter(u =>
    u.churnDate >= startISO && u.churnDate <= endISO
  );

  // Step 2: Build reverse map from personRecordId → deals
  const dealsByPerson = new Map<string, any[]>();
  for (const deal of closedWonDeals) {
    const rawVals = deal?.values?.[DEAL_PARENT_ATTR];
    const personIds: string[] = [];
    if (Array.isArray(rawVals)) {
      for (const v of rawVals) {
        const id = v?.target_record_id ?? v?.value;
        if (id) personIds.push(String(id));
      }
    } else {
      const id = getVal(deal, DEAL_PARENT_ATTR);
      if (id) personIds.push(String(id));
    }
    for (const pid of personIds) {
      if (!dealsByPerson.has(pid)) dealsByPerson.set(pid, []);
      dealsByPerson.get(pid)!.push(deal);
    }
  }

  // Step 3: For each churned user, attribute to AE via most recent deal
  const perAE: Record<string, { churnCount: number; churnARR: number }> = {};
  let unattributedCount = 0;
  let unattributedARR = 0;

  for (const user of churnedInMonth) {
    const deals = dealsByPerson.get(user.personRecordId) || [];
    if (deals.length === 0) {
      unattributedCount += 1;
      continue;
    }

    // Find most recent deal by close_date
    let bestDeal = deals[0];
    let bestDate = getDealDate(deals[0]) || "";
    for (let i = 1; i < deals.length; i++) {
      const d = getDealDate(deals[i]) || "";
      if (d > bestDate) {
        bestDate = d;
        bestDeal = deals[i];
      }
    }

    const ownerUUID = getVal(bestDeal, "owner");
    const aeId = ownerMap[ownerUUID];
    const value = getVal(bestDeal, "value") || 0;

    if (!aeId || !activeAEIds.has(aeId)) {
      unattributedCount += 1;
      unattributedARR += value;
      continue;
    }

    if (!perAE[aeId]) perAE[aeId] = { churnCount: 0, churnARR: 0 };
    perAE[aeId].churnCount += 1;
    perAE[aeId].churnARR += value;
  }

  console.log(
    `[churn] Month ${startISO} to ${endISO}: ${churnedInMonth.length} users churned, ` +
    `attributed to ${Object.keys(perAE).length} AEs, ` +
    `${unattributedCount} unattributed`
  );

  return {
    perAE,
    unattributed: { churnCount: unattributedCount, churnARR: unattributedARR },
  };
}

/**
 * Opt-out aggregation: identifies deals where the associated user's churn request date
 * is within 30 days of the deal's close date. These are considered "opt-outs" where
 * the AE should not count towards closed ARR.
 *
 * Scope: Uses churn_request_date from the PRIOR month (passed via startISO/endISO).
 * This ensures opt-out totals are finalized and won't change mid-month.
 * Searches all closed won deals to find matches.
 */
export function buildOptOutAggregation(
  churnedUsers: ChurnedUser[],
  startISO: string,
  endISO: string,
  wonInMonth: any[],
  ownerMap: Record<string, string>,
  activeAEIds: Set<string>,
): OptOutAggregation {
  // Build map from personRecordId → churnDate for users whose churn date
  // falls within the provided churn window [startISO, endISO]. The caller
  // decides what that window represents (e.g. "previous month" for a given
  // reporting month).
  const churnDateByPerson = new Map<string, string>();
  for (const user of churnedUsers) {
    if (user.churnDate >= startISO && user.churnDate <= endISO) {
      churnDateByPerson.set(user.personRecordId, user.churnDate);
    }
  }

  const perAE: Record<string, { optOutCount: number; optOutARR: number; deals: DealDetail[] }> = {};

  for (const deal of wonInMonth) {
    const closeDate = getDealDate(deal);
    if (!closeDate) continue;

    // Get person IDs linked to this deal
    const rawVals = deal?.values?.[DEAL_PARENT_ATTR];
    const personIds: string[] = [];
    if (Array.isArray(rawVals)) {
      for (const v of rawVals) {
        const id = v?.target_record_id ?? v?.value;
        if (id) personIds.push(String(id));
      }
    } else {
      const id = getVal(deal, DEAL_PARENT_ATTR);
      if (id) personIds.push(String(id));
    }

    // Check if any associated person churned within 30 days of deal close
    let isOptOut = false;
    for (const personId of personIds) {
      const churnDate = churnDateByPerson.get(personId);
      if (churnDate) {
        const closeDateMs = new Date(closeDate).getTime();
        const churnDateMs = new Date(churnDate).getTime();
        const daysDiff = (churnDateMs - closeDateMs) / (1000 * 60 * 60 * 24);
        if (daysDiff >= 0 && daysDiff <= 30) {
          isOptOut = true;
          break;
        }
      }
    }

    if (!isOptOut) continue;

    const ownerUUID = getVal(deal, "owner");
    const aeId = ownerMap[ownerUUID];
    if (!aeId || !activeAEIds.has(aeId)) continue;

    const value = getVal(deal, "value") || 0;
    const dealName = getVal(deal, "name") || "Unnamed Deal";
    if (!perAE[aeId]) perAE[aeId] = { optOutCount: 0, optOutARR: 0, deals: [] };
    perAE[aeId].optOutCount += 1;
    perAE[aeId].optOutARR += value;
    perAE[aeId].deals.push({ name: String(dealName), value, closeDate, recordId: deal?.id?.record_id || undefined });
  }

  const totalOptOuts = Object.values(perAE).reduce((sum, v) => sum + v.optOutCount, 0);
  const totalOptOutARR = Object.values(perAE).reduce((sum, v) => sum + v.optOutARR, 0);
  console.log(
    `[opt-out] Churn window ${startISO} to ${endISO}: ${totalOptOuts} opt-out deals ($${totalOptOutARR.toLocaleString()} ARR), ` +
    `attributed to ${Object.keys(perAE).length} AEs`
  );

  return { perAE };
}

/**
 * Deal is churned if its linked record (e.g. company) is in the churned set,
 * OR the deal itself carries subscription_cancel_request_date.
 *
 * The linked-record attribute (associated_person) can surface as:
 *   - a single target_record_id string (getVal returns it)
 *   - multiple entries in the values array (getVal only returns the first)
 * We check all entries in the raw values array to be thorough.
 */
export function isChurnedDeal(deal: any, churnedRecordIds: Set<string>): boolean {
  if (churnedRecordIds.size > 0) {
    const rawVals = deal?.values?.[DEAL_PARENT_ATTR];
    if (Array.isArray(rawVals)) {
      for (const v of rawVals) {
        const id = v?.target_record_id ?? v?.value;
        if (id && churnedRecordIds.has(String(id))) return true;
      }
    } else {
      const linkedId = getVal(deal, DEAL_PARENT_ATTR);
      if (linkedId && churnedRecordIds.has(String(linkedId))) return true;
    }
  }
  const churnVal = getVal(deal, CHURN_REQUEST_DATE_ATTR);
  return hasChurnDate(churnVal);
}

// ─── Paginated Attio query ──────────────────────────────────────────────────

export async function fetchAllDeals(filter: object): Promise<any[]> {
  let allDeals: any[] = [];
  let offset = 0;
  while (true) {
    // Only include filter in query body if it has properties (empty filter returns 0 results)
    const hasFilter = Object.keys(filter).length > 0;
    const queryBody = hasFilter 
      ? { filter, limit: PAGE_SIZE, offset }
      : { limit: PAGE_SIZE, offset };
    const page = await attioQuery("deals", queryBody);
    const records = page?.data || [];
    allDeals = allDeals.concat(records);
    if (records.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allDeals;
}

// ─── Forecast Types & Computation ───────────────────────────────────────────

export interface AEForecast {
  scheduledDemos: number;
  trailing60DayCwRate: number | null;
  avgFunnelDays: number | null;
  avgDealSize: number;
  projectedARR: { low: number; mid: number; high: number };
}

export interface ForecastData {
  perAE: Record<string, AEForecast>;
  team: {
    totalScheduledDemos: number;
    blendedCwRate: number | null;
    avgFunnelDays: number | null;
    projectedARR: { low: number; mid: number; high: number };
    totalQuota: number;
  };
}

/**
 * Compute month-end forecast based on:
 * 1. Scheduled demos remaining this month (demo_scheduled_date > today && <= monthEnd)
 * 2. Trailing 60-day close rate (demo_held → closed_won)
 * 3. Average time-in-funnel days (demo_held → close_date for recent CW deals)
 * 4. Average deal size from recent CW deals
 */
function computeForecast(
  allDeals: any[],
  closedWonDeals: any[],
  activeAEs: AEConfig[],
  ownerMap: Record<string, string>,
  cwPersonIds: Set<string>,
  monthEndISO: string,
  scheduledDemoCounts: ScheduledDemoCounts,
  heldDemosByRep: HeldDemosByRep,
): ForecastData {
  const todayISO = new Date().toISOString().split("T")[0];
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  // 1. Scheduled demos per AE: pulled from Calendly
  const scheduledByAE: Record<string, number> = {};
  for (const ae of activeAEs) {
    scheduledByAE[ae.id] = scheduledDemoCounts[ae.id] || 0;
  }

  // 2. Trailing 60-day CW rate per AE: of demos held in last 60 days, what % converted?
  //    Primary source: Fireflies transcripts (meeting actually happened).
  //    Fallback: Attio demo_held_date field.
  const demoPeopleByAE: Record<string, Set<string>> = {};
  for (const ae of activeAEs) demoPeopleByAE[ae.id] = new Set();

  const hasFirefliesData = Object.values(heldDemosByRep).some((arr) => arr.length > 0);

  if (hasFirefliesData) {
    // Use Fireflies: count held demos per AE, then find associated deal person IDs
    // to compute conversion rate against cwPersonIds.
    for (const deal of allDeals) {
      const aeId = ownerMap[getVal(deal, "owner")];
      if (!aeId || !demoPeopleByAE[aeId]) continue;
      const heldDemos = heldDemosByRep[aeId] || [];
      if (heldDemos.length === 0) continue;
      // If this AE had any Fireflies-verified demos in the window,
      // include the deal's people for conversion tracking
      const demoDate = getDemoHeldDate(deal);
      const firefliesDates = new Set(heldDemos.map((d) => d.date));
      // Match by Attio demo_held_date OR just count all deals for AEs with Fireflies activity
      if (demoDate && firefliesDates.has(demoDate)) {
        for (const pid of getDealPersonIds(deal)) {
          demoPeopleByAE[aeId].add(pid);
        }
      }
    }
  } else {
    // Fallback: use Attio demo_held_date
    for (const deal of allDeals) {
      const demoDate = getDemoHeldDate(deal);
      if (!demoDate || demoDate < sixtyDaysAgo || demoDate > todayISO) continue;
      const aeId = ownerMap[getVal(deal, "owner")];
      if (aeId && demoPeopleByAE[aeId]) {
        for (const pid of getDealPersonIds(deal)) {
          demoPeopleByAE[aeId].add(pid);
        }
      }
    }
  }

  const cwRateByAE: Record<string, number | null> = {};
  for (const ae of activeAEs) {
    const people = demoPeopleByAE[ae.id];
    if (people.size === 0) { cwRateByAE[ae.id] = null; continue; }
    let converted = 0;
    for (const pid of Array.from(people)) {
      if (cwPersonIds.has(pid)) converted++;
    }
    cwRateByAE[ae.id] = converted / people.size;
  }

  // 3. Avg funnel days & avg deal size per AE: from CW deals closed in last 60 days
  const funnelDaysByAE: Record<string, number[]> = {};
  const dealSizesByAE: Record<string, number[]> = {};
  for (const ae of activeAEs) {
    funnelDaysByAE[ae.id] = [];
    dealSizesByAE[ae.id] = [];
  }

  for (const deal of closedWonDeals) {
    const closeDate = getVal(deal, "close_date");
    if (!closeDate) continue;
    const closeDateStr = String(closeDate).slice(0, 10);
    if (closeDateStr < sixtyDaysAgo) continue;

    const aeId = ownerMap[getVal(deal, "owner")];
    if (!aeId || !funnelDaysByAE[aeId]) continue;

    const value = getVal(deal, "value") || 0;
    dealSizesByAE[aeId].push(value);

    const demoDate = getDemoHeldDate(deal);
    if (demoDate) {
      const days = Math.round(
        (new Date(closeDateStr).getTime() - new Date(demoDate).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      if (days >= 0) funnelDaysByAE[aeId].push(days);
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Team-level fallbacks
  const allDealSizes = Object.values(dealSizesByAE).flat();
  const teamAvgDealSize = avg(allDealSizes);
  const allFunnelDays = Object.values(funnelDaysByAE).flat();
  const teamAvgFunnelDays = allFunnelDays.length > 0 ? avg(allFunnelDays) : null;

  // Blended team CW rate
  let totalDemoPeople = 0, totalConverted = 0;
  for (const ae of activeAEs) {
    const people = demoPeopleByAE[ae.id];
    totalDemoPeople += people.size;
    for (const pid of Array.from(people)) {
      if (cwPersonIds.has(pid)) totalConverted++;
    }
  }
  const blendedCwRate = totalDemoPeople > 0 ? totalConverted / totalDemoPeople : null;

  // Build per-AE forecast
  const perAE: Record<string, AEForecast> = {};
  let teamScheduledDemos = 0;
  let teamProjectedLow = 0, teamProjectedMid = 0, teamProjectedHigh = 0;
  let teamTotalQuota = 0;

  for (const ae of activeAEs) {
    const scheduled = scheduledByAE[ae.id];
    const cwRate = cwRateByAE[ae.id];
    const aeAvgDealSize = dealSizesByAE[ae.id].length > 0
      ? avg(dealSizesByAE[ae.id])
      : teamAvgDealSize;
    const aeAvgFunnelDays = funnelDaysByAE[ae.id].length > 0
      ? Math.round(avg(funnelDaysByAE[ae.id]))
      : teamAvgFunnelDays;

    // Use the AE's own rate, or fall back to team blended rate
    const effectiveRate = cwRate ?? blendedCwRate ?? 0;

    const additionalLow = scheduled * effectiveRate * 0.7 * aeAvgDealSize;
    const additionalMid = scheduled * effectiveRate * aeAvgDealSize;
    const additionalHigh = scheduled * effectiveRate * 1.2 * aeAvgDealSize;

    perAE[ae.id] = {
      scheduledDemos: scheduled,
      trailing60DayCwRate: cwRate,
      avgFunnelDays: aeAvgFunnelDays,
      avgDealSize: Math.round(aeAvgDealSize),
      projectedARR: {
        low: Math.round(additionalLow),
        mid: Math.round(additionalMid),
        high: Math.round(additionalHigh),
      },
    };

    teamScheduledDemos += scheduled;
    teamProjectedLow += additionalLow;
    teamProjectedMid += additionalMid;
    teamProjectedHigh += additionalHigh;
    teamTotalQuota += ae.monthlyQuota;
  }

  return {
    perAE,
    team: {
      totalScheduledDemos: teamScheduledDemos,
      blendedCwRate,
      avgFunnelDays: teamAvgFunnelDays != null ? Math.round(teamAvgFunnelDays) : null,
      projectedARR: {
        low: Math.round(teamProjectedLow),
        mid: Math.round(teamProjectedMid),
        high: Math.round(teamProjectedHigh),
      },
      totalQuota: teamTotalQuota,
    },
  };
}

// ─── Funnel Progression Leaderboard ────────────────────────────────────────

export interface FunnelLeaderboardEntry {
  id: string;
  name: string;
  initials: string;
  color: string;
  rank: number;
  demosInWindow: number;
  closedWonCount: number;
  tboCount: number;
  cwRate: number | null;       // null if 0 demos
  tboRate: number | null;      // null if 0 demos
  avgDaysToClose: number | null; // null if no CW deals with demo dates
  speedScore: number;          // 0–1, higher = faster
  compositeScore: number;      // 0–1, higher = better
}

export interface FunnelLeaderboard {
  entries: FunnelLeaderboardEntry[];
  windowStart: string;  // ISO date
  windowEnd: string;    // ISO date
}

/**
 * Compute trailing 30-day funnel progression leaderboard.
 * Ranks AEs by a composite of Demo→CW rate, Demo→TBO rate, and closing speed.
 */
function computeFunnelLeaderboard(
  allDeals: any[],
  closedWonDeals: any[],
  activeAEs: AEConfig[],
  ownerMap: Record<string, string>,
  cwPersonIds: Set<string>,
  tboPersonIds: Set<string>,
): FunnelLeaderboard {
  const todayISO = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const MAX_BENCHMARK_DAYS = 60;

  // Per-AE: collect person IDs from demos held in the trailing 30-day window
  const demoPeopleByAE: Record<string, Set<string>> = {};
  const demoCountByAE: Record<string, number> = {};
  for (const ae of activeAEs) {
    demoPeopleByAE[ae.id] = new Set();
    demoCountByAE[ae.id] = 0;
  }

  for (const deal of allDeals) {
    const demoDate = getDemoHeldDate(deal);
    if (!demoDate || demoDate < thirtyDaysAgo || demoDate > todayISO) continue;
    const aeId = ownerMap[getVal(deal, "owner")];
    if (!aeId || !demoPeopleByAE[aeId]) continue;
    demoCountByAE[aeId]++;
    for (const pid of getDealPersonIds(deal)) {
      demoPeopleByAE[aeId].add(pid);
    }
  }

  // Per-AE: count conversions and compute funnel days for CW deals
  const funnelDaysByAE: Record<string, number[]> = {};
  for (const ae of activeAEs) funnelDaysByAE[ae.id] = [];

  // For CW deals, compute demo→close days (only for deals whose demo was in the window)
  for (const deal of closedWonDeals) {
    const demoDate = getDemoHeldDate(deal);
    if (!demoDate || demoDate < thirtyDaysAgo || demoDate > todayISO) continue;
    const closeDate = getDealDate(deal);
    if (!closeDate) continue;
    const aeId = ownerMap[getVal(deal, "owner")];
    if (!aeId || !funnelDaysByAE[aeId]) continue;
    const days = Math.round(
      (new Date(closeDate).getTime() - new Date(demoDate).getTime()) /
      (1000 * 60 * 60 * 24)
    );
    if (days >= 0) funnelDaysByAE[aeId].push(days);
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Build entries
  const entries: FunnelLeaderboardEntry[] = [];
  for (const ae of activeAEs) {
    const people = demoPeopleByAE[ae.id];
    const demosInWindow = demoCountByAE[ae.id];

    let cwCount = 0;
    let tboCount = 0;
    for (const pid of Array.from(people)) {
      if (cwPersonIds.has(pid)) cwCount++;
      if (cwPersonIds.has(pid) || tboPersonIds.has(pid)) tboCount++;
    }

    const cwRate = people.size > 0 ? cwCount / people.size : null;
    const tboRate = people.size > 0 ? tboCount / people.size : null;
    const funnelDays = funnelDaysByAE[ae.id];
    const avgDaysToClose = funnelDays.length > 0 ? Math.round(avg(funnelDays)) : null;
    const speedScore = avgDaysToClose != null
      ? Math.max(0, 1 - avgDaysToClose / MAX_BENCHMARK_DAYS)
      : 0;

    // Composite: 45% CW rate, 20% TBO rate, 35% speed
    const compositeScore = cwRate != null
      ? (cwRate * 0.45) + ((tboRate ?? 0) * 0.20) + (speedScore * 0.35)
      : 0;

    entries.push({
      id: ae.id,
      name: ae.name,
      initials: ae.initials,
      color: ae.color,
      rank: 0, // assigned after sorting
      demosInWindow,
      closedWonCount: cwCount,
      tboCount,
      cwRate,
      tboRate,
      avgDaysToClose,
      speedScore,
      compositeScore: Math.round(compositeScore * 1000) / 1000,
    });
  }

  // Sort by composite score descending, assign ranks
  entries.sort((a, b) => b.compositeScore - a.compositeScore);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return {
    entries,
    windowStart: thirtyDaysAgo,
    windowEnd: todayISO,
  };
}

// ─── Main data-fetching function ────────────────────────────────────────────

export interface MonthData {
  aeResults: {
    id: string; name: string; role: string; initials: string; color: string;
    type: "ae"; monthlyQuota: number; annualQuota: number;
    grossARR: number; churnARR: number; netARR: number;
    dealCount: number; churnCount: number; closedLostCount: number; closedLostARR: number;
    optOutARR: number; optOutCount: number;
    cwRate: number | null;
    tboRate: number | null;
    demoCount: number;
    priorCwRate: number | null;
    priorTboRate: number | null;
    priorDemoCount: number;
    attainment: number; commission: number;
    tierBreakdown: { label?: string; amount: number }[];
    closedWonDeals: DealDetail[];
    optOutDeals: DealDetail[];
  }[];
  bdrResult: {
    id: string; name: string; role: string; initials: string; color: string;
    type: "bdr"; monthlyQuota: number;
    totalMeetings: number; netMeetings: number;
    attainment: number; commission: number;
  };
  forecast: ForecastData | null;
  funnelLeaderboard: FunnelLeaderboard | null;
  meta: {
    fetchedAt: string; dealCount: number; monthLabel: string;
    selectedMonth: string; warning?: string;
  };
}

export async function fetchMonthData(
    startISO: string,
    endISO: string,
    monthLabel: string,
    selectedMonthStr: string,
  ): Promise<MonthData> {
    const OWNER_MAP = buildOwnerMap();
  const activeAEs = getActiveAEs(selectedMonthStr);

  // User-centric churn: fetch churned users with dates, then attribute to AEs via deals
  const churnedUsers = await fetchChurnedUsersFromUsersList();

  const closedWonDeals = await fetchAllDeals({ stage: "Closed Won" });
  const wonInMonth = closedWonDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

  // Build churn aggregation from Users list → deals → AEs
  const activeAEIds = new Set(activeAEs.map(ae => ae.id));
  const churnAgg = buildChurnAggregation(
    churnedUsers, startISO, endISO,
    closedWonDeals, OWNER_MAP, activeAEIds,
  );
  // Build opt-out aggregation: opt-outs for a *reporting* month are driven by
  // churn_request_date in the *previous* calendar month. A deal is an opt-out
  // for the reporting month if:
  //   - its linked user has churn_request_date in that prior month window, and
  //   - the churn_request_date is within 30 days of the deal's close_date.
  //
  // This means the opt-out month is effectively "month after churn", and deals
  // may have closed earlier (e.g. late January close with February churn
  // contributes to March opt-out metrics).
  const selectedDate = new Date(startISO);
  const priorMonth = selectedDate.getUTCMonth(); // 0-indexed, gives prior month
  const priorYear = priorMonth === 0
    ? selectedDate.getUTCFullYear() - 1
    : selectedDate.getUTCFullYear();
  const priorMonthNum = priorMonth === 0 ? 12 : priorMonth;
  const priorStart = new Date(Date.UTC(priorYear, priorMonthNum - 1, 1));
  const priorEnd = new Date(Date.UTC(priorYear, priorMonthNum, 0));
  const churnWindowStart = priorStart.toISOString().split("T")[0];
  const churnWindowEnd = priorEnd.toISOString().split("T")[0];

  const closedWonInPriorMonth = closedWonDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= churnWindowStart && d <= churnWindowEnd;
  });
  const optOutAgg = buildOptOutAggregation(
    churnedUsers, churnWindowStart, churnWindowEnd,
    closedWonInPriorMonth, OWNER_MAP, activeAEIds,
  );

  const closedLostDeals = await fetchAllDeals({ stage: "Closed Lost" });
  const lostInMonth = closedLostDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

  // Intro calls: fetch deals in "Introductory Call" stage for calls-per-close metric
  let introCallDeals: any[] = [];
  try { introCallDeals = await fetchAllDeals({ stage: "Introductory Call" }); } catch {}
  const introInMonth = introCallDeals.filter((deal: any) => {
    const d = getDealDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });
  const introCountByAE: Record<string, number> = {};
  for (const ae of activeAEs) introCountByAE[ae.id] = 0;
  for (const deal of introInMonth) {
    const aeId = OWNER_MAP[getVal(deal, "owner")];
    if (aeId && introCountByAE[aeId] !== undefined) introCountByAE[aeId] += 1;
  }

  const agg: Record<string, AERollup> = {};
  const closedWonDealsByAE: Record<string, DealDetail[]> = {};
  for (const ae of activeAEs) {
    agg[ae.id] = {
      grossARR: 0, churnARR: 0, netARR: 0,
      dealCount: 0, churnCount: 0,
      closedLostCount: 0, closedLostARR: 0,
      optOutARR: 0, optOutCount: 0,
    };
    closedWonDealsByAE[ae.id] = [];
  }

  // Count ALL Closed Won deals in month as gross ARR (no deal-level churn exclusion)
  for (const deal of wonInMonth) {
    const ownerUUID = getVal(deal, "owner");
    const aeId = OWNER_MAP[ownerUUID];
    if (!aeId || !agg[aeId]) continue;
    const value = getVal(deal, "value") || 0;
    const closeDate = getDealDate(deal) || "";
    const dealName = getVal(deal, "name") || "Unnamed Deal";
    agg[aeId].grossARR += value;
    agg[aeId].dealCount += 1;
    closedWonDealsByAE[aeId].push({ name: String(dealName), value, closeDate, recordId: deal?.id?.record_id || undefined });
  }

  // Apply user-centric churn data
  for (const [aeId, churnData] of Object.entries(churnAgg.perAE)) {
    if (!agg[aeId]) continue;
    agg[aeId].churnCount = churnData.churnCount;
    agg[aeId].churnARR = churnData.churnARR;
  }

  // Apply opt-out data (deals where user churned within 30 days of close)
  for (const [aeId, optOutData] of Object.entries(optOutAgg.perAE)) {
    if (!agg[aeId]) continue;
    agg[aeId].optOutCount = optOutData.optOutCount;
    agg[aeId].optOutARR = optOutData.optOutARR;
  }

  for (const deal of lostInMonth) {
    const ownerUUID = getVal(deal, "owner");
    const aeId = OWNER_MAP[ownerUUID];
    if (!aeId || !agg[aeId]) continue;
    const value = getVal(deal, "value") || 0;
    agg[aeId].closedLostCount += 1;
    agg[aeId].closedLostARR += value;
  }

  for (const id of Object.keys(agg)) {
    agg[id].netARR = agg[id].grossARR - agg[id].optOutARR;
  }

  // Close rates: cohort-based — of demos held in a given period, how many converted?
  // Match demo deals to CW/TBO deals via shared associated_people person IDs.
  const allDeals = await fetchAllDeals({});

  // TBO deals (current pipeline)
  let tboDeals: any[] = [];
  try { tboDeals = await fetchAllDeals({ stage: "To Be Onboarded" }); } catch {}

  // Build sets of person IDs that reached CW (all time) or are in TBO
  const cwPersonIds = new Set<string>();
  for (const deal of closedWonDeals) {
    for (const pid of getDealPersonIds(deal)) cwPersonIds.add(pid);
  }
  const tboPersonIds = new Set<string>();
  for (const deal of tboDeals) {
    for (const pid of getDealPersonIds(deal)) tboPersonIds.add(pid);
  }

  // Helper: compute cohort conversion rates for demos held in [rangeStart, rangeEnd]
  function computeCohortRates(rangeStart: string, rangeEnd: string) {
    const demos = allDeals.filter((deal: any) => {
      const d = getDemoHeldDate(deal);
      return d && d >= rangeStart && d <= rangeEnd;
    });
    const demoPeopleByAE: Record<string, Set<string>> = {};
    for (const ae of activeAEs) demoPeopleByAE[ae.id] = new Set();
    for (const deal of demos) {
      const aeId = OWNER_MAP[getVal(deal, "owner")];
      if (!aeId || !demoPeopleByAE[aeId]) continue;
      for (const pid of getDealPersonIds(deal)) {
        demoPeopleByAE[aeId].add(pid);
      }
    }
    const counts: Record<string, number> = {};
    const cw: Record<string, number | null> = {};
    const tbo: Record<string, number | null> = {};
    for (const ae of activeAEs) {
      const people = demoPeopleByAE[ae.id];
      const cnt = people.size;
      counts[ae.id] = cnt;
      if (cnt === 0) { cw[ae.id] = null; tbo[ae.id] = null; continue; }
      let cwC = 0, tboC = 0;
      for (const pid of Array.from(people)) {
        if (cwPersonIds.has(pid)) cwC++;
        if (cwPersonIds.has(pid) || tboPersonIds.has(pid)) tboC++;
      }
      cw[ae.id] = cwC / cnt;
      tbo[ae.id] = tboC / cnt;
    }
    return { demoCounts: counts, cwRates: cw, tboRates: tbo };
  }

  // Current month rates
  const { demoCounts, cwRates, tboRates } = computeCohortRates(startISO, endISO);

  // Prior month rates (same cohort logic, previous calendar month)
  const priorStartISO = churnWindowStart; // already computed above
  const priorEndISO = churnWindowEnd;
  const { demoCounts: priorDemoCounts, cwRates: priorCwRates, tboRates: priorTboRates } = computeCohortRates(priorStartISO, priorEndISO);

  // demosInMonth needed for BDR meeting count below
  const demosInMonth = allDeals.filter((deal: any) => {
    const d = getDemoHeldDate(deal);
    if (!d) return false;
    return d >= startISO && d <= endISO;
  });

  const aeResults = activeAEs.map((ae) => {
    const a = agg[ae.id] || {
      grossARR: 0, churnARR: 0, netARR: 0,
      dealCount: 0, churnCount: 0,
      closedLostCount: 0, closedLostARR: 0,
      optOutARR: 0, optOutCount: 0,
    };
    const { commission, attainment, tierBreakdown } = calcAECommission(
      ae.monthlyQuota, ae.tiers, a.netARR,
    );
    const demoCount = demoCounts[ae.id] || 0;
    const cwRate = cwRates[ae.id] ?? null;
    const tboRate = tboRates[ae.id] ?? null;
    const optOutData = optOutAgg.perAE[ae.id];
    return {
      id: ae.id, name: ae.name, role: ae.role,
      initials: ae.initials, color: ae.color,
      type: "ae" as const,
      monthlyQuota: ae.monthlyQuota, annualQuota: ae.annualQuota,
      grossARR: a.grossARR, churnARR: a.churnARR, netARR: a.netARR,
      dealCount: a.dealCount, churnCount: a.churnCount,
      closedLostCount: a.closedLostCount, closedLostARR: a.closedLostARR,
      optOutARR: a.optOutARR, optOutCount: a.optOutCount,
      cwRate,
      tboRate,
      demoCount,
      priorCwRate: priorCwRates[ae.id] ?? null,
      priorTboRate: priorTboRates[ae.id] ?? null,
      priorDemoCount: priorDemoCounts[ae.id] || 0,
      introCallCount: introCountByAE[ae.id] || 0,
      attainment, commission,
      tierBreakdown: tierBreakdown.map((t) => ({ label: t.label, amount: t.amount })),
      closedWonDeals: closedWonDealsByAE[ae.id] || [],
      optOutDeals: optOutData?.deals || [],
    };
  });

  // BDR meetings: count deals where BDR is lead_owner and demo_held_date is in this month
  let maxMeetings = 0;
  for (const deal of demosInMonth) {
    const leadOwner = getVal(deal, "lead_owner");
    if (leadOwner === process.env.ATTIO_MAX_UUID) maxMeetings += 1;
  }

  const {
    commission: bdrCommission,
    attainment: bdrAttainment,
    monthlyQuota: bdrMonthlyQuota,
  } = calcBDRCommission(maxMeetings, selectedMonthStr);
  const bdrResult = {
    id: "max", name: BDR_DATA.name, role: BDR_DATA.role,
    initials: BDR_DATA.initials, color: BDR_DATA.color,
    type: "bdr" as const,
    monthlyQuota: bdrMonthlyQuota,
    totalMeetings: maxMeetings, netMeetings: maxMeetings,
    attainment: bdrAttainment, commission: bdrCommission,
  };

  const totalDeals = wonInMonth.length;
  const today = new Date().getUTCDate();
  const warning = totalDeals === 0 && today > 5
    ? "No Closed Won deals found for this month -- check Attio data"
    : undefined;

  // ─── Forecast (current month only) ─────────────────────────────────────
  const currentMonth = (() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  let forecast: ForecastData | null = null;
  if (selectedMonthStr === currentMonth) {
    const todayISO = new Date().toISOString().split("T")[0];
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    const reps = activeAEs.map((ae) => ({ id: ae.id, email: ae.email }));
    reps.push({ id: BDR_DATA.id, email: BDR_DATA.email });

    // Fetch Calendly bookings + Fireflies held demos in parallel
    const [scheduledDemoCounts, heldDemosByRep] = await Promise.all([
      fetchScheduledDemosFromCalendly(reps, todayISO, endISO),
      fetchHeldDemosFromFireflies(reps, sixtyDaysAgo, todayISO),
    ]);

    forecast = computeForecast(
      allDeals, closedWonDeals, activeAEs, OWNER_MAP, cwPersonIds, endISO,
      scheduledDemoCounts, heldDemosByRep,
    );
  }

  // ─── Funnel Progression Leaderboard (always computed, trailing 30 days) ──
  const funnelLeaderboard = computeFunnelLeaderboard(
    allDeals, closedWonDeals, activeAEs, OWNER_MAP, cwPersonIds, tboPersonIds,
  );

  return {
    aeResults,
    bdrResult,
    forecast,
    funnelLeaderboard,
    meta: {
      fetchedAt: new Date().toISOString(),
      dealCount: totalDeals,
      monthLabel,
      selectedMonth: selectedMonthStr,
      warning,
    },
  };
}
