// SERVER-ONLY -- This file must NEVER be imported by "use client" components.

export interface AEConfig {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  email: string;
  baseSalary: number;
  variable: number;
  ote: number;
  monthlyQuota: number;
  annualQuota: number;
  tiers: { label: string; ceiling: number; rate: number }[];
  type: "ae";
  activeFrom?: string;
  activeTo?: string;
  /** AE ramp schedule: [month1%, month2%, month3%] of quota.
   *  E.g. [0.5, 0.75, 1.0] means 50% in month 1, 75% in month 2, full quota month 3+.
   *  If omitted, AE is at full quota from their first active month. */
  rampSchedule?: [number, number, number];
}

export interface BDRConfig {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  email: string;
  baseSalary: number;
  variable: number;
  ote: number;
  monthlyQuota: number; // full-performance quota (months 4+)
  monthlyTargetVariable: number;
  perMeetingRate: number;
  acceleratorRate: number;
  acceleratorThreshold: number;
  rampQuotas: [number, number, number]; // month 1, 2, 3
  startDate: string; // ISO "YYYY-MM-DD"
  type: "bdr";
}

export const AE_DATA: AEConfig[] = [
  {
    id: "jason", name: "Jason Vigilante", role: "Founding Account Executive",
    initials: "JV", color: "#3B82F6", email: "jason@finny.com",
    baseSalary: 120000, variable: 120000, ote: 240000,
    monthlyQuota: 166666.67, annualQuota: 2000000,
    tiers: [
      { label: "0-100%", ceiling: 1.0, rate: 0.09 },
      { label: "100-120%", ceiling: 1.2, rate: 0.11 },
      { label: "120%+", ceiling: Infinity, rate: 0.13 },
    ],
    type: "ae",
  },
  {
    id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive",
    initials: "KK", color: "#F59E0B", email: "kelcy@finny.com",
    baseSalary: 168000, variable: 72000, ote: 240000,
    monthlyQuota: 166666.67, annualQuota: 2000000,
    tiers: [
      { label: "0-100%", ceiling: 1.0, rate: 0.04 },
      { label: "100-120%", ceiling: 1.2, rate: 0.05 },
      { label: "120%+", ceiling: Infinity, rate: 0.06 },
    ],
    type: "ae",
  },
  {
    id: "austin", name: "Austin Guest", role: "Account Executive",
    initials: "AG", color: "#10B981", email: "austin@finny.com",
    baseSalary: 120000, variable: 120000, ote: 240000,
    monthlyQuota: 166666.67, annualQuota: 2000000,
    tiers: [
      { label: "0-100%", ceiling: 1.0, rate: 0.09 },
      { label: "100-120%", ceiling: 1.2, rate: 0.11 },
      { label: "120%+", ceiling: Infinity, rate: 0.13 },
    ],
    type: "ae",
    activeFrom: "2025-11",
    activeTo: "2026-01",
  },
  {
    id: "roy", name: "Roy Kasten", role: "Account Executive",
    initials: "RK", color: "#EF4444", email: "roy@finny.com",
    baseSalary: 0, variable: 0, ote: 0,
    monthlyQuota: 208333.33, annualQuota: 2500000,
    tiers: [
      { label: "0-100%", ceiling: 1.0, rate: 0.09 },
      { label: "100-120%", ceiling: 1.2, rate: 0.11 },
      { label: "120%+", ceiling: Infinity, rate: 0.13 },
    ],
    type: "ae",
    activeFrom: "2026-02",
    rampSchedule: [0.5, 0.75, 1.0], // 50% month 1, 75% month 2, 100% month 3+
  },
];

export interface AERampInfo {
  rampFactor: number;      // 0.5, 0.75, or 1.0
  rampMonth: number | null; // 1, 2, 3, or null if not ramping
  isRamping: boolean;
}

