// Mock API responses for Playwright screenshot tests.
// Shapes match the real API routes in app/api/commissions/.

const availableMonths = [
  { value: "2025-11", label: "Nov 2025" },
  { value: "2025-12", label: "Dec 2025" },
  { value: "2026-01", label: "Jan 2026" },
  { value: "2026-02", label: "Feb 2026" },
  { value: "2026-03", label: "Mar 2026" },
];

const selectedMonth = "2026-03";
const monthLabel = "March 2026";
const fetchedAt = new Date().toISOString();

// ── Exec dashboard: /api/commissions?live=true ──────────────────────────────

export const execLiveResponse = {
  ae: [
    {
      id: "jason", name: "Jason Vigilante", role: "Founding Account Executive",
      initials: "JV", color: "#3B82F6", type: "ae",
      monthlyQuota: 166666.67, annualQuota: 2000000,
      grossARR: 195000, churnARR: 0, netARR: 180000,
      dealCount: 6, churnCount: 0, excludedCount: 0, demoCount: 8,
      optOutARR: 15000, optOutCount: 1,
      cwRate: 0.75,
      priorCwRate: 0.63, priorTboRate: 0.75, priorDemoCount: 8,
      attainment: 1.08, commission: 16200,
      tierBreakdown: [
        { label: "0-100%", amount: 15000 },
        { label: "100-120%", amount: 1200 },
        { label: "120%+", amount: 0 },
      ],
      closedWonDeals: [
        { name: "Acme Corp", value: 48000, closeDate: "2026-03-04" },
        { name: "TechStart Inc", value: 36000, closeDate: "2026-03-07" },
        { name: "Greenfield Labs", value: 29000, closeDate: "2026-03-11" },
        { name: "Pinnacle Group", value: 42000, closeDate: "2026-03-15" },
        { name: "Horizon Digital", value: 22000, closeDate: "2026-03-19" },
        { name: "Vertex Solutions", value: 18000, closeDate: "2026-03-22" },
      ],
      optOutDeals: [
        { name: "CloudBridge AI", value: 15000, closeDate: "2026-02-18" },
      ],
    },
    {
      id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive",
      initials: "KK", color: "#F59E0B", type: "ae",
      monthlyQuota: 166666.67, annualQuota: 2000000,
      grossARR: 142000, churnARR: 0, netARR: 142000,
      dealCount: 4, churnCount: 0, excludedCount: 0, demoCount: 6,
      optOutARR: 0, optOutCount: 0,
      cwRate: 0.67,
      priorCwRate: 0.50, priorTboRate: 0.67, priorDemoCount: 6,
      attainment: 0.852, commission: 5680,
      tierBreakdown: [
        { label: "0-100%", amount: 5680 },
        { label: "100-120%", amount: 0 },
        { label: "120%+", amount: 0 },
      ],
      closedWonDeals: [
        { name: "BrightPath Education", value: 52000, closeDate: "2026-03-03" },
        { name: "NovaTech Systems", value: 38000, closeDate: "2026-03-10" },
        { name: "Clearview Analytics", value: 28000, closeDate: "2026-03-14" },
        { name: "Redwood Partners", value: 24000, closeDate: "2026-03-20" },
      ],
      optOutDeals: [],
    },
    {
      id: "roy", name: "Roy Kasten", role: "Account Executive",
      initials: "RK", color: "#EF4444", type: "ae",
      monthlyQuota: 208333.33, annualQuota: 2500000,
      grossARR: 87000, churnARR: 0, netARR: 67000,
      dealCount: 3, churnCount: 0, excludedCount: 0, demoCount: 5,
      optOutARR: 20000, optOutCount: 1,
      cwRate: 0.6,
      priorCwRate: 0.40, priorTboRate: 0.60, priorDemoCount: 5,
      attainment: 0.322, commission: 6030,
      tierBreakdown: [
        { label: "0-100%", amount: 6030 },
        { label: "100-120%", amount: 0 },
        { label: "120%+", amount: 0 },
      ],
      closedWonDeals: [
        { name: "Atlas Logistics", value: 35000, closeDate: "2026-03-06" },
        { name: "Prism Health", value: 32000, closeDate: "2026-03-12" },
        { name: "Forge Industries", value: 20000, closeDate: "2026-03-18" },
      ],
      optOutDeals: [
        { name: "Beacon Financial", value: 20000, closeDate: "2026-02-22" },
      ],
    },
  ],
  bdr: {
    id: "max", name: "Max Zajec", role: "Founding BDR",
    initials: "MZ", color: "#8B5CF6", type: "bdr",
    monthlyQuota: 25,
    totalMeetings: 28, netMeetings: 28,
    attainment: 1.12, commission: 924,
  },
  forecast: {
    perAE: {
      jason: {
        scheduledDemos: 3,
        trailing60DayCwRate: 0.68,
        avgFunnelDays: 18,
        avgDealSize: 32500,
        projectedARR: { low: 46410, mid: 66300, high: 79560 },
      },
      kelcy: {
        scheduledDemos: 4,
        trailing60DayCwRate: 0.55,
        avgFunnelDays: 22,
        avgDealSize: 35500,
        projectedARR: { low: 54670, mid: 78100, high: 93720 },
      },
      roy: {
        scheduledDemos: 5,
        trailing60DayCwRate: 0.42,
        avgFunnelDays: 25,
        avgDealSize: 29000,
        projectedARR: { low: 42630, mid: 60900, high: 73080 },
      },
    },
    team: {
      totalScheduledDemos: 12,
      blendedCwRate: 0.55,
      avgFunnelDays: 21,
      projectedARR: { low: 143710, mid: 205300, high: 246360 },
      totalQuota: 541666.67,
    },
  },
  meta: { fetchedAt, monthLabel, warning: "" },
  availableMonths,
  mode: "live",
};

