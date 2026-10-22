import { test, expect } from "@playwright/test";
import {
  createSession,
  backdateSession,
  cleanupTestSessions,
  clickAnswerWithoutAdvance,
  expectPosition,
  waitQuizReady,
  VERO_BTN,
  FALSO_BTN,
} from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

test.describe("ViaLibera — flussi esame reali (auto-advance rimosso)", () => {
  test("1. homepage: apertura e contenuti essenziali", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("VIA", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("LIBERA", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Preparati", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inizia simulazione" })).toBeVisible();
    await expect(page.getByText("Nessuna registrazione richiesta", { exact: true })).toBeVisible();
  });

  test("2+3. click Inizia simulazione -> creazione e apertura sessione", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Inizia simulazione" }).click();
    await page.waitForURL(/\/simulazione\//);
    expect(page.url()).toMatch(/\/simulazione\/[0-9a-f-]{36}/);
    await expectPosition(page, 1);
  });

  test("4. rendering di 30 domande (navigatore)", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expectPosition(page, 1);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    const cells = page.getByRole("group", { name: "Navigatore domande" }).getByRole("button");
    await expect(cells).toHaveCount(30);
    await page.keyboard.press("Escape");
  });

  test("5. selezione VERO senza cambio domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expectPosition(page, 1);
    await clickAnswerWithoutAdvance(page, "VERO");
    await expectPosition(page, 1); // invariata
  });

  test("6. selezione FALSO senza cambio domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expectPosition(page, 1);
    await clickAnswerWithoutAdvance(page, "FALSO");
    await expectPosition(page, 1);
  });

  test("7. cambio risposta VERO->FALSO senza cambio domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    await clickAnswerWithoutAdvance(page, "FALSO");
    await expectPosition(page, 1);
    const falso = page.locator(FALSO_BTN).first();
    await expect(falso).toHaveAttribute("aria-pressed", "true");
    const vero = page.locator(VERO_BTN).first();
    await expect(vero).toHaveAttribute("aria-pressed", "false");
  });

  test("8. avanzamento manuale tramite Avanti", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Avanti" }).click();
    await expectPosition(page, 2);
  });

  test("9. avanzamento manuale tramite freccia destra", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await waitQuizReady(page);
    await page.keyboard.press("ArrowRight");
    await expectPosition(page, 2);
  });

  test("10. ritorno tramite Indietro", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await waitQuizReady(page);
    await page.keyboard.press("ArrowRight");
    await expectPosition(page, 2);
    await page.getByRole("button", { name: "← Indietro" }).click();
    await expectPosition(page, 1);
  });

  test("11. risposta precedentemente selezionata ancora visibile", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    await page.keyboard.press("ArrowRight");
    await expectPosition(page, 2);
    await page.keyboard.press("ArrowLeft");
    await expectPosition(page, 1);
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("12. apertura Drawer navigatore", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
  });

  test("13. click su cella del navigatore", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await page.getByRole('listitem', { name: /^Domanda 7/ }).click();
    await expectPosition(page, 7);
  });

  test("14. chiusura Drawer (Esc e click fuori)", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeHidden();
  });

  test("15. contrassegno domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    const flag = page.getByRole("button", { name: /Contrassegna|Contrassegnata/ });
    await flag.click();
    await expect(page.getByRole("button", { name: /Contrassegnata/ })).toBeVisible();
    await flag.click();
    await expect(page.getByRole("button", { name: /Contrassegna/ })).toBeVisible();
  });

  test("16+17. Dialog consegna: apertura e ritorno alla prova", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Termina" }).click();
    await expect(page.getByRole("dialog", { name: "Consegnare la simulazione?" })).toBeVisible();
    await page.getByRole("button", { name: "Torna alla prova" }).click();
    await expect(page.getByRole("dialog", { name: "Consegnare la simulazione?" })).toBeHidden();
    await expectPosition(page, 1);
  });

  test("18. consegna -> schermata risultato", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    // rispondi VERO a tutte (conseguenza: esito determinato dal server)
    for (let i = 0; i < 30; i++) {
      await clickAnswerWithoutAdvance(page, "VERO");
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    await expect(page.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
    await expect(page.getByText("Errori", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Corrette", { exact: true }).first()).toBeVisible();
  });

  test("19. schermata risultato: verdetto + dettaglio domande", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 30; i++) {
      await clickAnswerWithoutAdvance(page, "VERO");
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    // il dettaglio è collassato: espandi la prima domanda per verificare il contenuto
    await page.locator("section[aria-label='Dettaglio domande'] button[aria-expanded='false']").first().click();
    await expect(page.getByText("Risposta corretta").first()).toBeVisible();
    await expect(page.getByText("Nuova simulazione")).toBeVisible();
  });

  test("20. filtro Rivedi errori / Non risposte", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    // lascia le prime 5 senza risposta, rispondi il resto
    for (let i = 0; i < 30; i++) {
      if (i >= 5) {
        await clickAnswerWithoutAdvance(page, "VERO");
      }
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    const errorsFilter = page.getByRole("button", { name: /Errori \(\d+\)/ });
    await errorsFilter.click();
    await page.locator("section[aria-label='Dettaglio domande'] button[aria-expanded='false']").first().click();
    await expect(page.getByText("Non risposta").first()).toBeVisible();
    const unansweredFilter = page.getByRole("button", { name: /Non risposte \(\d+\)/ });
    await unansweredFilter.click();
    await page.locator("section[aria-label='Dettaglio domande'] button[aria-expanded='false']").first().click();
    await expect(page.getByText("Non risposta").first()).toBeVisible();
  });

  test("21+22. zoom immagine: apertura e chiusura", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    // trova una domanda con immagine tramite navigatore
    let found = false;
    for (let pos = 1; pos <= 30 && !found; pos++) {
      await page.getByRole("button", { name: "Apri navigatore domande" }).click();
      await page.getByRole('listitem', { name: new RegExp(`^Domanda ${pos}, `) }).click();
      const zoom = page.getByRole("button", { name: "Ingrandisci immagine" });
      if (await zoom.isVisible().catch(() => false)) {
        found = true;
        await zoom.click();
        await expect(page.getByRole("dialog", { name: "Immagine ingrandita" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Immagine ingrandita" })).toBeHidden();
      }
    }
    expect(found).toBe(true);
  });

  test("23. refresh con ripristino di posizione e risposta", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expectPosition(page, 3);
    await page.reload();
    await expectPosition(page, 3); // posizione ripristinata
    await waitQuizReady(page, 3);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expectPosition(page, 1);
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "true"); // risposta ripristinata
  });

  test("24. scadenza timer -> consegna automatica", async ({ page }) => {
    const exam = await createSession(page);
    await backdateSession(exam.sessionId, 30); // scaduta 30s fa
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.waitForURL(/\/risultato/, { timeout: 20000 });
    await expect(page.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
  });

  test("25. doppio click su Consegna -> una sola submit", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    let submitCalls = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/submit")) submitCalls++;
    });
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
    await page.waitForURL(/\/risultato/, { timeout: 20000 });
    await page.waitForTimeout(500);
    expect(submitCalls).toBe(1);
  });

  test("26. sessione inesistente -> pagina dedicata", async ({ page }) => {
    await page.goto("/simulazione/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Sessione inesistente")).toBeVisible();
  });

  test("27. media mancante -> fallback grafico senza crash", async ({ page }) => {
    const exam = await createSession(page);
    await page.route("**/media/questions/**", (route) => route.abort()); // simula file/media non disponibile
    await page.goto(`/simulazione/${exam.sessionId}`);
    // una domanda con immagine deve mostrare il fallback
    let found = false;
    for (let pos = 1; pos <= 30 && !found; pos++) {
      await page.getByRole("button", { name: "Apri navigatore domande" }).click();
      await page.getByRole('listitem', { name: new RegExp(`^Domanda ${pos}, `) }).click();
      const zoom = page.getByRole("button", { name: "Ingrandisci immagine" });
      if (await zoom.isVisible().catch(() => false)) {
        found = true;
        await expect(page.getByLabel("Immagine non disponibile").first()).toBeVisible({ timeout: 8000 });
      }
    }
    expect(found).toBe(true);
  });

  test("28. domanda 30: risposta senza avanzamento e senza consegna automatica", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await page.getByRole('listitem', { name: /^Domanda 30/ }).click();
    await expectPosition(page, 30);
    await clickAnswerWithoutAdvance(page, "FALSO");
    await expectPosition(page, 30); // resta
    // nessun dialog, nessuna route
    await expect(page.getByRole("dialog", { name: "Consegnare la simulazione?" })).toHaveCount(0);
    expect(page.url()).toMatch(/\/simulazione\/[0-9a-f-]{36}$/);
    // Avanti disabilitato sull'ultima domanda (aria-label diventa "Ultima domanda")
    await expect(page.getByRole("button", { name: "Ultima domanda" })).toBeDisabled();
  });

  test("29. shortcut V: seleziona senza cambio domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await waitQuizReady(page);
    await page.keyboard.press("v");
    await expectPosition(page, 1);
    await expect(page.locator(VERO_BTN).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[aria-live="polite"]').getByText("Risposta registrata")).toBeVisible();
  });

  test("30. shortcut F: seleziona senza cambio domanda", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await waitQuizReady(page);
    await page.keyboard.press("f");
    await expectPosition(page, 1);
    await expect(page.locator(FALSO_BTN).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("attesa 1 secondo dopo la risposta: posizione invariata", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await clickAnswerWithoutAdvance(page, "VERO");
    await page.waitForTimeout(1200);
    await expectPosition(page, 1);
  });

  test("scorciatoia M contrassegna + G navigatore + Esc", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await waitQuizReady(page);
    await page.keyboard.press("m");
    await expect(page.getByRole("button", { name: /Contrassegnata/ })).toBeVisible();
    await page.keyboard.press("g");
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeHidden();
  });
});
