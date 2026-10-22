import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "./helpers";

const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 667, height: 375 }];
const owned: string[] = [];
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });
test.afterAll(async () => { if (owned.length) {
  await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;
  await db()`delete from exam_sessions where id in ${db()(owned)}`;
} });
const active = (page: Page) => page.locator('[data-mobile-hub] [data-active="true"]');
async function ready(page: Page) { await expect(page.locator('[data-mobile-hub]')).toBeVisible(); await expect(active(page).getByRole('heading').first()).toBeVisible(); }
async function fits(page: Page) {
  await page.waitForFunction(() => !document.querySelector('[data-mobile-hub] main')?.hasAttribute('data-moving'));
  const result = await active(page).evaluate(screen => {
    const bounds = screen.getBoundingClientRect(); const bad: string[] = [];
    for (const element of screen.querySelectorAll('button,a,h1,h2,p')) {
      const box = element.getBoundingClientRect(); if (!box.width || !box.height) continue;
      if (box.bottom > bounds.bottom + 1 || box.top < bounds.top - 1 || box.left < bounds.left - 1 || box.right > bounds.right + 1) bad.push((element.textContent ?? '').slice(0,80));
    }
    return { overflow: screen.scrollHeight - screen.clientHeight, page: document.documentElement.scrollHeight - innerHeight, bad };
  });
  expect(result).toEqual({ overflow: 0, page: 0, bad: [] });
}

test('mobile hub: all macro groups, category pages and setup fit without scrolling', async ({ page }, info) => {
  for (const size of sizes) {
    await page.setViewportSize(size); await page.goto('/allenamento'); await ready(page);
    const seen = new Set<string>();
    await fits(page); await page.screenshot({ path: info.outputPath(`groups-${size.width}.png`) });
    for (const group of ['Segnali','Circolazione','Veicolo e viaggio','Sicurezza','Patente e RCA']) {
      await active(page).getByRole('button', { name: new RegExp(`^${group}`) }).click();
      do {
        await fits(page);
        const categories = active(page).locator('button').filter({ has: page.locator('strong') });
        const count = await categories.count();
        for (let i=0;i<count;i++) seen.add((await categories.nth(i).innerText()).split('\n')[0]);
        await categories.first().click(); await fits(page);
        await expect(active(page).getByRole('button', { name: 'Inizia allenamento' })).toBeInViewport();
        await active(page).getByRole('button', { name: '20 domande', exact: true }).click();
        await expect(active(page).getByRole('button', { name: '20 domande', exact: true })).toHaveAttribute('aria-pressed','true');
        await page.reload(); await ready(page);
        await expect(active(page).getByRole('button', { name: '20 domande', exact: true })).toHaveAttribute('aria-pressed','true');
        await active(page).getByRole('button', { name: group, exact: true }).click();
        await page.goBack();
        await expect(active(page).getByRole('button', { name: '20 domande', exact: true })).toHaveAttribute('aria-pressed','true');
        await page.goForward();
        await expect(active(page).getByRole('heading', {name:group,exact:true})).toBeVisible();
        const next=active(page).getByRole('button',{name:'Pagina successiva'});
        if (await next.isDisabled()) break;
        await next.click();
      } while(true);
      await active(page).getByRole('button',{name:'Macroargomenti',exact:true}).click();
    }
    expect(seen.size).toBe(25);
    for (const section of ['Home','Prova d’esame','Allenamento']) {
      await page.getByRole('navigation',{name:'Sezioni'}).getByRole('button',{name:section,exact:true}).click();await fits(page);
    }
  }
});

test('mobile hub: practice starts, verifies, resumes and completes using real APIs', async ({ page }) => {
  await page.setViewportSize(sizes[1]); await page.goto('/allenamento');await ready(page);
  await active(page).getByRole('button',{name:/^Segnali/}).click();
  await active(page).getByRole('button',{name:/^Segnali di pericolo/}).click();
  const created=page.waitForResponse(r=>r.url().endsWith('/api/practice')&&r.request().method()==='POST');
  await active(page).getByRole('button',{name:'Inizia allenamento'}).click();
  const payload=await (await created).json();owned.push(payload.sessionId);
  await page.waitForURL(new RegExp(`/allenamento/${payload.sessionId}$`));
  await page.locator('[data-hydrated="true"]').waitFor();
  await page.getByRole('button',{name:'VERO',exact:true}).click();
  await page.getByRole('button',{name:'Verifica risposta',exact:true}).click();
  await expect(page.locator('main [aria-live="polite"]')).toContainText(/Corretta|Errata/);
  await page.goto('/');await ready(page);
  await active(page).getByRole('button',{name:/Riprendi una sessione/}).click();
  await active(page).getByRole('link',{name:/Allenamento/}).first().click();
  await page.waitForURL(new RegExp(`/allenamento/${payload.sessionId}$`));
  await expect(page.getByRole('button',{name:'VERO',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Completa',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Completa',exact:true}).click();
  await page.waitForURL(/\/risultato/);
  await expect(page.getByText('Allenamento completato',{exact:true})).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(await page.locator('main').evaluate(el=>el.scrollHeight-el.clientHeight)).toBe(0);
    await expect(page.getByRole('button',{name:'Rivedi risposte'})).toBeInViewport();
  }
});

