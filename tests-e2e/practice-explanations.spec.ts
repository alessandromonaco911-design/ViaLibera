import { test, expect, devices } from "@playwright/test";
import { db } from "./helpers";

const owned: string[] = [];
async function pinQuestion(session: { sessionId: string; questions: { id: string }[] }, id: string) {
  const sql = db();
  const ids = [id, ...session.questions.map(q => q.id).filter(q => q !== id)].slice(0, 10);
  await sql`delete from exam_session_questions where session_id=${session.sessionId}`;
  await sql`insert into exam_session_questions ${sql(ids.map((questionId, index) => ({ session_id: session.sessionId, question_id: questionId, position: index + 1 })))}`;
}
test.beforeEach(async ({}, info) => test.skip(info.project.name !== "desktop", "Own iPhone contexts"));
test.afterAll(async () => {
  if (owned.length) {
    await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;
    await db()`delete from exam_sessions where id in ${db()(owned)}`;
  }
});

test("iPhone 15: explanations, focus, safe areas, long copy and last question stay inside viewport", async ({ browser }, info) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 393, height: 852 } });
  await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const row = (await db()`select q.id,q.topic_id from questions q join question_catalog_versions c on c.id=q.catalog_version_id where c.version_code='observed-2026-10-22' and q.official_question_code='24198' limit 1`)[0];
  const response = await context.request.post("/api/practice", { data: { topicId: row.topic_id, questionCount: 10, seed: 41 } });
  expect(response.status()).toBe(201);
  const session = await response.json(); owned.push(session.sessionId);
  await pinQuestion(session, row.id);
  await page.goto(`/allenamento/${session.sessionId}`);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  // Simulate iPhone 15 safe insets separately from screen size. Edge cannot render native iOS chrome.
  await page.addStyleTag({ content: ":root{--safe-top:59px;--safe-bottom:34px}" });
  await page.getByRole("button", { name: "FALSO", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Risposta errata" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("abbaglianti");
  await expect(sheet).toContainText("Soluzione VERO");
  for (const size of [{ width: 393, height: 852 }, { width: 360, height: 640 }, { width: 320, height: 568 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim())).toBe(`${size.height}px`);
    await expect(sheet).toBeVisible();
    const geometry = await sheet.evaluate(element => {
      const r = element.getBoundingClientRect();
      const offscreen = [...element.querySelectorAll("button,p,a,h2")].filter(node => {
        const b = node.getBoundingClientRect(); return b.width > 0 && (b.bottom > innerHeight + 1 || b.top < 0 || b.left < 0 || b.right > innerWidth + 1);
      }).map(node => node.textContent);
      return { fits: r.top >= 0 && r.bottom <= innerHeight + 1, scroll: document.documentElement.scrollHeight - innerHeight, offscreen };
    });
    expect(geometry).toEqual({ fits: true, scroll: 0, offscreen: [] });
    await page.screenshot({ path: info.outputPath(`explanation-${size.width}.png`) });
  }
  await sheet.getByRole("button", { name: "Rivedi la domanda" }).click();
  await expect(sheet).not.toBeVisible();
  await page.getByRole("button", { name: "Leggi la spiegazione" }).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Leggi la spiegazione" }).click();
  await expect(sheet).toContainText("abbaglianti");
  await sheet.getByRole("button", { name: "Ho capito, avanti" }).click();
  await expect(page.locator("article").getByText("Domanda 2 di 10", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("long explanation pages, text-only question, focus trap and final confirmation", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 320, height: 568 } });
  await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const [row] = await db()`select q.id,q.topic_id from questions q join question_catalog_versions c on c.id=q.catalog_version_id where c.version_code='observed-2026-10-22' and q.official_question_code='23754' limit 1`;
  const response = await context.request.post("/api/practice", { data: { topicId: row.topic_id, questionCount: 10, seed: 43 } });
  expect(response.status()).toBe(201); const session = await response.json(); owned.push(session.sessionId);
  await pinQuestion(session, row.id);
  const page = await context.newPage();
  await page.route(`**/api/practice/${session.sessionId}/answer`, async route => {
    const original = await route.fetch();
    const json = await original.json();
    if (json.explanation) {
      json.explanation.text = Array(5).fill(json.explanation.text).join(" ");
      json.explanation.remember = "Lascia spazio agli utenti vulnerabili e controlla sempre visibilità, condizioni della strada e precedenze prima di agire.";
      json.explanation.sourceLabel = "Codice della strada · ACI";
    }
    await route.fulfill({ response: original, json });
  });
  await page.goto(`/allenamento/${session.sessionId}`);
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.addStyleTag({ content: ":root{--safe-top:59px;--safe-bottom:34px}" });
  await page.getByRole("button", { name: "VERO", exact: true }).click();
  let sheet = page.getByRole("dialog", { name: "Risposta corretta" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Parte successiva" })).toBeEnabled();
  const text = await sheet.locator('[aria-live="polite"]').innerText();
  await sheet.getByRole("button", { name: "Parte successiva" }).click();
  await expect(sheet.locator('[aria-live="polite"]')).not.toHaveText(text);
  const bounds = await sheet.evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: innerHeight, overflow: el.scrollHeight - el.clientHeight }));
  expect(bounds.top).toBeGreaterThanOrEqual(59);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.overflow).toBe(0);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-explanation-sheet]'))).toBe(true);
  }
  await sheet.getByRole("button", { name: "Rivedi la domanda" }).click();
  await page.getByRole("button", { name: "Apri navigatore domande" }).click();
  await page.getByRole("button", { name: /^Domanda 10,/ }).click();
  await page.getByRole("button", { name: "VERO", exact: true }).click();
  sheet = page.getByRole("dialog", { name: /Risposta (corretta|errata)/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Ho capito, completa" }).click();
  await expect(page.getByRole("dialog", { name: "Completare l’allenamento?" })).toBeVisible();
  await context.close();
});

