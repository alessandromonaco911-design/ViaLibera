import { test, expect } from "@playwright/test";

/**
 * Mobile layout regressions — geometric checks (no page-level overflow,
 * header/action-bar/question controls stay inside the viewport).
 * Runs against the deployed site via PLAYWRIGHT_BASE_URL or local webServer.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3210";
const TOPIC = "d6a8ae00-4858-496e-8cab-018796468bb5";

async function noPageOverflow(page: import("@playwright/test").Page) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(m.sw, `scrollWidth ${m.sw} <= clientWidth ${m.cw} + 1`).toBeLessThanOrEqual(m.cw + 1);
}

async function elementsInsideViewport(page: import("@playwright/test").Page, selector: string, label: string) {
  const cw = await page.evaluate(() => document.documentElement.clientWidth);
  const bad = await page.evaluate((sel) => {
    const cw = document.documentElement.clientWidth;
    return [...document.querySelectorAll(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > cw + 1 || r.left < -1);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { cls: (el.className?.toString() || "").slice(0, 50), left: Math.round(r.left), right: Math.round(r.right) };
      });
  }, selector);
  expect(bad, `${label} elements outside viewport (${cw}px)`).toEqual([]);
}

test("home: no horizontal overflow on mobile", async ({ page }) => {
  for (const [w, h] of [[390, 844], [360, 800], [320, 568]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(900);
    await noPageOverflow(page);
  }
});

test("setup pages (selezione argomenti, landing simulazione): no overflow on mobile", async ({ page }) => {
  for (const [path, w, h] of [["/allenamento", 390, 844], ["/allenamento", 320, 568], ["/simulazione", 390, 844], ["/simulazione", 320, 568]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);
    await noPageOverflow(page);
  }
});

test("allenamento quiz: no overflow, header/action bar inside viewport", async ({ page }) => {
  const r = await page.request.post(`${BASE}/api/practice`, {
    data: { topicId: TOPIC, questionCount: 10 },
  });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  for (const [w, h] of [[390, 844], [360, 800], [320, 568]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await noPageOverflow(page);
    await elementsInsideViewport(page, "header", "header");
    await elementsInsideViewport(page, "header button, header a, header [role='timer']", "header controls");
    await elementsInsideViewport(page, "main button", "question controls (VERO/FALSO)");
    await elementsInsideViewport(page, "[class*='border-t-2'] button", "action bar buttons");
  }
  await page.request.post(`${BASE}/api/practice/${sessionId}/complete`, {}).catch(() => {});
});

test("simulazione quiz: no overflow, header/action bar inside viewport", async ({ page }) => {
  const r = await page.request.post(`${BASE}/api/exams`, { data: {} });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  for (const [w, h] of [[390, 844], [360, 800], [320, 568]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/simulazione/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await noPageOverflow(page);
    await elementsInsideViewport(page, "header", "header");
    await elementsInsideViewport(page, "header button, header a, header [role='timer']", "header controls");
    await elementsInsideViewport(page, "main button", "question controls (VERO/FALSO)");
    await elementsInsideViewport(page, "[class*='border-t-2'] button", "action bar buttons");
  }
  await page.request.post(`${BASE}/api/exams/${sessionId}/submit`, { data: {} }).catch(() => {});
});

test("risultati allenamento: no overflow on mobile", async ({ page }) => {
  test.setTimeout(60000);
  const r = await page.request.post(`${BASE}/api/practice`, {
    data: { topicId: TOPIC, questionCount: 10 },
  });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-hydrated="true"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // answer one question through the UI, then complete via API
  await page.locator("main [role='group'][aria-label='Risposta'] button").first().click().catch(() => {});
  const verify = page.getByRole("button", { name: "Verifica risposta" });
  if (await verify.isVisible().catch(() => false)) await verify.click();
  await page.waitForTimeout(800);
  const done = await page.request.post(`${BASE}/api/practice/${sessionId}/complete`, {});
  expect(done.status()).toBeLessThan(500);
  await page.goto(`${BASE}/allenamento/${sessionId}/risultato`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await noPageOverflow(page);
  await elementsInsideViewport(page, "header", "header");
  const bodyText = await page.evaluate(() => document.body.textContent ?? "");
  expect(bodyText).toContain("Allenamento completato");
  expect(bodyText).toContain("Corrette");
});