test('mobile hub: exam starts once and submits to a real result', async ({ page }) => {
  await page.setViewportSize(sizes[0]);await page.goto('/?sezione=esame');await ready(page);
  let posts=0;page.on('request',r=>{if(r.url().endsWith('/api/exams')&&r.method()==='POST')posts++});
  const created=page.waitForResponse(r=>r.url().endsWith('/api/exams')&&r.request().method()==='POST');
  await active(page).getByRole('button',{name:'Inizia prova'}).dblclick();
  const payload=await (await created).json();owned.push(payload.sessionId);
  await page.waitForURL(new RegExp(`/simulazione/${payload.sessionId}$`));
  expect(posts).toBe(1);
  await page.getByRole('button',{name:'VERO',exact:true}).click();
  await page.getByRole('button',{name:'Termina',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Consegna',exact:true}).click();
  await page.waitForURL(/\/risultato/);
  await expect(page.getByText('NON SUPERATO',{exact:true})).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(await page.locator('main').evaluate(el=>el.scrollHeight-el.clientHeight)).toBe(0);
    await expect(page.getByRole('button',{name:'Rivedi risposte'})).toBeInViewport();
  }
});

test('mobile hub: errors, retry and browser back retain the chosen context', async ({ page }) => {
  await page.setViewportSize(sizes[1]);let failed=true;
  await page.route('**/api/practice/topics',route=>failed?route.fulfill({status:503,json:{error:'unavailable'}}):route.continue());
  await page.goto('/');await ready(page);
  await page.getByRole('navigation',{name:'Sezioni'}).getByRole('button',{name:'Allenamento',exact:true}).click();
  await expect(active(page).getByText('Le categorie non sono disponibili.')).toBeVisible();
  failed=false;await active(page).getByRole('button',{name:'Ricarica categorie'}).click();
  await active(page).getByRole('button',{name:/^Segnali/}).click();
  await active(page).getByRole('button',{name:/^Segnali di pericolo/}).click();
  await page.route('**/api/practice',route=>route.fulfill({status:500,json:{error:{code:'INTERNAL'}}}));
  await active(page).getByRole('button',{name:'Inizia allenamento'}).click();
  await expect(active(page).getByRole('alert')).toContainText('Riprova');await fits(page);
  await page.goBack();await expect(active(page).getByRole('heading',{name:'Segnali',exact:true})).toBeVisible();
  await page.goBack();await expect(active(page).getByRole('heading',{name:'Allenamento',exact:true})).toBeVisible();
  const scan=await new AxeBuilder({page}).disableRules(['meta-viewport']).analyze();
  expect(scan.violations.map(v=>v.id)).toEqual([]);
});

test('desktop keeps the original landing and category list', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});await page.goto('/');
  await expect(page.getByRole('heading',{name:/Preparati/})).toBeVisible();
  await expect(page.locator('[data-mobile-hub]')).toHaveCount(0);
  await page.goto('/allenamento');await expect(page.getByRole('searchbox')).toBeVisible();
  expect(await page.locator('a[href^="/allenamento/argomento/"]').count()).toBe(25);
});

test('animated taps and touch swipes settle cleanly, including rapid navigation', async ({ page, context }) => {
  await page.setViewportSize(sizes[1]); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/allenamento'); await ready(page);
  await active(page).getByRole('button', {name:/^Segnali/}).click();
  // Freeze the actual transition halfway: the outgoing and incoming opaque panes must meet, never overlap.
  const seam = await page.evaluate(() => {
    const main = document.querySelector('[data-mobile-hub] main')!;
    for (const animation of main.getAnimations({subtree:true})) { animation.pause(); animation.currentTime = 110; }
    const panes = [...main.querySelectorAll('[data-active="true"], [aria-hidden="true"]')].filter(el => el.parentElement === main || el.hasAttribute('data-active'));
    const boxes = panes.map(el=>el.getBoundingClientRect());
    for (const animation of main.getAnimations({subtree:true})) animation.play();
    return boxes.length === 2 ? Math.abs(boxes[0].left - boxes[1].right) : null;
  });
  expect(seam).not.toBeNull(); expect(seam!).toBeLessThan(2);
  await fits(page);
  const nav = page.getByRole('navigation', {name:'Sezioni'});
  await nav.getByRole('button',{name:'Home',exact:true}).click();
  await nav.getByRole('button',{name:'Prova d’esame',exact:true}).click();
  await fits(page); await expect(active(page).getByRole('heading',{name:'Prova d’esame',exact:true})).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:70,y:350}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:170,y:350}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y:350}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await fits(page); await expect(active(page).getByRole('heading',{name:'Segnali',exact:true})).toBeVisible();
  expect(await page.locator('[data-mobile-hub] main').evaluate(el => el.getAnimations({subtree:true}).length)).toBe(0);
  await cdp.detach();
});
