import { test, expect, devices, type Page } from "@playwright/test";
import { db } from "./helpers";
const owned:string[]=[];
test.beforeEach(async({},info)=>test.skip(info.project.name!=="desktop","Dedicated phone contexts"));
test.afterAll(async()=>{if(owned.length)await db()`delete from exam_sessions where id in ${db()(owned)}`;});
async function setup(page: Page) {
  await page.goto("/allenamento");
  await page.getByRole("button",{name:/^Segnali/}).click();
  await page.getByRole("button",{name:/^Segnali di pericolo/}).click();
}
for(const motion of["no-preference","reduce"] as const) test(`one continuous handoff covers slow creation and slow page delivery (${motion})`,async({browser},info)=>{
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:393,height:852},reducedMotion:motion});
  await context.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));
  const page=await context.newPage();await setup(page);
  let releasePost!:()=>void,releasePage!:()=>void;
  const postGate=new Promise<void>(resolve=>{releasePost=resolve;}),pageGate=new Promise<void>(resolve=>{releasePage=resolve;});
  let posts=0,pageStarted=false;
  await page.route("**/api/practice",async route=>{
    if(route.request().method()!=="POST")return route.continue();
    posts++;const response=await route.fetch();const payload=await response.json();owned.push(payload.sessionId);
    await postGate;await route.fulfill({response});
  });
  await page.route(/\/allenamento\/[a-f0-9-]+\?/,async route=>{
    if(route.request().headers().rsc!=="1")return route.continue();
    const response=await route.fetch();pageStarted=true;await pageGate;await route.fulfill({response});
  });
  await page.getByRole("button",{name:"Inizia allenamento",exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  const curtain=page.getByRole("dialog",{name:"Passaggio in corso"});await expect(curtain).toBeVisible();
  await expect(curtain).toContainText("Prepariamo il tuo allenamento.");
  await expect(page.locator("[data-task-content]")).toHaveAttribute("inert","");
  const road=curtain.locator("svg g").first();
  const animation=await road.evaluate(el=>getComputedStyle(el).animationName);
  if(motion==="reduce")expect(animation).toBe("none");else expect(animation).toContain("road");
  if(motion==="no-preference") {
    const first=await road.evaluate(el=>getComputedStyle(el).transform);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    expect(await road.evaluate(el=>getComputedStyle(el).transform)).not.toBe(first);
  }
  for(const size of[{width:320,height:568},{width:393,height:852},{width:852,height:393}]) {
    await page.setViewportSize(size);
    await page.addStyleTag({content:`:root{--safe-top:${size.width===393?59:0}px;--safe-bottom:${size.width===393?34:0}px}`});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const outside=await curtain.evaluate(el=>[...el.querySelectorAll("h2,p,button,svg")].filter(node=>{const r=node.getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.right>innerWidth+1;}).map(node=>node.tagName));expect(outside).toEqual([]);
  }
  await page.screenshot({path:info.outputPath(`handoff-${motion}.png`)});
  releasePost();await expect.poll(()=>pageStarted).toBe(true);await expect(curtain).toBeVisible();
  expect(posts).toBe(1);releasePage();
  await page.locator('[data-hydrated="true"]').waitFor();await expect(curtain).toHaveCount(0);
  await expect(page.locator("[data-task-content]")).not.toHaveAttribute("inert","");
  await expect(page.getByRole("button",{name:"VERO",exact:true})).toBeEnabled();await context.close();
});

test("creation failure releases the animated surface and restores the original action",async({browser})=>{
  const context=await browser.newContext({...devices["iPhone 13"],reducedMotion:"reduce"});
  await context.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));const page=await context.newPage();await setup(page);
  await page.route("**/api/practice",route=>route.fulfill({status:429,contentType:"application/json",body:JSON.stringify({error:{code:"RATE_LIMITED",message:"Riprova tra qualche minuto."}})}));
  const start=page.getByRole("button",{name:"Inizia allenamento",exact:true});await start.click();
  await expect(page.getByRole("dialog",{name:"Passaggio in corso"})).toHaveCount(0);
  await expect(page.getByRole("dialog",{name:"Ripasso non disponibile"})).toHaveCount(0);
  await expect(page.getByRole("alert").filter({hasText:"Riprova tra qualche minuto."})).toBeVisible();await expect(start).toBeEnabled();await context.close();
});
