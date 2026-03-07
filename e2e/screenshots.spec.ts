import { test } from "@playwright/test";
import path from "path";
import { execLiveResponse, repResponses } from "./mock-data";

const SCREENSHOTS_DIR = path.join(__dirname, "..", "screenshots");

/** Intercept commission API calls and return mock data. */
async function mockAPIs(page: import("@playwright/test").Page) {
  // Exec dashboard API
  await page.route("**/api/commissions?*", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("live") === "true") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(execLiveResponse) });
    }
    // Static mode (before CONNECT is clicked)
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ reps: [], availableMonths: execLiveResponse.availableMonths, mode: "static" }),
    });
  });

  // Rep dashboard APIs
  await page.route("**/api/commissions/rep/*", (route) => {
    const url = new URL(route.request().url());
    const repId = url.pathname.split("/").pop() || "";
    const data = repResponses[repId];
    if (data) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
  });
}

// ── Login page ──────────────────────────────────────────────────────────────
test("screenshot: login page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "login.png"), fullPage: true });
});

// ── Exec dashboard ──────────────────────────────────────────────────────────
test("screenshot: exec dashboard", async ({ page }) => {
  await mockAPIs(page);
  await page.goto("/");
  // Click CONNECT to trigger live data fetch
  await page.getByRole("button", { name: /connect/i }).click();
  // Wait for rep performance data to render
  await page.waitForSelector("text=Jason Vigilante", { timeout: 10000 });
  await page.waitForTimeout(1500); // let animations finish
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "exec-dashboard.png"), fullPage: true });
});

// ── Rep dashboards ──────────────────────────────────────────────────────────
const reps = [
  { id: "jason", label: "Jason (AE)" },
  { id: "kelcy", label: "Kelcy (AE)" },
  { id: "roy", label: "Roy (AE)" },
  { id: "max", label: "Max (BDR)" },
];

for (const rep of reps) {
  test(`screenshot: ${rep.label} dashboard`, async ({ page }) => {
    await mockAPIs(page);
    await page.goto(`/dashboard/${rep.id}`);
    // Wait for the dashboard to load (attainment ring appears)
    await page.waitForSelector("text=of quota", { timeout: 10000 });
    await page.waitForTimeout(1500); // let animations finish
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `dashboard-${rep.id}.png`), fullPage: true });
  });
}
