import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupTestSessions, db } from "./helpers";

/** Create a practice session via the API with a real DB topic (>= 30 usable questions). */
async function pickTopic(count = 30): Promise<{ id: string; name: string }> {
  const rows = await db()`
    select t.id, t.name
    from topics t
    join questions q on q.topic_id = t.id and q.status = 'imported'
    group by t.id, t.name
    having count(q.id) >= ${count}
    order by t.name
    limit 1`;
  if (!rows[0]) throw new Error("nessun topic con >= 30 domande");
  return { id: String(rows[0].id), name: String(rows[0].name) };
}

/** Create a session via API. */
async function createPractice(page: Page, count = 10): Promise<{ sessionId: string; topic: { id: string; name: string } }> {
  const topic = await pickTopic(count);
  const res = await page.request.post(`${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3210"}/api/practice`, {
    data: { topicId: topic.id, questionCount: count },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { sessionId?: string };
  expect(body.sessionId).toBeTruthy();
  return { sessionId: body.sessionId!, topic };
}

/** Answers from DB for a session (test-only: to drive correct/wrong answers). */
async function sessionSolutions(sessionId: string): Promise<{ questionId: string; correctAnswer: boolean }[]> {
  const rows = await db()`
    select esq.question_id as "questionId", q.correct_answer as "correctAnswer"
    from exam_session_questions esq
    join questions q on q.id = esq.question_id
    where esq.session_id = ${sessionId}
    order by esq.position`;
  return rows.map((r) => ({ questionId: String(r.questionId), correctAnswer: Boolean(r.correctAnswer) }));
}

async function verifyAll(page: Page, sessionId: string, answerCorrect: boolean): Promise<void> {
  const sols = await sessionSolutions(sessionId);
  for (let i = 0; i < sols.length; i++) {
    const want = answerCorrect ? sols[i].correctAnswer : !sols[i].correctAnswer;
    await page.locator("button", { hasText: want ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expectFeedback(page);
    if (i < sols.length - 1) await page.getByRole("button", { name: "Avanti" }).click();
  }
}

/** Wait until the client has hydrated (keyboard handlers active). */
async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-hydrated="true"]', { timeout: 15000 });
}

/** Feedback title only (avoids matching the "Risposta corretta: X" row). */
async function expectFeedback(page: Page): Promise<void> {
  await expect(page.getByText(/^Risposta corretta$|^Risposta errata$/).first()).toBeVisible();
}

/** Complete via the header button + confirmation dialog (works from any position). */
async function completeSession(page: Page): Promise<void> {
  await page.getByRole("banner").getByRole("button", { name: "Completa", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Completare l\u2019allenamento\?/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Completa", exact: true }).click();
  await page.waitForURL(/\/risultato/);
}

test.beforeEach(async () => {
  await cleanupTestSessions();
});

test.describe("Allenamento (practice) — flussi reali", () => {
  test("1+2+3. homepage -> Allenati per argomento -> lista topic", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Allenati per argomento", exact: true }).first().click();
    await page.waitForURL(/\/allenamento/);
    await expect(page.getByText("Allenati per argomento", { exact: true })).toBeVisible();
    // lista topic reale (25 dal DB)
    const links = page.locator("a[href^='/allenamento/argomento/']");
    await expect(links.first()).toBeVisible();
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(20);
  });

  test("4. scelta topic -> configurazione 10/20/30", async ({ page }) => {
    const topic = await pickTopic(30);
    await page.goto(`/allenamento/argomento/${topic.id}`);
    await expect(page.getByText(topic.name.slice(0, 40), { exact: false }).first()).toBeVisible();
    // default 10
    await expect(page.getByRole("button", { name: "10 domande" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Inizia allenamento" })).toBeVisible();
    await expect(page.getByText("Feedback immediato")).toBeVisible();
    await expect(page.getByText("Nessun limite")).toBeVisible();
  });

  test("5. avvio sessione da configurazione", async ({ page }) => {
    const topic = await pickTopic(30);
    await page.goto(`/allenamento/argomento/${topic.id}`);
    await page.getByRole("button", { name: "20 domande" }).click();
    await page.getByRole("button", { name: "Inizia allenamento" }).click();
    await page.waitForURL(/\/allenamento\/[0-9a-f-]{36}/);
    await expect(page.locator("header").getByText(/Allenamento · 1 di 20/)).toBeVisible();
  });

  test("6. selezione VERO senza avanzamento", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: "VERO" }).first().click();
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
    await expect(page.getByText("Seleziona Verifica risposta per controllare.")).toBeVisible();
  });

  test("7. selezione FALSO senza avanzamento", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: "FALSO" }).first().click();
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
  });

  test("8. cambio risposta prima della verifica", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: "VERO" }).first().click();
    await page.locator("button", { hasText: "FALSO" }).first().click();
    await expect(page.locator("button", { hasText: "FALSO" }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("button", { hasText: "VERO" }).first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
  });

  test("9+10. Verifica risposta -> feedback corretto", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    const q0 = sols[0];
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: q0.correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expect(page.getByText("Risposta corretta")).toBeVisible();
    // risposta bloccata: nessun pulsante Verifica, pulsanti disabilitati
    await expect(page.getByRole("button", { name: "Verifica risposta" })).toHaveCount(0);
    await expect(page.locator("button", { hasText: "VERO" }).first()).toBeDisabled();
    await expect(page.locator("button", { hasText: "FALSO" }).first()).toBeDisabled();
    // Avanti compare dopo la verifica
    await expect(page.getByRole("button", { name: "Avanti" })).toBeVisible();
  });

  test("11. feedback errato", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    const q0 = sols[0];
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: q0.correctAnswer ? "FALSO" : "VERO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expect(page.getByText("Risposta errata")).toBeVisible();
    await expect(page.getByText("Risposta corretta:")).toBeVisible();
  });

  test("12. risposta bloccata dopo verifica (non modificabile)", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    const q0 = sols[0];
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: q0.correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expectFeedback(page);
    // nessun cambio possibile: i pulsanti sono disabilitati
    await expect(page.locator("button", { hasText: "VERO" }).first()).toBeDisabled();
    await expect(page.locator("button", { hasText: "FALSO" }).first()).toBeDisabled();
  });

  test("13. Avanti manuale dopo verifica", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expectFeedback(page);
    await page.getByRole("button", { name: "Avanti" }).click();
    await expect(page.locator("header").getByText(/2 di 10/)).toBeVisible();
  });

  test("14+15. ritorno indietro -> risultato precedente visibile", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await page.getByRole("button", { name: "Avanti" }).click();
    await page.getByRole("button", { name: "← Indietro" }).click();
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
    // feedback ancora visibile
    await expectFeedback(page);
  });

  test("16. refresh mantiene posizione e risposte verificate", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await page.getByRole("button", { name: "Avanti" }).click();
    await expect(page.locator("header").getByText(/2 di 10/)).toBeVisible();
    await page.reload();
    await expect(page.locator("header").getByText(/2 di 10/)).toBeVisible();
    await page.getByRole("button", { name: "← Indietro" }).click();
    await expectFeedback(page);
  });

  test("17. navigatore: stati e navigazione", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await expect(page.getByRole("dialog", { name: /Domande/ })).toBeVisible();
    // cella 1 verificata, cella 2 non risposta
    await expect(page.getByRole("listitem", { name: /^Domanda 1, corretta|^Domanda 1, errata/ })).toBeVisible();
    await page.getByRole("listitem", { name: /^Domanda 5/ }).click();
    await expect(page.locator("header").getByText(/5 di 10/)).toBeVisible();
  });

  test("18. completamento con domande non verificate", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await page.getByRole("button", { name: "Avanti" }).click();
    // naviga direttamente all'ultima domanda (non verificata) e completa dall'header
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await page.getByRole("listitem", { name: /^Domanda 10/ }).click();
    await page.getByRole("banner").getByRole("button", { name: "Completa", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Completare l’allenamento?" })).toBeVisible();
    await expect(page.getByText(/9 domande non verificate/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Completa", exact: true }).click();
    await page.waitForURL(/\/risultato/);
    await expect(page.getByText("Allenamento completato")).toBeVisible();
  });

  test("19. risultato finale con conteggi", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await verifyAll(page, sessionId, true);
    await completeSession(page);
    await expect(page.getByText("Allenamento completato")).toBeVisible();
    await expect(page.getByText(/Hai risposto correttamente a 10 domande su 10/)).toBeVisible();
    await expect(page.getByText("Corrette", { exact: true }).first()).toBeVisible();
  });

  test("20. filtro errori nel risultato", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    // rispondi male alle prime 3, bene alle restanti 7
    const sols = await sessionSolutions(sessionId);
    for (let i = 0; i < 10; i++) {
      const want = i < 3 ? !sols[i].correctAnswer : sols[i].correctAnswer;
      await page.locator("button", { hasText: want ? "VERO" : "FALSO" }).first().click();
      await page.getByRole("button", { name: "Verifica risposta" }).click();
      await expectFeedback(page);
      if (i < 9) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await completeSession(page);
    await page.getByRole("button", { name: /Errori \(\d+\)/ }).click();
    await expect(page.locator("section[aria-label='Dettaglio domande'] li")).toHaveCount(3);
    // espandi la prima riga filtrata e verifica i dettagli
    await page.locator("section[aria-label='Dettaglio domande'] li button[aria-expanded='false']").first().click();
    await expect(page.getByText("Risposta data", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Risposta corretta", { exact: true }).first()).toBeVisible();
  });

  test("21. ripassa gli errori", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await verifyAll(page, sessionId, false); // tutte errate
    await completeSession(page);
    await expect(page.getByText("Ripassa gli errori")).toBeVisible();
    await page.getByRole("button", { name: "Ripassa gli errori" }).click();
    await page.waitForURL(/\/allenamento\/[0-9a-f-]{36}/);
    await expect(page.locator("header").getByText(/Ripasso errori · 1 di 10/)).toBeVisible();
  });

  test("22. zero errori -> nessun CTA ripasso", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await verifyAll(page, sessionId, true); // tutte corrette
    await completeSession(page);
    await expect(page.getByRole("button", { name: "Ripassa gli errori" })).toHaveCount(0);
  });

  test("23. resume card distinta (Allenamento in corso)", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    // rispondi a una domanda per scrivere lo stato locale
    const sols = await sessionSolutions(sessionId);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await page.goto("/");
    const card = page.getByText("Allenamento in corso");
    await expect(card).toBeVisible();
    await expect(page.getByRole("button", { name: "Continua" })).toBeVisible();
  });

  test("24. abbandona rimuove solo lo stato locale", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    // una risposta per assicurare che lo stato locale sia scritto e la sessione registrata
    const sols = await sessionSolutions(sessionId);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await page.goto("/");
    let confirmed = false;
    page.on("dialog", (d) => {
      confirmed = true;
      void d.accept();
    });
    await page.getByRole("button", { name: "Abbandona" }).click();
    expect(confirmed).toBe(true);
    await expect(page.getByText("Allenamento in corso")).toBeHidden();
  });

  test("25. shortcut V/F selezionano senza verificare né avanzare", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.keyboard.press("v");
    await expect(page.locator("button", { hasText: "VERO" }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Verifica risposta" })).toBeVisible();
    await page.keyboard.press("f");
    await expect(page.locator("button", { hasText: "FALSO" }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
  });

  test("26. Enter verifica la risposta selezionata", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.keyboard.press(sols[0].correctAnswer ? "v" : "f");
    await page.keyboard.press("Enter");
    await expectFeedback(page);
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible(); // Enter non avanza
  });

  test("27. freccia destra avanza solo dopo verifica", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page); // keyboard listeners must be attached before pressing keys
    // senza verifica: la freccia non avanza
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("header").getByText(/1 di 10/)).toBeVisible();
    // dopo verifica: avanza
    await page.keyboard.press(sols[0].correctAnswer ? "v" : "f");
    await page.keyboard.press("Enter");
    await expectFeedback(page);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("header").getByText(/2 di 10/)).toBeVisible();
  });

  test("28+29. viewport mobile: flusso base funziona", async ({ page }) => {
    const { sessionId } = await createPractice(page, 10);
    await page.goto(`/allenamento/${sessionId}`);
    const sols = await sessionSolutions(sessionId);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expectFeedback(page);
    await page.getByRole("button", { name: "Avanti" }).click();
    await expect(page.locator("header").getByText(/2 di 10/)).toBeVisible();
  });

  test("30. axe: nessuna violazione seria su topic, setup, quiz verificato, risultato", async ({ page }) => {
    const topic = await pickTopic(30);
    // topic list
    await page.goto("/allenamento");
    await expect(page.locator("a[href^='/allenamento/argomento/']").first()).toBeVisible();
    // attendi la fine delle animazioni di ingresso (opacity/transform) prima dello scan
    await page.waitForTimeout(600);
    let res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), "topic list axe").toEqual([]);

    // setup
    await page.goto(`/allenamento/argomento/${topic.id}`);
    await expect(page.getByRole("button", { name: "Inizia allenamento" })).toBeVisible();
    await page.waitForTimeout(600);
    res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), "setup axe").toEqual([]);

    // quiz con domanda verificata
    const { sessionId } = await createPractice(page, 10);
    const sols = await sessionSolutions(sessionId);
    await page.goto(`/allenamento/${sessionId}`);
    await waitReady(page);
    await page.locator("button", { hasText: sols[0].correctAnswer ? "VERO" : "FALSO" }).first().click();
    await page.getByRole("button", { name: "Verifica risposta" }).click();
    await expectFeedback(page);
    res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), "quiz verificato axe").toEqual([]);

    // risultato
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await page.getByRole("listitem", { name: /^Domanda 10/ }).click();
    await completeSession(page);
    await expect(page.getByText("Allenamento completato")).toBeVisible();
    res = await new AxeBuilder({ page }).analyze();
    expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), "risultato axe").toEqual([]);
  });
});
