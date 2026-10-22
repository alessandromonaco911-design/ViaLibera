import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { db } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

const sizes = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
const owned: string[] = [];
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});
let topicId: string;
let longTopicId: string;
let exam: { sessionId: string; questions: { position: number; image: unknown }[] };
let practice: { sessionId: string; questions: { id: string; position: number; image: unknown }[] };
let resultSession: string;

async function create(request: APIRequestContext, path: string, data: object) {
  const response = await request.post(path, { data: { ...data, environment: "test" } });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  owned.push(payload.sessionId);
  return payload;
}

test.beforeAll(async ({ request }) => {
  const topics = await db()`select t.id from topics t join questions q on q.topic_id=t.id
    where q.status='imported' and q.image_reference is not null
    group by t.id order by count(*) desc limit 1`;
  topicId = topics[0].id;
  const [longTopic] = await db()`select id from topics order by length(name) desc limit 1`;
  longTopicId = longTopic.id;
  exam = await create(request, "/api/exams", { seed: 42 });
  practice = await create(request, "/api/practice", { topicId, questionCount: 10, seed: 42 });
  const completed = await create(request, "/api/practice", { topicId, questionCount: 10, seed: 84 });
  resultSession = completed.sessionId;
  const [solution] = await db()`select correct_answer from questions where id=${completed.questions[0].id}`;
  const checked = await request.post(`/api/practice/${resultSession}/answer`, {
    data: { questionId: completed.questions[0].id, selectedAnswer: !solution.correct_answer },
  });
  expect(checked.ok()).toBeTruthy();
  expect((await request.post(`/api/practice/${resultSession}/complete`)).ok()).toBeTruthy();
});

test.afterAll(async () => {
  if (owned.length) {
    await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;
    await db()`delete from exam_sessions where id in ${db()(owned)}`;
  }
});

async function reflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const bad: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("main h1, main h2, main p, main button, main a")) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || element.closest('[aria-hidden="true"]')) continue;
      if (getComputedStyle(element).textOverflow === "ellipsis") continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      if ([...range.getClientRects()].some((text) => text.right > box.right + 1 || text.left < -1 || text.right > width + 1)) {
        bad.push((element.textContent ?? "").trim().slice(0, 80));
      }
    }
    return { pageOverflow: document.documentElement.scrollWidth > width + 1, bad };
  });
  expect(overflow).toEqual({ pageOverflow: false, bad: [] });
}

test("home, topics and setup: text stays inside its cards at every width", async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const route of ["/", "/allenamento", `/allenamento/argomento/${topicId}`, `/allenamento/argomento/${longTopicId}`]) {
      expect((await page.goto(route))?.status()).toBe(200);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await reflow(page);
    }
  }
});