// ── Rep dashboards: /api/commissions/rep/[rep] ──────────────────────────────

const leaderboard = [
  { id: "jason", name: "Jason Vigilante", initials: "JV", color: "#3B82F6", netARR: 180000 },
  { id: "kelcy", name: "Kelcy Koenig", initials: "KK", color: "#F59E0B", netARR: 142000 },
  { id: "roy", name: "Roy Kasten", initials: "RK", color: "#EF4444", netARR: 67000 },
];

export const repResponses: Record<string, object> = {
  jason: {
    rep: { id: "jason", name: "Jason Vigilante", role: "Founding Account Executive", initials: "JV", color: "#3B82F6", type: "ae" },
    metrics: {
      grossARR: 195000, churnARR: 0, netARR: 180000,
      monthlyQuota: 166666.67, attainment: 1.08, commission: 16200,
      tierBreakdown: [
        { label: "0-100%", amount: 15000 },
        { label: "100-120%", amount: 1200 },
        { label: "120%+", amount: 0 },
      ],
      introCallsScheduled: 3,
      toBeOnboarded: { count: 2, arr: 31000 },
      closedWon: { count: 6, arr: 195000 },
      closedLost: { count: 2, arr: 18000 },
      churned: { count: 0, arr: 0 },
      optOut: { count: 1, arr: 15000 },
      dealCount: 6, excludedCount: 0,
      closedWonDeals: [
        { name: "Acme Corp", value: 48000, closeDate: "2026-03-04" },
        { name: "TechStart Inc", value: 36000, closeDate: "2026-03-07" },
        { name: "Greenfield Labs", value: 29000, closeDate: "2026-03-11" },
        { name: "Pinnacle Group", value: 42000, closeDate: "2026-03-15" },
        { name: "Horizon Digital", value: 22000, closeDate: "2026-03-19" },
        { name: "Vertex Solutions", value: 18000, closeDate: "2026-03-22" },
      ],
      optOutDeals: [
        { name: "CloudBridge AI", value: 15000, closeDate: "2026-02-18" },
      ],
    },
    leaderboard,
    meta: { fetchedAt, monthLabel, selectedMonth },
    availableMonths,
  },

  kelcy: {
    rep: { id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive", initials: "KK", color: "#F59E0B", type: "ae" },
    metrics: {
      grossARR: 142000, churnARR: 0, netARR: 142000,
      monthlyQuota: 166666.67, attainment: 0.852, commission: 5680,
      tierBreakdown: [
        { label: "0-100%", amount: 5680 },
        { label: "100-120%", amount: 0 },
        { label: "120%+", amount: 0 },
      ],
      introCallsScheduled: 4,
      toBeOnboarded: { count: 3, arr: 45000 },
      closedWon: { count: 4, arr: 142000 },
      closedLost: { count: 1, arr: 12000 },
      churned: { count: 0, arr: 0 },
      optOut: { count: 0, arr: 0 },
      dealCount: 4, excludedCount: 0,
      closedWonDeals: [
        { name: "BrightPath Education", value: 52000, closeDate: "2026-03-03" },
        { name: "NovaTech Systems", value: 38000, closeDate: "2026-03-10" },
        { name: "Clearview Analytics", value: 28000, closeDate: "2026-03-14" },
        { name: "Redwood Partners", value: 24000, closeDate: "2026-03-20" },
      ],
      optOutDeals: [],
    },
    leaderboard,
    meta: { fetchedAt, monthLabel, selectedMonth },
    availableMonths,
  },

  roy: {
    rep: { id: "roy", name: "Roy Kasten", role: "Account Executive", initials: "RK", color: "#EF4444", type: "ae" },
    metrics: {
      grossARR: 87000, churnARR: 0, netARR: 67000,
      monthlyQuota: 208333.33, attainment: 0.322, commission: 6030,
      tierBreakdown: [
        { label: "0-100%", amount: 6030 },
        { label: "100-120%", amount: 0 },
        { label: "120%+", amount: 0 },
      ],
      introCallsScheduled: 5,
      toBeOnboarded: { count: 1, arr: 22000 },
      closedWon: { count: 3, arr: 87000 },
      closedLost: { count: 2, arr: 25000 },
      churned: { count: 0, arr: 0 },
      optOut: { count: 1, arr: 20000 },
      dealCount: 3, excludedCount: 0,
      closedWonDeals: [
        { name: "Atlas Logistics", value: 35000, closeDate: "2026-03-06" },
        { name: "Prism Health", value: 32000, closeDate: "2026-03-12" },
        { name: "Forge Industries", value: 20000, closeDate: "2026-03-18" },
      ],
      optOutDeals: [
        { name: "Beacon Financial", value: 20000, closeDate: "2026-02-22" },
      ],
    },
    leaderboard,
    meta: { fetchedAt, monthLabel, selectedMonth },
    availableMonths,
  },

  max: {
    rep: { id: "max", name: "Max Zajec", role: "Founding BDR", initials: "MZ", color: "#8B5CF6", type: "bdr" },
    metrics: {
      netMeetings: 28, monthlyTarget: 25, attainment: 1.12,
      commission: 924, introCallsScheduled: 6,
    },
    meta: { fetchedAt, monthLabel, selectedMonth },
    availableMonths,
  },
};
