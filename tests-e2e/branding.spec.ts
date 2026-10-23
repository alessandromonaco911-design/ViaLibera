import { test, expect, devices, type Page } from "@playwright/test";
import { db } from "./helpers";

test.beforeEach(async ({}, info) => test.skip(info.project.name !== "desktop", "Own phone viewports"));

async function pauseAt(page: Page, time: number) {
  await page.evaluate(value => {
    document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = value; });
  }, time);
}

test("share metadata is present without JavaScript and points to public branded artwork", async ({ request, browser }) => {
  const response = await request.get("/", { headers: { "User-Agent": "WhatsApp/2.0" } });
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('property="og:image" content="https://via-libera.vercel.app/brand/share-v2.png"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect(html).toContain('property="og:image:width" content="1200"');
  expect(html).toContain('rel="apple-touch-startup-image"');
  for (const path of ["/brand/share-v2.png", "/brand/startup-393x852-portrait.png", "/brand/startup-393x852-landscape.png", "/icons/apple-touch-icon.png?v=2", "/favicon.ico", "/brand/traffic-light.svg"]) {
    const asset = await request.get(path);
    expect(asset.ok(), path).toBe(true);
    expect(asset.headers()["content-type"], path).toMatch(/^image\//);
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage(); await page.goto("/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "ViaLibera — Quiz patente B");
  await expect(page.locator("[data-app-intro]")).toHaveCount(0);
  await context.close();
});

test("installed opening stops at red, leaves on green and never replays on navigation or reload", async ({ browser }, info) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 393, height: 852 } });
  await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const page = await context.newPage(); const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const intro = page.locator("[data-app-intro]"); await expect(intro).toBeVisible();
  await pauseAt(page, 600);
  await expect(page.locator('[data-intro-light="red"]')).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-intro-light="green"]')).toHaveCSS("opacity", "0");
  expect(await page.locator("[data-intro-content]").evaluate(el => el.hasAttribute("inert"))).toBe(true);
  const stopped = await page.locator("[data-intro-car]").evaluate(el => el.getBoundingClientRect().right);
  await page.screenshot({ path: info.outputPath("intro-red-iphone15.png") });
  await pauseAt(page, 1050);
  await expect(page.locator('[data-intro-light="red"]')).toHaveCSS("opacity", "0");
  await expect(page.locator('[data-intro-light="green"]')).toHaveCSS("opacity", "1");
  expect(await page.locator("[data-intro-car]").evaluate(el => el.getBoundingClientRect().right)).toBeGreaterThan(stopped);
  await page.screenshot({ path: info.outputPath("intro-green-iphone15.png") });
  await intro.getByRole("button", { name: "Entra subito" }).click();
  await expect(intro).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Da dove iniziamo?" })).toBeVisible();
  await page.getByRole("navigation", { name: "Sezioni" }).getByRole("button", { name: "Allenamento" }).click();
  await expect(intro).toHaveCount(0);
  await page.reload(); await expect(page.locator("[data-mobile-hub]")).toBeVisible();
  await expect(intro).toHaveCount(0); expect(errors).toEqual([]);
  await context.close();
});

test("intro exits by itself and respects reduced motion and deep links", async ({ browser }) => {
  for (const scenario of ["normal", "reduced", "deep-link"] as const) {
    const context = await browser.newContext({ ...devices["iPhone 13"], reducedMotion: scenario === "reduced" ? "reduce" : "no-preference" });
    await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    const page = await context.newPage();
    await page.goto(scenario === "deep-link" ? "/allenamento" : "/");
    await expect(page.locator("[data-mobile-hub]")).toBeVisible();
    if (scenario === "normal") await expect(page.locator("[data-app-intro]")).toBeVisible();
    await expect(page.locator("[data-app-intro]")).toHaveCount(0, { timeout: 3000 });
    expect(await page.locator("[data-intro-content]").evaluate(el => el.hasAttribute("inert"))).toBe(false);
    await context.close();
  }
});

test("intro and new header fit compact, iPhone safe areas and landscape without scroll", async ({ browser }, info) => {
  for (const size of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 852, height: 393 }]) {
    const context = await browser.newContext({ ...devices["iPhone 13"], viewport: size });
    await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    const page = await context.newPage(); await page.goto("/");
    const intro = page.locator("[data-app-intro]"); await expect(intro).toBeVisible();
    await pauseAt(page, 550);
    await page.addStyleTag({ content: ":root{--safe-top:59px;--safe-bottom:34px}" });
    const geometry = await intro.evaluate(el => {
      const box = el.getBoundingClientRect();
      const offscreen = [...el.querySelectorAll("button,img,svg,[data-brand]")].filter(node => {
        const r = node.getBoundingClientRect(); return r.width > 0 && (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1);
      }).length;
      return { width: box.width, height: box.height, offscreen, scrollX: document.documentElement.scrollWidth-innerWidth, scrollY: document.documentElement.scrollHeight-innerHeight };
    });
    expect(geometry).toEqual({ ...size, offscreen: 0, scrollX: 0, scrollY: 0 });
    await page.screenshot({ path: info.outputPath(`intro-${size.width}.png`) });
    await intro.getByRole("button", { name: "Entra subito" }).click();
    const header = page.locator("[data-mobile-hub] > header");
    const brand = header.locator("[data-brand]"); await expect(brand).toBeVisible();
    const mark = await brand.boundingBox(); const badge = await header.getByRole("button").boundingBox();
    expect(mark!.x + mark!.width).toBeLessThanOrEqual(badge!.x);
    await page.screenshot({ path: info.outputPath(`home-brand-${size.width}.png`) });
    await context.close();
  }
});

test("exam and practice keep the new Home target and all header controls reachable", async ({ browser }, info) => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const owned: string[] = [];
  try {
    const { topics } = await (await context.request.get("/api/practice/topics")).json();
    const routes: string[] = [];
    for (const [api, prefix, data] of [
      ["/api/exams", "/simulazione", { seed: 42, environment: "test" }],
      ["/api/practice", "/allenamento", { topicId: topics[0].id, questionCount: 10, seed: 42 }],
    ] as const) {
      const response = await context.request.post(api, { data });
      expect(response.status()).toBe(201);
      const { sessionId } = await response.json(); owned.push(sessionId); routes.push(`${prefix}/${sessionId}`);
    }
    const page = await context.newPage();
    for (const route of routes) for (const size of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 852, height: 393 }]) {
      await page.setViewportSize(size); await page.goto(route);
      await expect(page.locator(".quiz-shell")).toBeVisible();
      await expect(page.locator("[data-app-intro]")).toHaveCount(0);
      const header = page.locator(".quiz-header-row");
      const home = header.getByRole("link", { name: "ViaLibera · Home" });
      await expect(home).toBeVisible();
      const target = await home.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44); expect(target!.height).toBeGreaterThanOrEqual(44);
      const geometry = await header.evaluate(row => {
        const rects = [...row.children].map(child => child.getBoundingClientRect()).filter(rect => rect.width > 0);
        return { outside: rects.some(rect => rect.left < 0 || rect.right > innerWidth + 1), overlap: rects.some((rect, index) => index > 0 && rect.left < rects[index-1].right - 1), scroll: document.documentElement.scrollWidth-innerWidth };
      });
      expect(geometry).toEqual({ outside: false, overlap: false, scroll: 0 });
      await page.screenshot({ path: info.outputPath(`${route.startsWith("/simulazione") ? "exam" : "practice"}-header-${size.width}.png`) });
    }
  } finally {
    await context.close();
    if (owned.length) {
      await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;
      await db()`delete from exam_sessions where id in ${db()(owned)}`;
    }
  }
});
