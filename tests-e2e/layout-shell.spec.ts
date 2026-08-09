import { test, expect } from "@playwright/test";

/**
 * Home is the visual source of truth: simulazione, allenamento e risultati
 * must share the exact same shell geometry (max-w-6xl, px-4 sm:px-6).
 * Tolerance: ±2px on mobile margins, same utility on desktop (0px expected).
 */

const TOPIC = "d6a8ae00-4858-496e-8cab-018796468bb5";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3210";
const VPS = [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812], [360, 800]] as const;

async function shellRect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector(".max-w-6xl");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  });
}

/** main card insets: home hero card vs quiz question card (same gutters) */
async function cardRect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector("main section .border-2.bg-surface, main .border-2.bg-surface.shadow-pop");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  });
}

test("home, simulazione, allenamento e risultati condividono la stessa shell", async ({ page }) => {
  test.setTimeout(420000);
  const t = await page.request.post(`${BASE}/api/practice`, { data: { topicId: TOPIC, questionCount: 10 } });
  expect(t.status()).toBe(201);
  const { sessionId } = await t.json();
  const ex = await page.request.post(`${BASE}/api/exams`, { data: {} });
  expect(ex.status()).toBe(201);
  const { sessionId: examId } = await ex.json();

  const saved: Record<string, { left: number; right: number; width: number }> = {};
  const savedCard: Record<string, { left: number; right: number; width: number }> = {};
  for (const [w, h] of VPS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(900);
    const home = await shellRect(page);
    expect(home, "home shell").not.toBeNull();
    saved[`home@${w}`] = home!;
    const homeCard = await cardRect(page);
    expect(homeCard, "home hero card").not.toBeNull();
    savedCard[`home@${w}`] = homeCard!;

    await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1400);
    const quiz = await shellRect(page);
    expect(quiz, `allenamento shell @${w}`).not.toBeNull();
    expect(Math.abs(quiz!.left - home!.left), `allenamento left @${w}`).toBeLessThanOrEqual(2);
    expect(Math.abs(quiz!.width - home!.width), `allenamento width @${w}`).toBeLessThanOrEqual(2);
    if (w <= 768) {
      const quizCard = await cardRect(page);
      expect(quizCard, `allenamento card @${w}`).not.toBeNull();
      expect(Math.abs(quizCard!.left - homeCard!.left), `allenamento card left @${w}`).toBeLessThanOrEqual(2);
      expect(Math.abs(quizCard!.right - homeCard!.right), `allenamento card right @${w}`).toBeLessThanOrEqual(2);
      expect(Math.abs(quizCard!.width - homeCard!.width), `allenamento card width @${w}`).toBeLessThanOrEqual(2);
    }

    await page.goto(`${BASE}/simulazione/${examId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1400);
    const sim = await shellRect(page);
    expect(sim, `simulazione shell @${w}`).not.toBeNull();
    expect(Math.abs(sim!.left - home!.left), `simulazione left @${w}`).toBeLessThanOrEqual(2);
    expect(Math.abs(sim!.width - home!.width), `simulazione width @${w}`).toBeLessThanOrEqual(2);
    if (w <= 768) {
      const simCard = await cardRect(page);
      expect(simCard, `simulazione card @${w}`).not.toBeNull();
      expect(Math.abs(simCard!.left - homeCard!.left), `simulazione card left @${w}`).toBeLessThanOrEqual(2);
      expect(Math.abs(simCard!.right - homeCard!.right), `simulazione card right @${w}`).toBeLessThanOrEqual(2);
      expect(Math.abs(simCard!.width - homeCard!.width), `simulazione card width @${w}`).toBeLessThanOrEqual(2);
    }
  }

  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/allenamento/${sessionId}/risultato`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1600);
    const res = await shellRect(page);
    expect(res, `risultati shell @${w}`).not.toBeNull();
    const home = saved[`home@${w}`];
    expect(Math.abs(res!.left - home.left), `risultati left @${w}`).toBeLessThanOrEqual(2);
    expect(Math.abs(res!.width - home.width), `risultati width @${w}`).toBeLessThanOrEqual(2);
  }
});
