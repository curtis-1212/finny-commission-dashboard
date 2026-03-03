/**
 * Mock API responses for Playwright visual snapshot tests.
 *
 * These match the exact JSON shapes returned by:
 *  - /api/commissions/rep/[rep]  (rep dashboards)
 *  - /api/commissions?live=true  (exec dashboard)
 */

const currentMonth = new Date()
  .toISOString()
  .slice(0, 7); // e.g. "2026-03"

const monthLabel = new Date().toLocaleString("en-US", {
  month: "long",
  year: "numeric",
});

const availableMonths = [
  { value: currentMonth, label: monthLabel },
  { value: "2026-02", label: "February 2026" },
  { value: "2026-01", label: "January 2026" },
];

// ─── Rep dashboard responses (/api/commissions/rep/[rep]) ─────────────────

export function getRepResponse(repId: string) {
  const data: Record<string, unknown> = {
    jason: {
      rep: { id: "jason", name: "Jason Vigilante", role: "Founding Account Executive", initials: "JV", color: "#3B82F6", type: "ae" },
      metrics: {
        grossARR: 125000, churnARR: 0, netARR: 125000,
        monthlyQuota: 166666.67, attainment: 0.75, commission: 11250,
        tierBreakdown: [
          { label: "0-100%", amount: 11250 },
          { label: "100-120%", amount: 0 },
          { label: "120%+", amount: 0 },
        ],
        introCallsScheduled: 8,
        toBeOnboarded: { count: 3, arr: 45000 },
        closedWon: { count: 3, arr: 125000 },
        closedLost: { count: 1, arr: 18000 },
        churned: { count: 0, arr: 0 },
        optOut: { count: 0, arr: 0 },
        closedWonDeals: [
          { name: "Acme Learning Corp", value: 52000, closeDate: "2026-03-05" },
          { name: "BrightPath Academy", value: 41000, closeDate: "2026-03-12" },
          { name: "EduFlow Systems", value: 32000, closeDate: "2026-03-18" },
        ],
        optOutDeals: [],
      },
      leaderboard: [
        { id: "kelcy", name: "Kelcy Koenig", initials: "KK", color: "#F59E0B", netARR: 175000 },
        { id: "roy", name: "Roy Kasten", initials: "RK", color: "#EF4444", netARR: 142000 },
        { id: "jason", name: "Jason Vigilante", initials: "JV", color: "#3B82F6", netARR: 125000 },
      ],
      meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth: currentMonth },
      availableMonths,
    },

    kelcy: {
      rep: { id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive", initials: "KK", color: "#F59E0B", type: "ae" },
      metrics: {
        grossARR: 175000, churnARR: 0, netARR: 175000,
        monthlyQuota: 166666.67, attainment: 1.05, commission: 7084,
        tierBreakdown: [
          { label: "0-100%", amount: 6667 },
          { label: "100-120%", amount: 417 },
          { label: "120%+", amount: 0 },
        ],
        introCallsScheduled: 5,
        toBeOnboarded: { count: 2, arr: 28000 },
        closedWon: { count: 4, arr: 175000 },
        closedLost: { count: 2, arr: 24000 },
        churned: { count: 0, arr: 0 },
        optOut: { count: 0, arr: 0 },
        closedWonDeals: [
          { name: "TechStart Inc", value: 61000, closeDate: "2026-03-02" },
          { name: "LearnWell", value: 38000, closeDate: "2026-03-09" },
          { name: "SkillsHub", value: 44000, closeDate: "2026-03-15" },
          { name: "CampusConnect", value: 32000, closeDate: "2026-03-22" },
        ],
        optOutDeals: [],
      },
      leaderboard: [
        { id: "kelcy", name: "Kelcy Koenig", initials: "KK", color: "#F59E0B", netARR: 175000 },
        { id: "roy", name: "Roy Kasten", initials: "RK", color: "#EF4444", netARR: 142000 },
        { id: "jason", name: "Jason Vigilante", initials: "JV", color: "#3B82F6", netARR: 125000 },
      ],
      meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth: currentMonth },
      availableMonths,
    },

    roy: {
      rep: { id: "roy", name: "Roy Kasten", role: "Account Executive", initials: "RK", color: "#EF4444", type: "ae" },
      metrics: {
        grossARR: 152000, churnARR: 0, netARR: 142000,
        monthlyQuota: 208333.33, attainment: 0.682, commission: 12780,
        tierBreakdown: [
          { label: "0-100%", amount: 12780 },
          { label: "100-120%", amount: 0 },
          { label: "120%+", amount: 0 },
        ],
        introCallsScheduled: 6,
        toBeOnboarded: { count: 1, arr: 15000 },
        closedWon: { count: 4, arr: 152000 },
        closedLost: { count: 1, arr: 12000 },
        churned: { count: 0, arr: 0 },
        optOut: { count: 1, arr: 10000 },
        closedWonDeals: [
          { name: "FutureTech", value: 55000, closeDate: "2026-03-03" },
          { name: "GreenLeaf Systems", value: 42000, closeDate: "2026-03-10" },
          { name: "Summit Analytics", value: 32000, closeDate: "2026-03-17" },
          { name: "NovaBridge", value: 23000, closeDate: "2026-03-21" },
        ],
        optOutDeals: [
          { name: "ShortStay Inc", value: 10000, closeDate: "2026-02-18" },
        ],
      },
      leaderboard: [
        { id: "kelcy", name: "Kelcy Koenig", initials: "KK", color: "#F59E0B", netARR: 175000 },
        { id: "roy", name: "Roy Kasten", initials: "RK", color: "#EF4444", netARR: 142000 },
        { id: "jason", name: "Jason Vigilante", initials: "JV", color: "#3B82F6", netARR: 125000 },
      ],
      meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth: currentMonth },
      availableMonths,
    },

    max: {
      rep: { id: "max", name: "Max Zajec", role: "Founding BDR", initials: "MZ", color: "#8B5CF6", type: "bdr" },
      metrics: {
        netMeetings: 22, monthlyTarget: 25, attainment: 0.88,
        commission: 726, introCallsScheduled: 14,
      },
      meta: { fetchedAt: new Date().toISOString(), monthLabel, selectedMonth: currentMonth },
      availableMonths,
    },
  };

  return data[repId] ?? null;
}

