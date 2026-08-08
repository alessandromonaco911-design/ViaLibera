import { test, expect } from "@playwright/test";
import { createSession, cleanupTestSessions } from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

test("PROBE: media abort -> fallback stato DOM", async ({ page }) => {
  const exam = await createSession(page);
  await page.route("**/api/media/**", (route) => route.abort());
  await page.goto(`/simulazione/${exam.sessionId}`);
  await expect(page.locator("header").getByText(/Domanda 1 di 30/)).toBeVisible();
  // naviga fino a una domanda con immagine
  let found = false;
  for (let pos = 1; pos <= 30 && !found; pos++) {
    await page.getByRole("button", { name: "Apri navigatore domande" }).click();
    await page.getByRole('listitem', { name: new RegExp(`^Domanda ${pos}, `) }).click();
    const zoom = page.getByRole("button", { name: "Ingrandisci immagine" });
    if (await zoom.isVisible().catch(() => false)) {
      found = true;
    }
  }
  console.log("PROBE found image question:", found);
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("main img")];
    const fallback = document.querySelector('[aria-label="Immagine non disponibile"]');
    return {
      imgCount: imgs.length,
      imgSrcs: imgs.map((i) => i.getAttribute("src")?.slice(0, 45) ?? null),
      complete: imgs.map((i) => (i as HTMLImageElement).complete),
      naturalWidths: imgs.map((i) => (i as HTMLImageElement).naturalWidth),
      fallbackPresent: !!fallback,
    };
  });
  console.log("PROBE STATE:", JSON.stringify(state));
  const byRole = await page.getByRole("img", { name: "Immagine non disponibile" }).count();
  const byLabel = await page.getByLabel("Immagine non disponibile").count();
  console.log("PROBE byRole:", byRole, "byLabel:", byLabel);
  expect(true).toBe(true);
});
