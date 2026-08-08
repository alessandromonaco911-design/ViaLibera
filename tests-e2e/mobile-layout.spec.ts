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

/** touch targets >= 44px for interactive quiz chrome (390px viewport) */
async function touchTargetsOk(page: import("@playwright/test").Page) {
  const small = await page.evaluate(() => {
    const sel = "header button, main button, [class*='border-t-2'] button";
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => ({
        text: (el.textContent || "").slice(0, 20),
        h: Math.round(el.getBoundingClientRect().height),
      }));
  });
  expect(small, `buttons with height < 44px`).toEqual([]);
}

/** question image preview must respect the mobile max-height */
async function imagePreviewOk(page: import("@playwright/test").Page) {
  const img = await page.evaluate(() => {
    const el = document.querySelector("main img");
    if (!el) return null;
    return { h: Math.round(el.getBoundingClientRect().height) };
  });
  if (img) expect(img.h, `image preview height (${img.h}px)`).toBeLessThanOrEqual(241);
}

/** action bar must at least start inside the initial viewport (media questions) */
async function actionBarReachable(page: import("@playwright/test").Page) {
  const ab = await page.evaluate(() => {
    const vh = innerHeight;
    const el = [...document.querySelectorAll("div")].find(
      (d) => (d.className?.toString() || "").includes("border-t-2") && d.getBoundingClientRect().top > 300,
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh };
  });
  if (ab) {
    expect(ab.top, `action bar top (${ab.top}) inside viewport (${ab.vh})`).toBeLessThan(ab.vh);
  }
}

test("home: no horizontal overflow on mobile", async ({ page }) => {
  for (const [w, h] of [[390, 844], [375, 812], [360, 800], [320, 568]] as const) {
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
  test.setTimeout(180000);
  const r = await page.request.post(`${BASE}/api/practice`, {
    data: { topicId: TOPIC, questionCount: 10 },
  });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  for (const [w, h] of [[390, 844], [375, 812], [360, 800], [320, 568]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await noPageOverflow(page);
    await elementsInsideViewport(page, "header", "header");
    await elementsInsideViewport(page, "header button, header a, header [role='timer']", "header controls");
    await elementsInsideViewport(page, "main button", "question controls (VERO/FALSO)");
    await elementsInsideViewport(page, "[class*='border-t-2'] button", "action bar buttons");
    if (w === 390) {
      await touchTargetsOk(page);
      await imagePreviewOk(page);
      await actionBarReachable(page);
    }
  }
  await page.request.post(`${BASE}/api/practice/${sessionId}/complete`, {}).catch(() => {});
});

test("simulazione quiz: no overflow, header/action bar inside viewport", async ({ page }) => {
  test.setTimeout(180000);
  const r = await page.request.post(`${BASE}/api/exams`, { data: {} });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  for (const [w, h] of [[390, 844], [375, 812], [360, 800], [320, 568]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/simulazione/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await noPageOverflow(page);
    await elementsInsideViewport(page, "header", "header");
    await elementsInsideViewport(page, "header button, header a, header [role='timer']", "header controls");
    await elementsInsideViewport(page, "main button", "question controls (VERO/FALSO)");
    await elementsInsideViewport(page, "[class*='border-t-2'] button", "action bar buttons");
    if (w === 390) {
      await touchTargetsOk(page);
      await imagePreviewOk(page);
      await actionBarReachable(page);
    }
  }
  await page.request.post(`${BASE}/api/exams/${sessionId}/submit`, { data: {} }).catch(() => {});
});

test("allenamento feedback: compact didactic copy, no technical codes", async ({ page }) => {
  test.setTimeout(60000);
  const r = await page.request.post(`${BASE}/api/practice`, {
    data: { topicId: TOPIC, questionCount: 10 },
  });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.locator("main [role='group'][aria-label='Risposta'] button").first().click().catch(() => {});
  await page.getByRole("button", { name: "Verifica risposta" }).click().catch(() => {});
  await page.waitForTimeout(900);
  const fb = await page.evaluate(() => {
    const el = document.querySelector("[aria-live='polite'] > div");
    return el ? { text: el.textContent.replace(/\s+/g, " ").trim(), h: Math.round(el.getBoundingClientRect().height) } : null;
  });
  expect(fb).not.toBeNull();
  expect(fb!.h, `feedback height (${fb!.h}px)`).toBeLessThanOrEqual(140);
  expect(fb!.text).toMatch(/Corretta|Errata/);
  expect(fb!.text).toContain("Spiegazione non ancora disponibile.");
  expect(fb!.text).not.toMatch(/Codice/);
  expect(fb!.text).not.toMatch(/Gruppo/);
  expect(fb!.text).not.toMatch(/revisionata/);
});

test("simulazione: action bar single row with icon flag on mobile", async ({ page }) => {
  const r = await page.request.post(`${BASE}/api/exams`, { data: {} });
  expect(r.status()).toBe(201);
  const { sessionId } = await r.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/simulazione/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const ab = await page.evaluate(() => {
    const bar = [...document.querySelectorAll("div")].find(
      (d) => (d.className?.toString() || "").includes("border-t-2") && d.getBoundingClientRect().top > 300,
    );
    if (!bar) return null;
    const btns = [...bar.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0);
    const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
    const flag = btns.find((b) => b.getAttribute("aria-label")?.startsWith("Contrassegna") || b.getAttribute("aria-pressed") !== null);
    return { n: btns.length, tops, sameRow: tops.length > 1 && Math.max(...tops) - Math.min(...tops) <= 4, flagAria: flag?.getAttribute("aria-label") ?? null };
  });
  expect(ab).not.toBeNull();
  expect(ab!.n).toBe(3);
  expect(ab!.sameRow, `action bar buttons on one row (tops ${ab!.tops})`).toBe(true);
  expect(ab!.flagAria).toMatch(/Contrassegna/);
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