// ─── Exec dashboard response (/api/commissions?live=true) ─────────────────

export function getExecResponse() {
  return {
    ae: [
      {
        id: "jason", name: "Jason Vigilante", role: "Founding Account Executive",
        initials: "JV", color: "#3B82F6", type: "ae",
        monthlyQuota: 166666.67, annualQuota: 2000000,
        grossARR: 125000, churnARR: 0, netARR: 125000,
        dealCount: 3, churnCount: 0, excludedCount: 0, demoCount: 8,
        optOutARR: 0, optOutCount: 0,
        cwRate: 0.75,
        attainment: 0.75, commission: 11250,
        tierBreakdown: [
          { label: "0-100%", amount: 11250 },
          { label: "100-120%", amount: 0 },
          { label: "120%+", amount: 0 },
        ],
        closedWonDeals: [
          { name: "Acme Learning Corp", value: 52000, closeDate: "2026-03-05" },
          { name: "BrightPath Academy", value: 41000, closeDate: "2026-03-12" },
          { name: "EduFlow Systems", value: 32000, closeDate: "2026-03-18" },
        ],
        optOutDeals: [],
      },
      {
        id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive",
        initials: "KK", color: "#F59E0B", type: "ae",
        monthlyQuota: 166666.67, annualQuota: 2000000,
        grossARR: 175000, churnARR: 0, netARR: 175000,
        dealCount: 4, churnCount: 0, excludedCount: 0, demoCount: 5,
        optOutARR: 0, optOutCount: 0,
        cwRate: 0.667,
        attainment: 1.05, commission: 7084,
        tierBreakdown: [
          { label: "0-100%", amount: 6667 },
          { label: "100-120%", amount: 417 },
          { label: "120%+", amount: 0 },
        ],
        closedWonDeals: [
          { name: "TechStart Inc", value: 61000, closeDate: "2026-03-02" },
          { name: "LearnWell", value: 38000, closeDate: "2026-03-09" },
          { name: "SkillsHub", value: 44000, closeDate: "2026-03-15" },
          { name: "CampusConnect", value: 32000, closeDate: "2026-03-22" },
        ],
        optOutDeals: [],
      },
      {
        id: "roy", name: "Roy Kasten", role: "Account Executive",
        initials: "RK", color: "#EF4444", type: "ae",
        monthlyQuota: 208333.33, annualQuota: 2500000,
        grossARR: 152000, churnARR: 0, netARR: 142000,
        dealCount: 4, churnCount: 0, excludedCount: 0, demoCount: 6,
        optOutARR: 10000, optOutCount: 1,
        cwRate: 0.667,
        attainment: 0.682, commission: 12780,
        tierBreakdown: [
          { label: "0-100%", amount: 12780 },
          { label: "100-120%", amount: 0 },
          { label: "120%+", amount: 0 },
        ],
        closedWonDeals: [
          { name: "FutureTech", value: 55000, closeDate: "2026-03-03" },
          { name: "GreenLeaf Systems", value: 42000, closeDate: "2026-03-10" },
          { name: "Summit Analytics", value: 32000, closeDate: "2026-03-17" },
          { name: "NovaBridge", value: 23000, closeDate: "2026-03-21" },
        ],
        optOutDeals: [
          { name: "ShortStay Inc", value: 10000, closeDate: "2026-02-18" },
        ],
      },
    ],
    bdr: {
      id: "max", name: "Max Zajec", role: "Founding BDR",
      initials: "MZ", color: "#8B5CF6", type: "bdr",
      monthlyQuota: 25,
      totalMeetings: 22, netMeetings: 22,
      attainment: 0.88, commission: 726,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      dealCount: 11,
      monthLabel,
      selectedMonth: currentMonth,
    },
    availableMonths,
    mode: "live",
  };
}
