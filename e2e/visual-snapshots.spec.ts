import { test, expect } from "@playwright/test";
import { authenticateAs } from "./helpers/auth";
import { getRepResponse, getExecResponse } from "./helpers/mock-data";

const SCREENSHOT_DIR = "screenshots";

// Wait for animations to settle (dashboard has fade-in transitions up to 0.6s)
const SETTLE_MS = 2500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRepAPI(page: import("@playwright/test").Page, repId: string) {
  const data = getRepResponse(repId);
  return page.route(`**/api/commissions/rep/${repId}**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) }),
  );
}

function mockExecAPI(page: import("@playwright/test").Page) {
  const data = getExecResponse();
  return page.route("**/api/commissions?**", (route) => {
    const url = new URL(route.request().url());
    // Only mock the exec endpoint, not /api/commissions/rep/*
    if (url.pathname === "/api/commissions") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    }
    return route.continue();
  });
}

// Also mock the NextAuth session endpoint so server components can resolve
function mockSessionAPI(page: import("@playwright/test").Page, email: string) {
  return page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { email, name: email.split("@")[0] },
        expires: new Date(Date.now() + 86400_000).toISOString(),
      }),
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Visual Snapshots — All User Views", () => {
  test("01 — Login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.locator("body")).toContainText("Revenue Command Center");
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-login.png`,
      fullPage: true,
    });
  });

  test("02 — Jason (AE rep, 75% attainment)", async ({ page }) => {
    await authenticateAs(page, "jason@finny.com");
    await mockRepAPI(page, "jason");

    await page.goto("/dashboard/jason");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.locator("body")).toContainText("Jason");
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-jason-ae.png`,
      fullPage: true,
    });
  });

  test("03 — Kelcy (AE rep, 105% attainment — above quota)", async ({ page }) => {
    await authenticateAs(page, "kelcy@finny.com");
    await mockRepAPI(page, "kelcy");

    await page.goto("/dashboard/kelcy");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.locator("body")).toContainText("Kelcy");
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/03-kelcy-ae.png`,
      fullPage: true,
    });
  });

  test("04 — Roy (AE rep, 68% attainment, has opt-outs)", async ({ page }) => {
    await authenticateAs(page, "roy@finny.com");
    await mockRepAPI(page, "roy");

    await page.goto("/dashboard/roy");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.locator("body")).toContainText("Roy");
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/04-roy-ae.png`,
      fullPage: true,
    });
  });

  test("05 — Max (BDR rep, meetings-based dashboard)", async ({ page }) => {
    await authenticateAs(page, "max@finny.com");
    await mockRepAPI(page, "max");

    await page.goto("/dashboard/max");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.locator("body")).toContainText("Max");
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/05-max-bdr.png`,
      fullPage: true,
    });
  });

  test("06 — Exec dashboard (all reps, live view)", async ({ page }) => {
    await authenticateAs(page, "curtis@finny.com");
    await mockSessionAPI(page, "curtis@finny.com");
    await mockExecAPI(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Click CONNECT to trigger the live data fetch
    const connectBtn = page.getByText("CONNECT");
    await connectBtn.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.locator("body")).toContainText("Revenue Command Center");
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/06-exec-dashboard.png`,
      fullPage: true,
    });
  });
});