export function getAERampInfo(ae: AEConfig, selectedMonth: string): AERampInfo {
  if (!ae.rampSchedule || !ae.activeFrom) {
    return { rampFactor: 1.0, rampMonth: null, isRamping: false };
  }
  const [selYear, selMonth] = selectedMonth.split("-").map(Number);
  const [startYear, startMonth] = ae.activeFrom.split("-").map(Number);
  if (!selYear || !selMonth || !startYear || !startMonth) {
    return { rampFactor: 1.0, rampMonth: null, isRamping: false };
  }
  const tenureMonth = (selYear - startYear) * 12 + (selMonth - startMonth) + 1;
  if (tenureMonth <= 0) {
    return { rampFactor: 0, rampMonth: null, isRamping: false };
  }
  const rampIdx = Math.min(tenureMonth - 1, 2); // 0, 1, or 2
  const rampFactor = ae.rampSchedule[rampIdx];
  const isRamping = rampFactor < 1.0;
  return { rampFactor, rampMonth: tenureMonth <= 3 ? tenureMonth : null, isRamping };
}

export const BDR_DATA: BDRConfig = {
  id: "max", name: "Max Zajec", role: "Founding BDR",
  initials: "MZ", color: "#8B5CF6", email: "max@finny.com",
  baseSalary: 70000, variable: 10000, ote: 80000,
  monthlyQuota: 25, monthlyTargetVariable: 833.33,
  perMeetingRate: 33, acceleratorRate: 40, acceleratorThreshold: 1.25,
  rampQuotas: [15, 20, 25],
  startDate: "2025-11-01",
  type: "bdr",
};

export function getActiveAEs(month: string): AEConfig[] {
  return AE_DATA.filter((ae) => {
    if (ae.activeFrom && month < ae.activeFrom) return false;
    if (ae.activeTo && month > ae.activeTo) return false;
    return true;
  });
}

/**
 * Get the effective monthly quota for an AE, accounting for ramp schedule.
 * AEs with a rampSchedule get reduced quota in their first months:
 *   Month 1: rampSchedule[0] * monthlyQuota (e.g. 50%)
 *   Month 2: rampSchedule[1] * monthlyQuota (e.g. 75%)
 *   Month 3+: rampSchedule[2] * monthlyQuota (e.g. 100%)
 */
export function getAEEffectiveQuota(ae: AEConfig, selectedMonth: string): number {
  if (!ae.rampSchedule || !ae.activeFrom) return ae.monthlyQuota;

  // Calculate tenure month (1-indexed)
  const [selYear, selMonth] = selectedMonth.split("-").map(Number);
  const [startYear, startMonth] = ae.activeFrom.split("-").map(Number);
  if (!selYear || !selMonth || !startYear || !startMonth) return ae.monthlyQuota;

  const tenureMonth = (selYear - startYear) * 12 + (selMonth - startMonth) + 1;
  if (tenureMonth <= 0) return ae.monthlyQuota;

  const rampIdx = Math.min(tenureMonth - 1, 2); // 0, 1, or 2
  return ae.monthlyQuota * ae.rampSchedule[rampIdx];
}

export function calcAECommission(
  quota: number,
  tiers: { label?: string; ceiling: number; rate: number }[],
  netARR: number,
  rampFactor?: number,
) {
  // Apply ramp factor: scales down the effective quota and tier ceilings proportionally
  const effectiveQuota = rampFactor != null && rampFactor < 1
    ? quota * rampFactor
    : quota;
  const attainment = effectiveQuota > 0 ? netARR / effectiveQuota : 0;

  // Scale tier ceilings proportionally when ramping
  const effectiveTiers = rampFactor != null && rampFactor < 1
    ? tiers.map((t) => ({
        ...t,
        ceiling: t.ceiling === Infinity ? Infinity : t.ceiling,
        // Tier rates apply at the same percentages of the ramped quota
      }))
    : tiers;

  let commission = 0;
  const tierBreakdown: { label?: string; ceiling: number; rate: number; amount: number }[] = [];
  for (let i = 0; i < effectiveTiers.length; i++) {
    const prevCeiling = i === 0 ? 0 : effectiveTiers[i - 1].ceiling;
    if (attainment <= prevCeiling) {
      tierBreakdown.push({ ...effectiveTiers[i], amount: 0 });
      continue;
    }
    const cappedAttainment = Math.min(attainment, effectiveTiers[i].ceiling);
    const tierCommission = (cappedAttainment - prevCeiling) * effectiveQuota * effectiveTiers[i].rate;
    commission += tierCommission;
    tierBreakdown.push({ ...effectiveTiers[i], amount: tierCommission });
  }
  commission = Math.max(0, commission);
  return { commission, attainment, tierBreakdown, effectiveQuota };
}

