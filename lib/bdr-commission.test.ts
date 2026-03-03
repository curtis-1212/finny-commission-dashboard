// Lightweight sanity checks for calcBDRCommission.
// This file is not imported by the app; it can be executed with any TS test runner
// or via `ts-node` for manual verification.

import { calcBDRCommission } from "./commission-config";

type Case = {
  label: string;
  month: string;
  meetings: number;
  expectedQuota: number;
  expectedCommission: number;
};

function approxEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function runBdrCommissionTests(): void {
  const cases: Case[] = [
    // Month 2 ramp: quota 20, $833 base + $33 per meeting above 20
    {
      label: "Month 2 at quota",
      month: "2025-12",
      meetings: 20,
      expectedQuota: 20,
      expectedCommission: 833.33,
    },
    {
      label: "Month 2 above quota",
      month: "2025-12",
      meetings: 25,
      expectedQuota: 20,
      expectedCommission: 833.33 + 5 * 33,
    },
    // Month 3 ramp: quota 25, $833 base + $33 per meeting above 25
    {
      label: "Month 3 at quota",
      month: "2026-01",
      meetings: 25,
      expectedQuota: 25,
      expectedCommission: 833.33,
    },
    {
      label: "Month 3 below quota (no commission)",
      month: "2026-01",
      meetings: 24,
      expectedQuota: 25,
      expectedCommission: 0,
    },
    // Full performance (months 4+): meetings 1–31 at $33, 32+ at $40
    {
      label: "Month 4 with 24 meetings",
      month: "2026-02",
      meetings: 24,
      expectedQuota: 25,
      expectedCommission: 24 * 33,
    },
    {
      label: "Month 4 with 31 meetings (no accelerator yet)",
      month: "2026-02",
      meetings: 31,
      expectedQuota: 25,
      expectedCommission: 31 * 33,
    },
    {
      label: "Month 4 with 32 meetings (1 meeting at accelerator rate)",
      month: "2026-02",
      meetings: 32,
      expectedQuota: 25,
      expectedCommission: 31 * 33 + 1 * 40,
    },
    {
      label: "Month 4 with 37 meetings",
      month: "2026-02",
      meetings: 37,
      expectedQuota: 25,
      expectedCommission: 31 * 33 + 6 * 40,
    },
  ];

  const failures: string[] = [];

  for (const c of cases) {
    const { commission, monthlyQuota } = calcBDRCommission(c.meetings, c.month);
    if (monthlyQuota !== c.expectedQuota) {
      failures.push(
        `${c.label}: expected quota ${c.expectedQuota}, got ${monthlyQuota}`,
      );
    }
    if (!approxEqual(commission, c.expectedCommission)) {
      failures.push(
        `${c.label}: expected commission ${c.expectedCommission.toFixed(
          2,
        )}, got ${commission.toFixed(2)}`,
      );
    }
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error("BDR commission test failures:\n" + failures.join("\n"));
    throw new Error("BDR commission tests failed");
  } else {
    // eslint-disable-next-line no-console
    console.log("BDR commission tests passed (" + cases.length + " cases).");
  }
}

