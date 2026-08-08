import { test, expect } from "./fixtures";
import { createSession, db, cleanupTestSessions } from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

const KEY = (sid: string) => `vialibera:exam:v1:${sid}`;
const REG = "vialibera:exam:v1:__registry__";

function seedLocalState(page: import("@playwright/test").Page, sid: string, startedAt: string, expiresAt: string, opts: { status?: string; answers?: number; corrupt?: boolean } = {}) {
  // navigate first so the page has an origin and localStorage is accessible
  return page.goto("/").then(() =>
    page.evaluate(
      ({ key, reg, sid, startedAt, expiresAt, status, answers, corrupt }) => {
        if (corrupt) {
          localStorage.setItem(key, "{not json");
        } else {
          const ans: Record<string, boolean> = {};
          for (let i = 0; i < (answers ?? 0); i++) ans[`q${i}`] = true;
          localStorage.setItem(
            key,
            JSON.stringify({ sessionId: sid, version: 1, status: status ?? "in_progress", currentPosition: 3, answers: ans, flagged: [], startedAt, expiresAt, lastSavedAt: new Date().toISOString() }),
          );
        }
        const regs = JSON.parse(localStorage.getItem(reg) ?? "[]") as string[];
        if (!regs.includes(sid)) regs.push(sid);
        localStorage.setItem(reg, JSON.stringify(regs));
      },
      { key: KEY(sid), reg: REG, sid, startedAt, expiresAt, status: opts.status, answers: opts.answers, corrupt: opts.corrupt },
    ),
  );
}

test.describe("Resume card", () => {
  test("compare quando esiste una sessione locale valida, con risposte e tempo", async ({ page }) => {
    const exam = await createSession(page);
    const start = new Date(Date.now() - 120_000).toISOString();
    const expires = new Date(Date.now() + 18 * 60_000).toISOString();
    await seedLocalState(page, exam.sessionId, start, expires, { answers: 7 });
    await page.goto("/");
    const card = page.getByText("Simulazione in corso");
    await expect(card).toBeVisible();
    await expect(page.getByText(/Tempo residuo/)).toBeVisible();
    await expect(page.getByText("7 / 30")).toBeVisible();
  });

  test("Continua porta al quiz", async ({ page }) => {
    const exam = await createSession(page);
    await seedLocalState(page, exam.sessionId, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 19 * 60_000).toISOString(), { answers: 2 });
    await page.goto("/");
    await page.getByRole("button", { name: "Continua" }).click();
    await page.waitForURL(new RegExp(`/simulazione/${exam.sessionId}`));
    await expect(page.locator("header").getByText(/Domanda 3 di 30/)).toBeVisible();
  });

  test("Abbandona chiede conferma, rimuove solo il dato locale, non la sessione DB", async ({ page }) => {
    const exam = await createSession(page);
    await seedLocalState(page, exam.sessionId, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 19 * 60_000).toISOString());
    await page.goto("/");
    let confirmed = false;
    page.on("dialog", (d) => {
      confirmed = true;
      void d.accept();
    });
    await page.getByRole("button", { name: "Abbandona" }).click();
    expect(confirmed).toBe(true);
    await expect(page.getByText("Simulazione in corso")).toBeHidden();
    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY(exam.sessionId));
    expect(stored).toBeNull();
    // la sessione DB esiste ancora
    const rows = await db()`select id from exam_sessions where id = ${exam.sessionId}`;
    expect(rows.length).toBe(1);
  });

  test("sessione scaduta non proposta", async ({ page }) => {
    const exam = await createSession(page);
    await seedLocalState(page, exam.sessionId, new Date(Date.now() - 30 * 60_000).toISOString(), new Date(Date.now() - 5 * 60_000).toISOString());
    await page.goto("/");
    await expect(page.getByText("Simulazione in corso")).toBeHidden();
  });

  test("sessione completata non proposta", async ({ page }) => {
    const exam = await createSession(page);
    await seedLocalState(page, exam.sessionId, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 19 * 60_000).toISOString(), { status: "completed" });
    await page.goto("/");
    await expect(page.getByText("Simulazione in corso")).toBeHidden();
  });

  test("payload locale corrotto non rompe la homepage", async ({ page }) => {
    const exam = await createSession(page);
    await seedLocalState(page, exam.sessionId, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 19 * 60_000).toISOString(), { corrupt: true });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Inizia simulazione" })).toBeVisible();
    await expect(page.getByText("Simulazione in corso")).toBeHidden();
  });
});