for (const mode of ["simulazione", "allenamento"] as const) {
  test(`${mode}: readable question, large image and reachable controls on phones`, async ({ page }, testInfo) => {
    const session = mode === "simulazione" ? exam : practice;
    const picture = session.questions.find((q) => q.image);
    expect(picture).toBeTruthy();
    for (const size of [...sizes.filter((size) => size.width < 768), { width: 667, height: 375 }]) {
      await page.setViewportSize(size);
      await page.goto(`/${mode}/${session.sessionId}`);
      await page.locator("main h1").waitFor();
      await page.getByRole("button", { name: "Apri navigatore domande" }).click();
      await page.locator(`[role='dialog'] [aria-label^='Domanda ${picture!.position},']`).click();
      const title = page.locator("main h1");
      expect(await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(size.width > size.height ? 16 : size.height <= 700 ? 18 : 20);
      const image = page.locator("main img");
      await expect(image).toBeVisible();
      await image.evaluate((el: HTMLImageElement) => el.decode());
      const imageBox = await image.boundingBox();
      expect(imageBox!.width).toBeGreaterThanOrEqual(size.width > size.height ? size.width * .25 : Math.min(240, size.width - 68));
      const action = page.getByRole("button", { name: mode === "simulazione" ? "Avanti" : "Verifica risposta", exact: true });
      const actionBox = await action.boundingBox();
      expect(actionBox!.height).toBeGreaterThanOrEqual(48);
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(size.height + 1);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${size.width}-after.png`) });
      await page.getByRole("button", { name: "Ingrandisci immagine" }).click();
      const dialog = page.getByRole("dialog", { name: "Immagine ingrandita" });
      await expect(dialog).toBeVisible();
      const close = dialog.getByRole("button", { name: "Chiudi" });
      await expect(close).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`zoom-${size.width}-after.png`) });
      await close.click();
      await expect(dialog).toBeHidden();
      await reflow(page);
    }
  });
}

test("practice result: full text, large images and filters fit a small phone", async ({ page }) => {
  await page.setViewportSize(sizes[0]);
  await page.goto(`/allenamento/${resultSession}/risultato`);
  await page.getByRole("button", { name: "Rivedi risposte" }).click();
  const text = page.locator("main h1");
  expect(await text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await reflow(page);
  await page.getByRole("button", { name: "Riepilogo" }).click();
  await page.getByRole("button", { name: /1 Errori/ }).click();
  await expect(page.getByRole("button", { name: "Risposta successiva" })).toBeDisabled();
});

test("practice: verification keeps the question, next resets the reading position", async ({ page }) => {
  await page.setViewportSize(sizes[0]);
  await page.goto(`/allenamento/${practice.sessionId}`);
  await page.locator('[data-hydrated="true"]').waitFor();
  const question = await page.locator("main h1").textContent();
  await page.getByRole("button", { name: "VERO", exact: true }).click();
  await page.getByRole("button", { name: "Verifica risposta", exact: true }).click();
  await expect(page.locator("main [aria-live='polite']")).toContainText(/Corretta|Errata/);
  await expect(page.locator("main [aria-live='polite']")).toBeInViewport();
  await expect(page.locator("main h1")).toHaveText(question!);
  await page.getByRole("button", { name: "Avanti", exact: true }).click();
  await expect(page.locator("main h1")).not.toHaveText(question!);
  await expect.poll(() => page.locator("main").evaluate((el) => el.scrollTop)).toBe(0);
});

test("mobile: contrast, dialog focus and expanded results remain accessible", async ({ page }, testInfo) => {
  await page.setViewportSize(sizes[0]);
  for (const route of ["/", "/allenamento", `/allenamento/${practice.sessionId}`, `/allenamento/${resultSession}/risultato`]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    // Page zoom is explicitly disabled by the product owner; retain all other axe checks.
    const scan = await new AxeBuilder({ page }).disableRules(["meta-viewport"]).analyze();
    await writeFile(testInfo.outputPath(`axe-${route.replaceAll("/", "_") || "home"}.json`), JSON.stringify(scan));
    expect(scan.violations.map((v) => ({ id: v.id, impact: v.impact }))).toEqual([]);
  }
  await page.goto(`/allenamento/${practice.sessionId}`);
  const trigger = page.getByRole("button", { name: "Apri navigatore domande" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Domande/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Chiudi navigatore" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("mobile: failed question image recovers when changing question", async ({ page }) => {
  await page.setViewportSize(sizes[1]);
  const pictures = practice.questions.filter((q) => q.image);
  expect(pictures.length).toBeGreaterThanOrEqual(2);
  const first = pictures[0];
  const source = await db()`select image_reference from questions where id=${first.id}`;
  await page.route(`**/media/questions/${source[0].image_reference}.png`, (route) => route.abort());
  await page.goto(`/allenamento/${practice.sessionId}`);
  await page.getByRole("button", { name: "Apri navigatore domande" }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^Domanda ${first.position},`) }).click();
  await expect(page.getByRole("img", { name: "Immagine non disponibile" })).toBeVisible();
  await page.getByRole("button", { name: "Apri navigatore domande" }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^Domanda ${pictures[1].position},`) }).click();
  const image = page.locator("main img");
  await expect(image).toBeVisible();
  await image.evaluate((el: HTMLImageElement) => el.decode());
});

test("simulation: answer, manual next, submit and read the result on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/simulazione/${exam.sessionId}`);
  await expect(page.getByRole("timer")).not.toHaveText("00:00");
  const question = await page.locator("main h1").textContent();
  await page.getByRole("button", { name: "VERO", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText(question!);
  await page.getByRole("button", { name: "Avanti", exact: true }).click();
  await expect(page.locator("main h1")).not.toHaveText(question!);
  await page.getByRole("button", { name: "Termina", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Consegnare la simulazione?" });
  await expect(dialog.getByRole("button", { name: "Consegna", exact: true })).toBeInViewport();
  await dialog.getByRole("button", { name: "Consegna", exact: true }).click();
  await page.waitForURL(/\/risultato/);
  await expect(page.getByText("NON SUPERATO", { exact: true })).toBeVisible();
  await reflow(page);
});
