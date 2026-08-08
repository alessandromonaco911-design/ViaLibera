import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { createSession, cleanupTestSessions } from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

async function scan(page: Page, name: string) {
  // lascia terminare le brevi animazioni di ingresso (max ~180ms) prima dello scan
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(violations, `${name}: violazioni axe ${violations.map((v) => v.id).join(", ")}`).toEqual([]);
}

test.describe("Audit accessibilità (axe-core)", () => {
  test("homepage senza violazioni serie", async ({ page }) => {
    await page.goto("/");
    await scan(page, "homepage");
  });

  test("quiz senza violazioni serie", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expect(page.locator("header").getByText(/Domanda 1 di 30/)).toBeVisible();
    await scan(page, "quiz");
  });

  test("feedback risposta + VERO/FALSO senza violazioni", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.locator("button", { hasText: "VERO" }).first().click();
    await expect(page.locator('[aria-live="polite"]').getByText("Risposta registrata")).toBeVisible();
    await scan(page, "quiz-con-risposta");
  });

  test("Drawer aperto senza violazioni", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
    await scan(page, "drawer");
  });

  test("Dialog consegna senza violazioni", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Termina" }).click();
    await expect(page.getByRole("dialog", { name: "Consegnare la simulazione?" })).toBeVisible();
    await scan(page, "dialog-consegna");
    await page.getByRole("button", { name: "Torna alla prova" }).click();
  });

  test("risultato senza violazioni", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 30; i++) {
      await page.locator("button", { hasText: "VERO" }).first().click();
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    await expect(page.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
    await scan(page, "risultato");
  });

  test("errore sessione inesistente senza violazioni", async ({ page }) => {
    await page.goto("/simulazione/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Sessione inesistente")).toBeVisible();
    await scan(page, "not-found");
  });
});
