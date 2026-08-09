import { test, expect, type Page } from "@playwright/test";
import { cleanupTestSessions, db } from "./helpers";

/**
 * Geometric layout regressions (editorial redesign).
 *
 * homepage:
 *  - hero title fully readable, never intersecting the right column
 *  - no horizontal overflow, CTAs visible, every word rendered
 *
 * quiz:
 *  - wide shell (>= 70% of the viewport on desktop)
 *  - roomier question panel, aligned VERO/FALSO, centered action bar
 *  - small vertical gap answers -> action bar, no overflow
 */

const HERO_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

const QUIZ_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3210";

async function pickTopic(count = 30): Promise<string> {
  // prefer a topic that actually ships image questions
  const rows = await db()
    `select t.id
     from topics t
     join questions q on q.topic_id = t.id and q.status = 'imported' and q.image_reference is not null
     group by t.id
     having count(q.id) >= ${count}
     order by t.name
     limit 1`;
  if (rows[0]) return String(rows[0].id);
  const fallback = await db()`
    select t.id
    from topics t
    join questions q on q.topic_id = t.id and q.status = 'imported'
    group by t.id
    having count(q.id) >= ${count}
    order by t.name
    limit 1`;
  if (!fallback[0]) throw new Error("nessun topic con >= 30 domande");
  return String(fallback[0].id);
}

async function pickTopicImage(count = 30): Promise<string> {
  const rows = await db()`
    select t.id
    from topics t
    join questions q on q.topic_id = t.id and q.status = 'imported' and q.image_reference is not null
    group by t.id
    having count(q.id) >= ${count}
    order by count(q.id) desc
    limit 1`;
  if (!rows[0]) throw new Error("nessun topic ricco di immagini");
  return String(rows[0].id);
}

