import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3456",
    extraHTTPHeaders: { "x-screenshot-mode": "true" },
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev -- -p 3456",
    port: 3456,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
