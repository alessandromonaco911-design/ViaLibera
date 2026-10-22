import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db, type CreatedExam } from "./helpers";

let exam: CreatedExam;
let picturePosition: number;
let longPosition: number;
let longStatement: string;
let longPicturePosition: number;
let longPictureStatement: string;
let practice: CreatedExam;
let practiceLongPosition: number;
const owned: string[] = [];
const desktops = [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/exams", { data: { seed: 42, environment: "test" } });
  expect(response.status()).toBe(201);
  exam = await response.json();
  owned.push(exam.sessionId);
  picturePosition = exam.questions.find((q) => q.image)!.position;
  // Exercise a real catalogue extreme, modifying only this test's own session.
  const [longest] = await db()`select id, statement from questions where status='imported'
    and image_reference is null and catalog_version_id=(select catalog_version_id from questions where id=${exam.questions[0].id})
    order by length(statement) desc, id limit 1`;
  longStatement = longest.statement;
  const existing = exam.questions.find((q) => q.id === longest.id);
  longPosition = existing?.position ?? exam.questions.find((q) => !q.image)!.position;
  if (!existing) {
    await db()`update exam_session_questions set question_id=${longest.id}
      where session_id=${exam.sessionId} and position=${longPosition}`;
  }
  const [longPicture] = await db()`select id, statement from questions where status='imported'
    and image_reference is not null and catalog_version_id=(select catalog_version_id from questions where id=${exam.questions[0].id})
    order by length(statement) desc, id limit 1`;
  longPictureStatement = longPicture.statement;
  const existingPicture = exam.questions.find((q) => q.id === longPicture.id);
  longPicturePosition = existingPicture?.position ?? exam.questions.find((q) => q.position !== picturePosition && q.position !== longPosition)!.position;
  if (!existingPicture) {
    await db()`update exam_session_questions set question_id=${longPicture.id}
      where session_id=${exam.sessionId} and position=${longPicturePosition}`;
  }
  const [topic] = await db()`select topic_id from questions where id=${exam.questions.find((q) => q.image)!.id}`;
  const practiceResponse = await request.post("/api/practice", { data: { topicId: topic.topic_id, questionCount: 10, seed: 42, environment: "test" } });
  expect(practiceResponse.status()).toBe(201);
  practice = await practiceResponse.json();
  owned.push(practice.sessionId);
  const practiceExisting = practice.questions.find((q) => q.id === longPicture.id);
  practiceLongPosition = practiceExisting?.position ?? 1;
  if (!practiceExisting) {
    await db()`update exam_session_questions set question_id=${longPicture.id}
      where session_id=${practice.sessionId} and position=${practiceLongPosition}`;
  }
});

test.afterAll(async () => {
  if (owned.length) {
    await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;
    await db()`delete from exam_sessions where id in ${db()(owned)}`;
  }
});

