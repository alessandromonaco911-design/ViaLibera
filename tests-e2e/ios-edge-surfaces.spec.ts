import { test, expect, devices } from "@playwright/test";

test.beforeEach(async ({}, info) => test.skip(info.project.name !== "desktop", "Own installed iPhone context"));

test("installed iPhone Home uses opaque viewport-anchored surfaces at both edges", async ({ browser }, info) => {
  const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 393, height: 852 } });
  await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("[data-mobile-hub]")).toBeVisible();
  await page.addStyleTag({ content: ":root{--safe-top:59px;--safe-bottom:34px}" });
  const header = page.locator("[data-mobile-hub] > header");
  const nav = page.getByRole("navigation", { name: "Sezioni" });
  for (const locator of [header, nav]) {
    await expect(locator).toHaveCSS("position", "sticky");
    const style = await locator.evaluate(el => {
      const css = getComputedStyle(el); const rect = el.getBoundingClientRect();
      return { fullWidth: rect.width >= innerWidth * .9, opaque: !css.backgroundColor.includes("rgba") && css.backgroundColor !== "transparent", filter: css.filter, backdrop: css.backdropFilter };
    });
    expect(style).toEqual({ fullWidth: true, opaque: true, filter: "none", backdrop: "none" });
  }
  expect((await header.boundingBox())!.y).toBe(0);
  const bottom = await nav.boundingBox();
  expect(bottom!.y + bottom!.height).toBe(852);
  await page.screenshot({ path: info.outputPath("iphone-15-anchored-surfaces.png") });
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBe(0);
  await context.close();
});