function getBdrTenureMonth(bdr: BDRConfig, selectedMonth: string): number {
  const [year, month] = selectedMonth.split("-").map(Number);
  const [startYear, startMonth] = bdr.startDate.split("-").map(Number);
  if (!year || !month || !startYear || !startMonth) return 0;
  return (year - startYear) * 12 + (month - startMonth) + 1;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getBdrQuotaForMonth(bdr: BDRConfig, selectedMonth: string, tenureMonth: number): number {
  if (tenureMonth <= 0) return 0;
  const [year, month] = selectedMonth.split("-").map(Number);
  if (!year || !month) return 0;

  if (tenureMonth === 1) {
    const [, , startDayStr] = bdr.startDate.split("-");
    const startDay = Number(startDayStr);
    const daysInMonth = getDaysInMonth(year, month);
    if (!startDay || !daysInMonth) return bdr.rampQuotas[0];
    const daysLeft = Math.max(0, Math.min(daysInMonth - startDay + 1, daysInMonth));
    const factor = daysInMonth > 0 ? daysLeft / daysInMonth : 0;
    const prorated = bdr.rampQuotas[0] * factor;
    return Math.ceil(prorated);
  }

  if (tenureMonth === 2) return bdr.rampQuotas[1];
  if (tenureMonth === 3) return bdr.rampQuotas[2];
  return bdr.monthlyQuota;
}

function calcBdrRampCommission(bdr: BDRConfig, netMeetings: number, quota: number): number {
  if (quota <= 0) return 0;
  if (netMeetings < quota) return 0;
  const extraMeetings = netMeetings - quota;
  return bdr.monthlyTargetVariable + extraMeetings * bdr.perMeetingRate;
}

function calcBdrFullCommission(bdr: BDRConfig, netMeetings: number): number {
  if (netMeetings <= 0) return 0;
  const baseMeetings = Math.floor(bdr.monthlyQuota * bdr.acceleratorThreshold);
  if (netMeetings <= baseMeetings) {
    return netMeetings * bdr.perMeetingRate;
  }
  return baseMeetings * bdr.perMeetingRate
    + (netMeetings - baseMeetings) * bdr.acceleratorRate;
}

export function calcBDRCommission(netMeetings: number, selectedMonth: string) {
  const bdr = BDR_DATA;
  const tenureMonth = getBdrTenureMonth(bdr, selectedMonth);
  const monthlyQuota = getBdrQuotaForMonth(bdr, selectedMonth, tenureMonth);

  let commission: number;
  if (tenureMonth <= 0 || monthlyQuota <= 0) {
    commission = 0;
  } else if (tenureMonth <= 3) {
    commission = calcBdrRampCommission(bdr, netMeetings, monthlyQuota);
  } else {
    commission = calcBdrFullCommission(bdr, netMeetings);
  }

  const attainment = monthlyQuota > 0 ? netMeetings / monthlyQuota : 0;
  return { commission, attainment, monthlyQuota, tenureMonth };
}

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

export function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    startISO: start.toISOString().split("T")[0],
    endISO: end.toISOString().split("T")[0],
    label: start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    year,
    month,
  };
}

export function getCurrentMonthRange() {
  const now = new Date();
  return getMonthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function parseMonthParam(monthStr: string | null): { year: number; month: number } {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    if (y >= 2025 && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function getAvailableMonths(): { value: string; label: string }[] {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;
  const months: { value: string; label: string }[] = [];
  let y = 2025, m = 11;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const d = new Date(Date.UTC(y, m - 1, 1));
    months.push({
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

export function buildOwnerMap(): Record<string, string> {
  const map: Record<string, string> = {};
  if (process.env.ATTIO_JASON_UUID) map[process.env.ATTIO_JASON_UUID] = "jason";
  if (process.env.ATTIO_KELCY_UUID) map[process.env.ATTIO_KELCY_UUID] = "kelcy";
  if (process.env.ATTIO_AUSTIN_UUID) map[process.env.ATTIO_AUSTIN_UUID] = "austin";
  if (process.env.ATTIO_ROY_UUID) map[process.env.ATTIO_ROY_UUID] = "roy";
  return map;
}
