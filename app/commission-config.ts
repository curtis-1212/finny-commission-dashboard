export interface AEConfig {
  id: string;
  name: string;
  role: string;
  initials: string;
  emoji: string;
  color: string;
  baseSalary: number;
  variable: number;
  ote: number;
  monthlyQuota: number;
  annualQuota: number;
  tiers: { label: string; ceiling: number; rate: number }[];
  type: "ae";
}

export interface BDRConfig {
  id: string;
  name: string;
  role: string;
  initials: string;
  emoji: string;
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
    id: "jason", name: "Jason Vigilante", role: "Founding Account Executive",
    initials: "JV", emoji: "🔵", color: "#3B82F6",
    baseSalary: 120000, variable: 120000, ote: 240000,
    monthlyQuota: 166666.67, annualQuota: 2000000,
    tiers: [
      { label: "0–100%", ceiling: 1.0, rate: 0.09 },
      { label: "100–120%", ceiling: 1.2, rate: 0.11 },
      { label: "120%+", ceiling: Infinity, rate: 0.13 },
    ],
    type: "ae",
  },
  {
    id: "austin", name: "Austin Guest", role: "Founding Account Executive",
    initials: "AG", emoji: "🟢", color: "#10B981",
    baseSalary: 120000, variable: 120000, ote: 240000,
    monthlyQuota: 166666.67, annualQuota: 2000000,
    tiers: [
      { label: "0–100%", ceiling: 1.0, rate: 0.09 },
      { label: "100–120%", ceiling: 1.2, rate: 0.11 },
      { label: "120%+", ceiling: Infinity, rate: 0.13 },
    ],
    type: "ae",
  },
  {
    id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive",
    initials: "KK", emoji: "🟡", color: "#F59E0B",
    baseSalary: 168000, variable: 72000, ote: 240000,
    monthlyQuota: 150000, annualQuota: 1800000,
    tiers: [
      { label: "0–100%", ceiling: 1.0, rate: 0.04 },
      { label: "100–120%", ceiling: 1.2, rate: 0.05 },
      { label: "120%+", ceiling: Infinity, rate: 0.06 },
    ],
    type: "ae",
  },
];

export const BDR_DATA: BDRConfig = {
  id: "max", name: "Max Zajec", role: "Founding BDR",
  initials: "MZ", emoji: "🟣", color: "#8B5CF6",
  baseSalary: 70000, variable: 10000, ote: 80000,
  monthlyQuota: 15, monthlyTargetVariable: 833.33,
  perMeetingRate: 33, acceleratorRate: 40, acceleratorThreshold: 1.25,
  type: "bdr",
};

export function calcAECommission(quota: number, tiers: { ceiling: number; rate: number }[], netARR: number) {
  const attainment = quota > 0 ? netARR / quota : 0;
  let commission = 0;
  const tierBreakdown: { label?: string; ceiling: number; rate: number; amount: number }[] = [];
  for (let i = 0; i < tiers.length; i++) {
    const prev = i === 0 ? 0 : tiers[i - 1].ceiling;
    if (attainment <= prev) { tierBreakdown.push({ ...tiers[i], amount: 0 }); continue; }
    const capped = Math.min(attainment, tiers[i].ceiling);
    const amt = (capped - prev) * quota * tiers[i].rate;
    commission += amt;
    tierBreakdown.push({ ...tiers[i], amount: amt });
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
    const base = Math.floor(bdr.monthlyQuota * bdr.acceleratorThreshold);
    commission = base * bdr.perMeetingRate + (netMeetings - base) * bdr.acceleratorRate;
  }
  return { commission, attainment };
}

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";
