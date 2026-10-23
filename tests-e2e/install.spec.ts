import { test, expect, devices } from "@playwright/test";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Installation has its own phone contexts");
});

test("phone browser is gated on every section; install guide fits portrait and landscape", async ({ browser }, info) => {
  for (const device of ["iPhone 13", "Pixel 5"] as const) {
    const context = await browser.newContext({ ...devices[device] });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const apiCalls: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/")) apiCalls.push(request.url()); });
    for (const path of ["/", "/allenamento", "/installa"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "ViaLibera sulla tua Home." })).toBeVisible();
      await expect(page.locator("[data-mobile-hub]")).toHaveCount(0);
    }
    for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(size);
      const measured = await page.locator("[data-install-guide]").evaluate(element => {
        const invisible = [...element.querySelectorAll("h1,p,li,button")].filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && (rect.bottom > innerHeight + 1 || rect.top < 0 || rect.right > innerWidth + 1);
        }).map(node => node.textContent);
        return { vertical: document.documentElement.scrollHeight - innerHeight, horizontal: document.documentElement.scrollWidth - innerWidth, invisible };
      });
      expect(measured).toEqual({ vertical: 0, horizontal: 0, invisible: [] });
      await page.screenshot({ path: info.outputPath(`${device}-${size.width}.png`) });
    }
    await page.getByRole("button", { name: "Ho aggiunto l’app" }).click();
    await expect(page.getByRole("status")).toContainText("apri ViaLibera dall’icona");
    await expect(page.locator("[data-mobile-hub]")).toHaveCount(0);
    expect(apiCalls).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  }
});

test("Android install request handles acceptance and cancellation without unlocking the browser", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("[data-install-guide]")).toBeVisible();
  for (const outcome of ["dismissed", "accepted"] as const) {
    await page.evaluate(choice => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: choice }) });
      window.dispatchEvent(event);
    }, outcome);
    await page.getByRole("button", { name: "Installa ViaLibera" }).click();
    await expect(page.getByRole("status")).toContainText(outcome === "accepted" ? "Ora apri ViaLibera" : "Puoi riprovare");
    await expect(page.locator("[data-mobile-hub]")).toHaveCount(0);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByRole("status")).toContainText("Aggiunta completata");
  await expect(page.locator("[data-install-guide]")).toBeVisible();
  await context.close();
});

test("Home launch unlocks sections with standard display mode and legacy iOS standalone", async ({ browser }) => {
  for (const legacy of [false, true]) {
    const context = await browser.newContext({ ...devices[legacy ? "iPhone 13" : "Pixel 5"] });
    await context.addInitScript(isLegacy => {
      if (isLegacy) Object.defineProperty(navigator, "standalone", { value: true });
      else {
        const native = window.matchMedia.bind(window);
        window.matchMedia = query => {
          const media = native(query);
          if (query === "(display-mode: standalone)") Object.defineProperty(media, "matches", { value: true });
          return media;
        };
      }
    }, legacy);
    const page = await context.newPage();
    await page.goto("/allenamento");
    await expect(page.locator("[data-mobile-hub]")).toBeVisible();
    await expect(page.locator("[data-install-guide]")).toHaveCount(0);
    await context.close();
  }
});

test("desktop stays accessible and manifest icons are served", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Preparati/ })).toBeVisible();
  await expect(page.locator("[data-install-guide]")).toHaveCount(0);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.scope).toBe("/");
  expect(manifest.start_url).toBe("/");
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png?v=2");
});