async function navigate(page: Page, position: number) {
  await page.getByRole("button", { name: "Apri navigatore domande" }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^Domanda ${position},`) }).click();
  await layoutReady(page);
}

async function layoutReady(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function fits(page: Page) {
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector(".quiz-shell")!.getBoundingClientRect();
    const action = document.querySelector(".quiz-action-bar")!.getBoundingClientRect();
    return {
      width: shell.width,
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      bottom: action.bottom,
      height: innerHeight,
    };
  });
  expect(geometry.width).toBe(geometry.viewport);
  expect(geometry.overflow).toBe(false);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
  await expect(page.getByRole("button", { name: "Avanti", exact: true })).toBeInViewport();
}

test("desktop: picture and longest text use full width without a sidebar", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const size of desktops) {
    await page.setViewportSize(size);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expect(page.getByRole("timer")).not.toHaveText("00:00");
    await navigate(page, picturePosition);
    await page.locator("main img").evaluate((el: HTMLImageElement) => el.decode());
    await fits(page);
    const figure = await page.locator(".quiz-figure").boundingBox();
    const heading = await page.locator("main h1").boundingBox();
    expect(figure!.x + figure!.width).toBeLessThan(heading!.x);
    expect(await page.locator("main h1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
    expect(await page.locator("main").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    await expect(page.locator(".quiz-progress")).toBeVisible();
    await expect(page.locator(".quiz-position")).toBeHidden();
    await expect(page.getByRole("group", { name: "Navigatore domande" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`with-image-${size.width}.png`) });

    await navigate(page, longPosition);
    await expect(page.locator("main h1")).toHaveText(longStatement);
    await expect(page.locator(".quiz-figure")).toHaveCount(0);
    await fits(page);
    const text = await page.locator("main h1").boundingBox();
    expect(text!.width).toBeGreaterThan(size.width * .55);
    await page.getByRole("button", { name: "VERO", exact: true }).click();
    await expect(page.getByRole("button", { name: "VERO", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: testInfo.outputPath(`without-image-long-${size.width}.png`) });
  }
  expect(errors).toEqual([]);
});

test("desktop: skipped positions, answered state and accessible navigator stay distinct", async ({ page }) => {
  await page.setViewportSize(desktops[2]);
  await page.goto(`/simulazione/${exam.sessionId}`);
  await expect(page.getByRole("timer")).not.toHaveText("00:00");
  await navigate(page, 20);
  await expect(page.locator(".quiz-progress p")).toHaveText("Domanda 20 di 30");
  await expect(page.locator('.quiz-progress-track [data-answered="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "FALSO", exact: true }).click();
  await expect(page.locator('.quiz-progress-track [data-answered="true"]')).toHaveCount(1);
  await expect(page.locator('.quiz-progress-track [data-current="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Apri navigatore domande" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Chiudi navigatore" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Apri navigatore domande" })).toBeFocused();
  await page.locator(".quiz-references summary").click();
  // Explicit product choice: page zoom disabled. All other accessibility rules remain active.
  const scan = await new AxeBuilder({ page }).disableRules(["meta-viewport"]).analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
});

test("desktop: longest illustrated statement and expanded references remain readable", async ({ page }, testInfo) => {
  for (const size of [desktops[1], desktops[3]]) {
    await page.setViewportSize(size);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await navigate(page, longPicturePosition);
    await expect(page.locator("main h1")).toHaveText(longPictureStatement);
    await page.locator("main img").evaluate((el: HTMLImageElement) => el.decode());
    await page.locator(".quiz-references summary").click();
    await expect(page.locator(".quiz-references[open]")).toBeVisible();
    await page.getByRole("button", { name: "FALSO", exact: true }).click();
    await expect(page.getByRole("button", { name: "FALSO", exact: true })).toHaveAttribute("aria-pressed", "true");
    await fits(page);
    await page.locator("main").evaluate((el) => el.scrollTo({ top: 0 }));
    await page.screenshot({ path: testInfo.outputPath(`long-with-image-${size.width}.png`) });
  }
});

test("desktop: browser zoom reflows to the preserved stacked layout", async ({ page }) => {
  // A 1280px browser at 200% zoom has a 640px CSS viewport.
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`/simulazione/${exam.sessionId}`);
  await navigate(page, picturePosition);
  await expect(page.locator(".quiz-progress")).toBeHidden();
  await expect(page.locator(".quiz-position")).toBeVisible();
  await expect(page.getByRole("button", { name: "Avanti", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("desktop practice: verification and feedback stay in the reading panel", async ({ page }, testInfo) => {
  await page.setViewportSize(desktops[2]);
  await page.goto(`/allenamento/${practice.sessionId}`);
  await page.locator('[data-hydrated="true"]').waitFor();
  const image = practice.questions.find((q) => q.image)!;
  await navigate(page, image.position);
  await page.locator("main img").evaluate((el: HTMLImageElement) => el.decode());
  const original = await page.locator("main h1").textContent();
  await page.getByRole("button", { name: "VERO", exact: true }).click();
  await page.getByRole("button", { name: "Verifica risposta", exact: true }).click();
  await expect(page.locator("main [aria-live='polite']")).toContainText(/Corretta|Errata/);
  await expect(page.locator("main [aria-live='polite']")).toBeInViewport();
  await expect(page.locator("main h1")).toHaveText(original!);
  const feedback = await page.locator("main [aria-live='polite']").boundingBox();
  const figure = await page.locator(".quiz-figure").boundingBox();
  expect(feedback!.x).toBeGreaterThan(figure!.x + figure!.width);
  await expect(page.getByRole("button", { name: "Avanti", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("practice-feedback-1440.png") });
  await page.getByRole("button", { name: "Avanti", exact: true }).click();
  await expect(page.locator("main h1")).not.toHaveText(original!);
  await expect.poll(() => page.locator("main").evaluate((el) => el.scrollTop)).toBe(0);
});

test("mobile: all quiz content fits without scrolling, including catalogue extremes", async ({ page }, testInfo) => {
  for (const size of [
    { width: 320, height: 568 }, { width: 360, height: 640 },
    { width: 390, height: 720 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (const position of [picturePosition, longPicturePosition, longPosition]) {
      await navigate(page, position);
      const boxes = await page.evaluate(() => {
        const stage = document.querySelector('main')!;
        const bounds = stage.getBoundingClientRect();
        const visible = ['.quiz-statement', '.quiz-figure', '.quiz-answer-options', '.quiz-info-button'].flatMap(selector => {
          const element = document.querySelector(selector);
          if (!element) return [];
          const box = element.getBoundingClientRect();
          return [{ selector, top: box.top, bottom: box.bottom, height: box.height }];
        });
        return { scroll: stage.scrollHeight - stage.clientHeight, pageScroll: document.documentElement.scrollHeight - innerHeight,
          top: bounds.top, bottom: bounds.bottom, visible };
      });
      expect(boxes.scroll, JSON.stringify({ size, position, boxes })).toBeLessThanOrEqual(1);
      expect(boxes.pageScroll).toBeLessThanOrEqual(1);
      for (const box of boxes.visible) {
        expect(box.top).toBeGreaterThanOrEqual(boxes.top);
        expect(box.bottom).toBeLessThanOrEqual(boxes.bottom + 1);
        expect(box.height).toBeGreaterThan(0);
      }
      await page.mouse.wheel(0, 600);
      expect(await page.locator('main').evaluate(el => el.scrollTop)).toBe(0);
      await expect(page.getByRole('button', { name: 'Avanti', exact: true })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`no-scroll-${size.width}-${size.height}-q${position}.png`) });
    }
    await page.getByRole('button', { name: 'Informazioni sul quesito' }).click();
    await expect(page.getByRole('dialog', { name: 'Argomento e riferimenti' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Chiudi', exact: true }).click();
  }
});

test("mobile practice: longest illustrated question and feedback fit together", async ({ page }) => {
  await page.goto(`/allenamento/${practice.sessionId}`);
  await page.locator('[data-hydrated="true"]').waitFor();
  await navigate(page, practiceLongPosition);
  if (await page.getByRole('button', { name: 'VERO', exact: true }).isEnabled()) {
    await page.getByRole('button', { name: 'VERO', exact: true }).click();
    await page.getByRole('button', { name: 'Verifica risposta', exact: true }).click();
  }
  await expect(page.locator("main [aria-live='polite']")).toContainText(/Corretta|Errata/);
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 720 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    await layoutReady(page);
    await expect(page.locator('main h1')).toHaveText(longPictureStatement);
    const geometry = await page.locator('main').evaluate(el => ({ overflow: el.scrollHeight - el.clientHeight, scroll: el.scrollTop }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.scroll).toBe(0);
    await expect(page.locator("main [aria-live='polite']")).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Avanti', exact: true })).toBeInViewport();
  }
});

test("mobile: text scales by content and training cues preserve the statement", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/simulazione/${exam.sessionId}`);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /maximum-scale=1/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/);
  await navigate(page, picturePosition);
  await page.waitForFunction(() => !!document.querySelector('h1')?.style.fontSize);
  const shortSize = await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await navigate(page, longPicturePosition);
  await page.waitForFunction(() => !!document.querySelector('h1')?.style.fontSize);
  const longSize = await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(shortSize).toBeGreaterThan(longSize);
  await expect(page.locator('h1 strong')).toHaveCount(0);
  const shortTextOnly = exam.questions.filter(q => !q.image && q.position !== longPosition)
    .sort((a, b) => a.statement.length - b.statement.length)[0];
  await navigate(page, shortTextOnly.position);
  await page.waitForFunction(() => !!document.querySelector('h1')?.style.fontSize);
  expect(await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(20);
  await page.screenshot({ path: testInfo.outputPath('text-only-adaptive-390.png') });
  await page.goto(`/allenamento/${practice.sessionId}`);
  await navigate(page, practiceLongPosition);
  await expect(page.locator('h1')).toHaveText(longPictureStatement);
  expect(await page.locator('h1 strong').count()).toBeGreaterThan(0);
  expect(await page.locator('h1 strong').first().evaluate(el => parseInt(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  await page.screenshot({ path: testInfo.outputPath('practice-emphasis-390.png') });
});
