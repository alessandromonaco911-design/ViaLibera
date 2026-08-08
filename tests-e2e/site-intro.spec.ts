import { test, expect } from "@playwright/test";

/**
 * Site intro (first-visit per browser session):
 *  - first visit -> overlay shown, logo travels, light red -> green, overlay removed;
 *  - after the session flag -> intro skipped (also on refresh / internal navigation);
 *  - prefers-reduced-motion -> intro skipped, home accessible immediately.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3210";
const OVERLAY = ".site-intro-overlay";
const LOGO = ".site-intro-logo";
const LIGHT = ".site-intro-light";

test("intro: first visit shows the overlay, then reveals the homepage", async ({ page }) => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  const overlay = page.locator(OVERLAY);
  await expect(overlay).toBeVisible({ timeout: 10000 });
  await expect(page.locator(LOGO)).toBeVisible();
  await expect(page.locator(LIGHT)).toBeVisible();

  // the red bulb is lit first, the green bulb is off
  const redOn = await page
    .locator(".site-intro-bulb--red")
    .evaluate((el) => Number(getComputedStyle(el).opacity) > 0.8);
  const greenOn = await page
    .locator(".site-intro-bulb--green")
    .evaluate((el) => Number(getComputedStyle(el).opacity) < 0.5);
  expect(redOn).toBe(true);
  expect(greenOn).toBe(true);

  // light turns green mid-way, then the overlay is removed and the home is ready
  await page.waitForFunction(
    () => {
      const g = document.querySelector(".site-intro-bulb--green");
      const o = document.querySelector(".site-intro-overlay");
      return o === null && !!document.querySelector("main h1");
    },
    undefined,
    { timeout: 8000 },
  );
  await expect(overlay).toHaveCount(0);
  await expect(page.locator("main h1")).toBeVisible();
});

test("intro: skipped after the session flag (same session, refresh)", async ({ page }) => {
  // first visit marks the flag; the intro plays
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => document.querySelector(".site-intro-overlay") === null, undefined, {
    timeout: 8000,
  });

  // refresh in the same session -> intro must NOT come back
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await expect(page.locator(OVERLAY)).toHaveCount(0);

  // internal navigation -> intro must NOT come back
  await page.goto(`${BASE}/allenamento`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await expect(page.locator(OVERLAY)).toHaveCount(0);
});

test("intro: skipped under prefers-reduced-motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await expect(page.locator(OVERLAY)).toHaveCount(0);
  await expect(page.locator("main h1")).toBeVisible();
  await context.close();
});