test("unverified payloads hide explanations; repeated verification keeps the same explanation", async ({ request }) => {
  const [row] = await db()`select q.id,q.topic_id from questions q join question_catalog_versions c on c.id=q.catalog_version_id where c.version_code='observed-2026-10-22' and q.official_question_code='24198' limit 1`;
  const response = await request.post("/api/practice", { data: { topicId: row.topic_id, questionCount: 10, seed: 42 } });
  expect(response.status()).toBe(201); const created = await response.json(); owned.push(created.sessionId);
  await pinQuestion(created, row.id);
  const before = await (await request.get(`/api/practice/${created.sessionId}`)).json();
  expect(before.states.every((s: Record<string, unknown>) => !Object.hasOwn(s, "explanation"))).toBe(true);
  expect(before.questions.every((q: Record<string, unknown>) => !Object.hasOwn(q, "explanation"))).toBe(true);
  const answer = { questionId: row.id, selectedAnswer: true };
  const check = await (await request.post(`/api/practice/${created.sessionId}/answer`, { data: answer })).json();
  expect(check.isCorrect).toBe(true); expect(check.explanation.text).toContain("abbaglianti");
  const replay = await (await request.post(`/api/practice/${created.sessionId}/answer`, { data: answer })).json();
  expect(replay).toEqual(check);
  const after = await (await request.get(`/api/practice/${created.sessionId}`)).json();
  expect(after.states.find((s: { questionId: string }) => s.questionId === row.id).explanation).toEqual(check.explanation);
});

test("every training category returns a bound explanation after correct and incorrect answers", async ({ playwright }) => {
  // Twenty-five sequential sessions include remote database round trips.
  test.setTimeout(240_000);
  const client = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210" });
  const topicsResponse = await client.get("/api/practice/topics");
  expect(topicsResponse.ok()).toBe(true);
  const { topics } = await topicsResponse.json();
  expect(topics).toHaveLength(25);
  await client.dispose();
  for (const [index, topic] of topics.entries()) {
    // New device context keeps each category independent of the per-device creation budget.
    const request = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3210" });
    try {
      const response = await request.post("/api/practice", { data: { topicId: topic.id, questionCount: 10, seed: 123 } });
      expect(response.status(), topic.name).toBe(201);
      const session = await response.json(); owned.push(session.sessionId);
      const question = session.questions[0];
      expect(question).not.toHaveProperty("explanation");
      expect(question).not.toHaveProperty("correctAnswer");
      const [row] = await db()`select correct_answer from questions where id=${question.id}`;
      const correct = index % 2 === 0;
      const checked = await (await request.post(`/api/practice/${session.sessionId}/answer`, { data: { questionId: question.id, selectedAnswer: correct ? row.correct_answer : !row.correct_answer } })).json();
      expect(checked.isCorrect, topic.name).toBe(correct);
      expect(checked.explanation?.text.length, topic.name).toBeGreaterThan(30);
      expect(checked.explanation.text).not.toContain("in preparazione");
      expect(checked.explanation.remember.length).toBeGreaterThan(0);
      expect(checked.explanation.sourceUrl).toMatch(/^https:\/\//);
      const resumedResponse = await request.get(`/api/practice/${session.sessionId}`);
      expect(resumedResponse.ok(), topic.name).toBe(true);
      const resumed = await resumedResponse.json();
      const verifiedState = resumed.states.find((state: {questionId: string}) => state.questionId === question.id);
      expect(verifiedState, topic.name).toBeDefined();
      expect(verifiedState.explanation).toEqual(checked.explanation);
      expect(resumed.states.filter((state: {questionId: string}) => state.questionId !== question.id).every((state: Record<string, unknown>) => !Object.hasOwn(state, "explanation"))).toBe(true);
    } finally {
      await request.dispose();
    }
  }
});
