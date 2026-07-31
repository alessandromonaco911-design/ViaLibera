import { test, expect, type Page } from "@playwright/test";
import { createSession, clickAnswerWithoutAdvance, cleanupTestSessions } from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

const OUT = "test-output/screenshots";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function goToQuestionWithImage(page: Page): Promise<number> {
  for (let pos = 1; pos <= 30; pos++) {
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await page.getByRole('listitem', { name: new RegExp(`^Domanda ${pos}, `) }).click();
    if (await page.getByRole("button", { name: "Ingrandisci immagine" }).isVisible().catch(() => false)) {
      return pos;
    }
  }
  return 1;
}

test.describe("Audit visivo (screenshot)", () => {
  test("homepage desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Inizia simulazione" })).toBeVisible();
    await shot(page, "homepage-desktop");
  });

  test("homepage mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Inizia simulazione" })).toBeVisible();
    await shot(page, "homepage-mobile");
  });

  test("domanda senza immagine", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    // naviga fino alla prima domanda senza immagine
    for (let pos = 1; pos <= 30; pos++) {
      await page.getByRole("button", { name: "Apri navigatore domande" }).click();
      await page.getByRole('listitem', { name: new RegExp(`^Domanda ${pos}, `) }).click();
      if (!(await page.getByRole("button", { name: "Ingrandisci immagine" }).isVisible().catch(() => false))) {
        break;
      }
    }
    await shot(page, "quiz-senza-immagine");
  });

  test("domanda con segnale (immagine)", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await goToQuestionWithImage(page);
    await shot(page, "quiz-con-immagine");
  });

  test("risposta selezionata senza cambio domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    await shot(page, "quiz-risposta-selezionata");
  });

  test("navigatore desktop (Drawer)", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
    await shot(page, "drawer-navigatore");
  });

  test("dialog consegna", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    await page.getByRole("button", { name: "Termina" }).click();
    await expect(page.getByRole("dialog", { name: "Consegnare la simulazione?" })).toBeVisible();
    await shot(page, "dialog-consegna");
    await page.getByRole("button", { name: "Torna alla prova" }).click();
  });

  test("timer critico", async ({ page }) => {
    const exam = await createSession(page);
    await page.addInitScript(() => {
      // sposta il clock simulato in avanti: patch di Date.now solo per il test visivo
      const real = Date.now;
      const offset = 19 * 60 * 1000 + 30 * 1000; // 19:30 più tardi -> < 1 min rimanente
      Date.now = () => real() + offset;
    });
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expect(page.locator("header").getByText(/Domanda 1 di 30/)).toBeVisible();
    await page.waitForTimeout(1200);
    await shot(page, "timer-critico");
  });

  test("risultato superato", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 30; i++) {
      await clickAnswerWithoutAdvance(page, "VERO");
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    await expect(page.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
    await shot(page, "risultato");
  });

  test("risultato filtrato sugli errori", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) await clickAnswerWithoutAdvance(page, "VERO");
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    await page.getByRole("button", { name: /Errori \(\d+\)/ }).click();
    await expect(page.locator("section").getByText(/Errori/).first()).toBeVisible();
    await shot(page, "risultato-errori");
  });

  test("errore sessione inesistente", async ({ page }) => {
    await page.goto("/simulazione/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Sessione inesistente")).toBeVisible();
    await shot(page, "sessione-inesistente");
  });
});
