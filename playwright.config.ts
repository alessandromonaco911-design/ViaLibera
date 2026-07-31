import { defineConfig } from "@playwright/test";

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Playwright E2E for ViaLibera.
 * Uses the locally installed Microsoft Edge (no browser download):
 * executablePath points to the Edge binary present on this machine.
 * The webServer runs the PRODUCTION build (`npm run start`); run `npm run build`
 * before the E2E suite. Sessions created by tests are tagged environment=test
 * and can be removed with `npm run db:cleanup-dev-sessions -- --apply`.
 */
export default defineConfig({
  testDir: "./tests-e2e",
  outputDir: "test-output/artifacts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    headless: true,
    viewport: { width: 1440, height: 900 },
    // use the locally installed Microsoft Edge (no browser download)
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "mobile-small", use: { viewport: { width: 360, height: 640 } } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
