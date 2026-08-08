import { test, expect } from "@playwright/test";
import { createSession, clickAnswerWithoutAdvance, expectPosition, cleanupTestSessions, VERO_BTN, FALSO_BTN, waitQuizReady } from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

test.describe("Resilienza", () => {
  test("rete interrotta durante la consegna: errore visibile, risposte conservate", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    // intercetta la submit e falliscila
    await page.route("**/submit", (route) => route.abort("connectionfailed"));
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await expect(page.getByText(/Errore di rete durante la consegna/).first()).toBeVisible({ timeout: 15000 });
    // la risposta è ancora lì
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "true");
    // riprova senza intercettazione
    await page.unroute("**/submit");
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/, { timeout: 20000 });
  });

  test("localStorage pieno/non disponibile: nessun crash", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    // rompi localStorage dopo il mount
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new Error("quota exceeded");
      };
      void original;
    });
    await clickAnswerWithoutAdvance(page, "VERO"); // il save fallisce ma non deve crashare
    await expectPosition(page, 1);
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("doppia tab sulla stessa sessione: submit da una, idempotente dall'altra", async ({ page, context }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    const page2 = await context.newPage();
    await page2.goto(`/simulazione/${exam.sessionId}`);
    await expectPosition(page, 1);
    await expectPosition(page2, 1);
    // tab 1 risponde e consegna
    for (let i = 0; i < 30; i++) {
      await page.locator("button", { hasText: "VERO" }).first().click();
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/, { timeout: 20000, waitUntil: "commit" });
    // tab 2 risponde allo STESSO modo (stesso payload) e consegna -> idempotente (200, stesso risultato)
    for (let i = 0; i < 30; i++) {
      await page2.locator("button", { hasText: "VERO" }).first().click();
      if (i < 29) await page2.getByRole("button", { name: "Avanti" }).click();
    }
    await page2.getByRole("button", { name: "Termina" }).click();
    await page2.getByRole("button", { name: "Consegna" }).click();
    await page2.waitForURL(/\/risultato/, { timeout: 20000, waitUntil: "commit" });
    await expect(page2.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
    await page2.close();
  });

  test("rapida alternanza VERO/FALSO: resta sulla stessa domanda, vince l'ultima", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 5; i++) {
      await page.locator("button", { hasText: "VERO" }).first().click();
      await page.locator("button", { hasText: "FALSO" }).first().click();
    }
    await expectPosition(page, 1);
    await expect(page.locator(FALSO_BTN).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "false");
  });

  test("pressione ripetuta di Avanti: un solo avanzamento per click", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    const avanti = page.getByRole("button", { name: "Avanti" });
    await avanti.click();
    await expectPosition(page, 2);
    await avanti.click();
    await expectPosition(page, 3);
  });

  test("shortcut V/F ignorate mentre il Drawer è aperto", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await waitQuizReady(page);
    await page.keyboard.press("g");
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
    await page.keyboard.press("v");
    await page.keyboard.press("f");
    // nessuna risposta registrata mentre il drawer è aperto
    await expect(page.locator('[aria-live="polite"]').getByText("Risposta registrata")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeHidden();
    // ora V funziona
    await page.keyboard.press("v");
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("submit quasi simultaneo: una sola consegna ha effetto", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 30; i++) {
      await clickAnswerWithoutAdvance(page, "VERO");
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    const consegna = page.getByRole("button", { name: "Consegna" });
    // doppio click sincrono: il secondo deve essere ignorato dal guard anti-doppia submit
    await consegna.evaluate((btn) => {
      (btn as HTMLElement).click();
      (btn as HTMLElement).click();
    });
    await page.waitForURL(/\/risultato/, { timeout: 20000, waitUntil: "commit" });
    await expect(page.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
  });

  test("errore di rete alla creazione (CTA) mostra stato senza perdere l'utente", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/exams", (route) => route.abort("connectionfailed"));
    await page.getByRole("button", { name: "Inizia simulazione" }).click();
    await expect(page.getByText("Errore di rete. Verifica la connessione e riprova.")).toBeVisible({ timeout: 15000 });
    await page.unroute("**/api/exams");
    await page.getByRole("button", { name: "Inizia simulazione" }).click();
    await page.waitForURL(/\/simulazione\//);
  });
});