async function createPractice(page: Page, count = 10, topicId?: string): Promise<string> {
  const tid = topicId ?? (await pickTopic(count));
  const res = await page.request.post(`${BASE}/api/practice`, {
    data: { topicId: tid, questionCount: count },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { sessionId?: string };
  expect(body.sessionId).toBeTruthy();
  return body.sessionId!;
}

async function positionWithImage(sessionId: string): Promise<{ pos: number; ref: string | null }> {
  const rows = await db()`
    select esq.position, q.image_reference as "ref"
    from exam_session_questions esq
    join questions q on q.id = esq.question_id
    where esq.session_id = ${sessionId} and q.image_reference is not null
    order by esq.position
    limit 1`;
  return rows[0] ? { pos: Number(rows[0].position), ref: rows[0].ref ? String(rows[0].ref) : null } : { pos: 1, ref: null };
}

test.describe("homepage hero geometric", () => {
  for (const vp of HERO_VIEWPORTS) {
    test(`titolo leggibile, nessun overlap/overflow @ ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const h1 = document.querySelector("main h1");
        const grid = h1?.closest(".grid");
        const right = grid?.children[1];
        const h1box = h1!.getBoundingClientRect();
        const rightBox = right?.getBoundingClientRect();

        // widest rendered line of the title (real text width, not the box)
        const probe = h1!.cloneNode(true) as HTMLElement;
        probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;width:max-content;white-space:nowrap;";
        document.body.appendChild(probe);
        const widestLine = probe.getBoundingClientRect().width;
        document.body.removeChild(probe);

        const lineRight = h1box.left + widestLine;
        const twoCol = window.matchMedia("(min-width: 1024px)").matches && !!rightBox;
        const wordsOk = ["Preparati", "all'esame.", "Senza perdere", "tempo."].every((wd) =>
          h1!.textContent!.replace(/\s+/g, " ").replace(/[’']/g, "'").includes(wd),
        );
        return {
          viewport: innerWidth,
          lineRight,
          rightStart: rightBox ? rightBox.x : null,
          intersects: twoCol ? lineRight > rightBox!.x + 4 : null,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          wordsOk,
          ctaVisible: !!document.querySelector("#inizia a") && !!document.querySelector("#inizia button"),
        };
      });

      expect(m.wordsOk, "tutte le parole del titolo renderizzate").toBe(true);
      expect(m.ctaVisible, "CTA visibili").toBe(true);
      expect(m.overflow, `scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`).toBe(false);
      if (m.intersects !== null) {
        expect(m.intersects, `titolo dentro la colonna (lineRight ${Math.round(m.lineRight)} vs colonna ${Math.round(m.rightStart!)})`).toBe(false);
      }
    });
  }
});

test.describe("quiz geometric layout", () => {
  test.beforeAll(async () => {
    await cleanupTestSessions();
  });

  for (const vp of QUIZ_VIEWPORTS) {
    test(`shell ampia, barra centrata e vicina @ ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const sessionId = await createPractice(page, 10);
      try {
        await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-hydrated="true"]', { timeout: 20000 });

        const m = await page.evaluate(() => {
          const root = document.querySelector('[data-hydrated]');
          const panel = document.querySelector("main .border-2.bg-surface");
          const answers = document.querySelector("main [role='group'][aria-label='Risposta']");
          const indietro = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "← Indietro");
          const wrap = indietro?.parentElement;
          const vpW = innerWidth;
          const rootW = root?.getBoundingClientRect().width ?? 0;
          const barRect = indietro?.getBoundingClientRect();
          const groupCenter = wrap ? wrap.getBoundingClientRect().x + wrap.getBoundingClientRect().width / 2 : null;
          const ab = answers?.getBoundingClientRect();
          const btnRects = [...document.querySelectorAll("main [role='group'][aria-label='Risposta'] button")].map((b) => {
            const r = b.getBoundingClientRect();
            return { y: r.y, h: r.height, x: r.x, w: r.width };
          });
          return {
            viewport: vpW,
            viewportH: innerHeight,
            ratio: rootW / vpW,
            panelW: panel?.getBoundingClientRect().width ?? 0,
            barTop: barRect ? barRect.top : null,
            barH: barRect ? barRect.height : null,
            barCenterDelta: groupCenter ? Math.abs(groupCenter - vpW / 2) : null,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            answersAligned: ab ? btnRects.length === 2 && Math.abs(btnRects[0].y - btnRects[1].y) < 2 && Math.abs(btnRects[0].h - btnRects[1].h) < 2 : null,
            answersH: ab ? ab.height : null,
            btnHeights: btnRects.map((r) => r.h),
          };
        });

        expect(m.overflow, "nessun overflow orizzontale").toBe(false);
        expect(m.answersAligned, "VERO e FALSO allineati").toBe(true);
        if (vp.width >= 1280) {
          const expectedRatio = Math.min(1, 1152 / vp.width);
          expect(
            Math.abs(m.ratio - expectedRatio),
            `shell allineata alla Home (ratio ${m.ratio.toFixed(2)} vs atteso ${expectedRatio.toFixed(2)}, max-w-6xl)`,
          ).toBeLessThan(0.03);
          expect(m.panelW, "pannello domanda piu' largo (>= 1000px)").toBeGreaterThanOrEqual(1000);
          expect(m.answersH!, "VERO/FALSO alti (>= 72px)").toBeGreaterThanOrEqual(72);
        }
        if (vp.width >= 1024) {
          expect(m.barCenterDelta!, "action bar centrata (delta < 40px)").toBeLessThan(40);
          // sticky bottom row: the bar must sit at the bottom of the viewport, visible
          expect(m.barTop!, "action bar visibile (top < viewport)").toBeLessThan(m.viewportH!);
          expect(m.barTop!, "action bar non sopra la piega (top >= 0)").toBeGreaterThanOrEqual(0);
        }
        if (vp.width < 1024) {
          // mobile: buttons stacked full-width, still usable
          expect(Math.max(...(m.btnHeights as number[])), "touch target >= 44px").toBeGreaterThanOrEqual(44);
        }
      } finally {
        await page.request.post(`${BASE}/api/practice/${sessionId}/complete`, {}).catch(() => {});
      }
    });
  }

  test("domanda con immagine: area immagine ampia su desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const imageTopic = await pickTopicImage(100);
    let sessionId = "";
    let pos = 0;
    let ref: string | null = null;
    for (let attempt = 0; attempt < 3 && !pos; attempt++) {
      const s = await createPractice(page, 10, imageTopic);
      const hit = await positionWithImage(s);
      if (hit.pos > 1 || (hit.pos === 1 && hit.ref)) {
        sessionId = s;
        pos = hit.pos;
        ref = hit.ref;
      } else {
        await page.request.post(`${BASE}/api/practice/${s}/complete`, {}).catch(() => {});
      }
    }
    expect(sessionId, "sessione con almeno una domanda con immagine").toBeTruthy();
    // warm the media route (cold webServer: first media request may fail the img)
    if (ref) {
      await page.request.get(`${BASE}/api/media/${ref}`).catch(() => {});
    }
    try {
      await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-hydrated="true"]', { timeout: 20000 });
      if (pos > 1) {
        await page.getByRole("button", { name: "Apri navigatore domande" }).click();
        await page.getByRole("listitem", { name: new RegExp(`^Domanda ${pos},`) }).click();
        await page.waitForTimeout(400);
      }
      const img = page.locator("main img").first();
      await expect(img).toBeVisible({ timeout: 15000 });
      const box = await img.boundingBox();
      expect(box).not.toBeNull();
      // bitmap nativa piccola: niente upscale (qualita' originale), quindi
      // verifichiamo che sia ben visibile ma non richiediamo 340px+ su file piccoli
      expect(box!.height, `immagine visibile (h=${Math.round(box!.height)}px)`).toBeGreaterThan(120);
      // l'area/container dell'immagine deve sfruttare la larghezza del pannello
      const btn = page.getByRole("button", { name: "Ingrandisci immagine" });
      const btnBox = await btn.boundingBox();
      expect(btnBox).not.toBeNull();
      expect(btnBox!.width, `area immagine ampia (w=${Math.round(btnBox!.width)}px)`).toBeGreaterThanOrEqual(500);
      // no horizontal overflow on an image question
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    } finally {
      await page.request.post(`${BASE}/api/practice/${sessionId}/complete`, {}).catch(() => {});
    }
  });

  test("action bar stable across different questions (no vertical jump)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const sessionId = await createPractice(page, 10);
    try {
      await page.goto(`${BASE}/allenamento/${sessionId}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-hydrated="true"]', { timeout: 20000 });
      await page.waitForTimeout(600);

      const measureBar = () =>
        page.evaluate(() => {
          const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "← Indietro");
          const r = btn?.getBoundingClientRect();
          return r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
        });

      // target positions: with image, long statement, last question
      const rows = await db()`
        select esq.position, q.image_reference as "img", length(q.statement) as "len"
        from exam_session_questions esq
        join questions q on q.id = esq.question_id
        where esq.session_id = ${sessionId}
        order by esq.position`;
      const withImg = rows.find((r) => r.img)?.position ?? 1;
      const longest = [...rows].sort((a, b) => Number(b.len) - Number(a.len))[0].position;
      const last = Number(rows.length);

      const samples: number[] = [];
      const navTo = async (pos: number) => {
        if (pos > 1) {
          await page.getByRole("button", { name: "Apri navigatore domande" }).click();
          await page.getByRole("listitem", { name: new RegExp(`^Domanda ${pos},`) }).first().click();
          await page.waitForTimeout(350);
        }
        const m = await measureBar();
        expect(m).not.toBeNull();
        samples.push(m!.top);
      };

      await navTo(1);
      await navTo(withImg);
      await navTo(longest);
      await navTo(last);

      const max = Math.max(...samples);
      const min = Math.min(...samples);
      // sticky bottom row: the action bar must NOT jump between questions
      expect(max - min, `action bar stable (top delta ${Math.round(max - min)}px <= 4)`).toBeLessThanOrEqual(4);
    } finally {
      await page.request.post(`${BASE}/api/practice/${sessionId}/complete`, {}).catch(() => {});
    }
  });
});
