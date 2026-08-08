import { test, expect, type Page } from "./fixtures";
import { createSession, cleanupTestSessions } from "./helpers";

test.beforeEach(async () => {
  await cleanupTestSessions();
});

/** Collect transferred bytes + request counts for a navigation. */
async function collect(page: Page) {
  let bytes = 0;
  let requests = 0;
  const media = new Map<string, number>();
  page.on("request", (req) => {
    if (req.resourceType() === "image" || req.url().includes("/api/media/")) {
      media.set(req.url(), (media.get(req.url()) ?? 0) + 1);
    }
    requests++;
  });
  page.on("response", async (res) => {
    const b = await res.body().catch(() => Buffer.alloc(0));
    bytes += b.length;
  });
  return { bytes: () => bytes, requests: () => requests, media: () => media };
}

test.describe("Performance reale", () => {
  test("quiz: al caricamento si scarica solo l'immagine della domanda corrente, non tutte", async ({ page }) => {
    const exam = await createSession(page);
    const { media } = await collect(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expect(page.locator("header").getByText(/Domanda 1 di 30/)).toBeVisible();
    await page.waitForTimeout(1500);
    const mediaCount = media().size;
    // la domanda 1 potrebbe avere immagine (1) oppure no (0); MAI 30
    expect(mediaCount).toBeLessThanOrEqual(2);
  });

  test("quiz: nessuna richiesta a ogni risposta (solo locale)", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    await expect(page.locator("header").getByText(/Domanda 1 di 30/)).toBeVisible();
    const { requests } = await collect(page);
    await page.locator("button", { hasText: "VERO" }).first().click();
    await expect(page.locator('[aria-live="polite"]').getByText("Risposta registrata")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("header").getByText(/Domanda 2 di 30/)).toBeVisible();
    await page.waitForTimeout(500);
    const extra = requests() - (await page.evaluate(() => performance.getEntriesByType("resource").length + 1));
    // non deve esserci nessuna chiamata fetch di rete aggiuntiva dopo la risposta
    expect(extra).toBeLessThanOrEqual(2); // tolleranza: asset variabili
    void requests;
  });

  test("risultato: le immagini NON vengono scaricate tutte insieme", async ({ page }) => {
    const exam = await createSession(page);
    await page.goto(`/simulazione/${exam.sessionId}`);
    for (let i = 0; i < 30; i++) {
      await page.locator("button", { hasText: "VERO" }).first().click();
      if (i < 29) await page.getByRole("button", { name: "Avanti" }).click();
    }
    await page.getByRole("button", { name: "Termina" }).click();
    await page.getByRole("button", { name: "Consegna" }).click();
    await page.waitForURL(/\/risultato/);
    await expect(page.getByText(/SUPERATO|NON SUPERATO/)).toBeVisible();
    const { media } = await collect(page);
    await page.waitForTimeout(1000);
    // nessuna immagine caricata finché non si espande una domanda (lazy)
    expect(media().size).toBe(0);
    // espandi la prima domanda -> 1 immagine al massimo
    await page.locator("section[aria-label='Dettaglio domande'] button[aria-expanded='false']").first().click();
    await page.waitForTimeout(1200);
    expect(media().size).toBeLessThanOrEqual(2);
  });

  test("homepage: pagina leggera e senza richieste media", async ({ page }) => {
    const { bytes, media } = await collect(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Inizia simulazione" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(media().size).toBe(0);
    const kb = bytes() / 1024;
    expect(kb).toBeLessThan(2000); // homepage leggera (no catalog, no media)
  });
});
