// SERVER-ONLY -- This file must NEVER be imported by "use client" components.

export interface AEConfig {
    id: string;
    name: string;
    role: string;
    initials: string;
    color: string;
    baseSalary: number;
    variable: number;
    ote: number;
    monthlyQuota: number;
    annualQuota: number;
    tiers: { label: string; ceiling: number; rate: number }[];
    type: "ae";
    activeFrom?: string;
    activeTo?: string;
}

export interface BDRConfig {
    id: string;
    name: string;
    role: string;
    initials: string;
    color: string;
    baseSalary: number;
    variable: number;
    ote: number;
    monthlyQuota: number;
    monthlyTargetVariable: number;
    perMeetingRate: number;
    acceleratorRate: number;
    acceleratorThreshold: number;
    type: "bdr";
}

export const AE_DATA: AEConfig[] = [
  {
        id: "jason",
        name: "Jason Vigilante",
        role: "Founding Account Executive",
        initials: "JV",
        color: "#3B82F6",
        baseSalary: 120000,
        variable: 120000,
        ote: 240000,
        monthlyQuota: 166666.67,
        annualQuota: 2000000,
        tiers: [
          { label: "0-100%", ceiling: 1.0, rate: 0.09 },
          { label: "100-120%", ceiling: 1.2, rate: 0.11 },
          { label: "120%+", ceiling: Infinity, rate: 0.13 },
              ],
        type: "ae",
  },
  {
        id: "kelcy",
        name: "Kelcy Koenig",
        role: "Founding Account Executive",
        initials: "KK",
        color: "#F59E0B",
        baseSalary: 168000,
        variable: 72000,
        ote: 240000,
        monthlyQuota: 150000,
        annualQuota: 1800000,
        tiers: [
          { label: "0-100%", ceiling: 1.0, rate: 0.04 },
          { label: "100-120%", ceiling: 1.2, rate: 0.05 },
          { label: "120%+", ceiling: Infinity, rate: 0.06 },
              ],
        type: "ae",
  },
  {
        id: "austin",
        name: "Austin Guest",
        role: "Account Executive",
        initials: "AG",
        color: "#10B981",
        baseSalary: 120000,
        variable: 120000,
        ote: 240000,
        monthlyQuota: 166666.67,
        annualQuota: 2000000,
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
        id: "roy",
        name: "Roy Kasten",
        role: "Account Executive",
        initials: "RK",
        color: "#EF4444",
        baseSalary: 0,
        variable: 0,
        ote: 0,
        monthlyQuota: 166666.67,
        annualQuota: 2000000,
        tiers: [
          { label: "0-100%", ceiling: 1.0, rate: 0.09 },
          { label: "100-120%", ceiling: 1.2, rate: 0.11 },
          { label: "120%+", ceiling: Infinity, rate: 0.13 },
              ],
        type: "ae",
        activeFrom: "2026-02",
  },
  ];

export const BDR_DATA: BDRConfig = {
    id: "max",
    name: "Max Zajec",
    role: "Founding BDR",
    initials: "MZ",
    color: "#8B5CF6",
    baseSalary: 70000,
    variable: 10000,
    ote: 80000,
    monthlyQuota: 15,
    monthlyTargetVariable: 833.33,
    perMeetingRate: 33,
    acceleratorRate: 40,
    acceleratorThreshold: 1.25,
    type: "bdr",
};

export function getActiveAEs(month: string): AEConfig[] {
    return AE_DATA.filter((ae) => {
          if (ae.activeFrom && month < ae.activeFrom) return false;
          if (ae.activeTo && month > ae.activeTo) return false;
          return true;
    });
}

export const ALL_REPS = [
    ...AE_DATA.map((ae) => ({
          id: ae.id, name: ae.name, role: ae.role,
          initials: ae.initials, color: ae.color, type: ae.type as string,
    })),
  {
        id: BDR_DATA.id, name: BDR_DATA.name, role: BDR_DATA.role,
        initials: BDR_DATA.initials, color: BDR_DATA.color, type: "bdr",
  },
  ];

export function calcAECommission(
    quota: number,
    tiers: { label?: string; ceiling: number; rate: number }[],
    netARR: number
  ) {
    const attainment = quota > 0 ? netARR / quota : 0;
    let commission = 0;
    const tierBreakdown: { label?: string; ceiling: number; rate: number; amount: number }[] = [];

  for (let i = 0; i < tiers.length; i++) {
        const prevCeiling = i === 0 ? 0 : tiers[i - 1].ceiling;
        if (attainment <= prevCeiling) {
                tierBreakdown.push({ ...tiers[i], amount: 0 });
                continue;
        }
        const cappedAttainment = Math.min(attainment, tiers[i].ceiling);
        const tierCommission = (cappedAttainment - prevCeiling) * quota * tiers[i].rate;
        commission += tierCommission;
        tierBreakdown.push({ ...tiers[i], amount: tierCommission });
  }

  return { commission, attainment, tierBreakdown };
}

export function calcBDRCommission(netMeetings: number) {
    const bdr = BDR_DATA;
    const attainment = bdr.monthlyQuota > 0 ? netMeetings / bdr.monthlyQuota : 0;
    let commission: number;

  if (attainment <= bdr.acceleratorThreshold) {
        commission = netMeetings * bdr.perMeetingRate;
  } else {
        const baseMeetings = Math.floor(bdr.monthlyQuota * bdr.acceleratorThreshold);
        commission =
                baseMeetings * bdr.perMeetingRate +
                (netMeetings - baseMeetings) * bdr.acceleratorRate;
  }

  return { commission, attainment };
}

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

export function getCurrentMonthRange() {
    const now = new Date();
    return getMonthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function getMonthRange(year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    return {
          startISO: start.toISOString().split("T")[0],
          endISO: end.toISOString().split("T")[0],
          label: start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
          year,
          month,
    };
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
