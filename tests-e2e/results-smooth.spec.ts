import { test, expect, devices, type Browser } from "@playwright/test";
import { db } from "./helpers";

const owned: string[] = [];
test.beforeEach(async ({},info)=>test.skip(info.project.name!=="desktop","Dedicated phone contexts"));
test.afterAll(async()=>{if(owned.length) await db()`delete from exam_sessions where id in ${db()(owned)}`;});
async function phone(browser: Browser) {
  const context=await browser.newContext({...devices["iPhone 13"],viewport:{width:393,height:852},reducedMotion:"reduce"});
  await context.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));return context;
}
async function create(browser: Browser,continuous=false) {
  const context=await phone(browser),page=await context.newPage();
  const {topics}=await(await page.request.get("/api/practice/topics")).json();
  const response=await page.request.post("/api/practice",{data:{topicId:topics[0].id,questionCount:10,seed:1750,continuous}});
  expect(response.status()).toBe(201);const created=await response.json();owned.push(created.sessionId);
  const rows=await db()`select q.id,q.correct_answer,s.position from exam_session_questions s join questions q on q.id=s.question_id where s.session_id=${created.sessionId} order by s.position`;
  return {context,page,created,rows};
}

test("results show complete questions and both answers immediately; only the list scrolls",async({browser},info)=>{
  const {context,page,created,rows}=await create(browser);
  for(const [index,row] of rows.slice(0,2).entries()) {
    const response=await page.request.post(`/api/practice/${created.sessionId}/answer`,{data:{questionId:row.id,selectedAnswer:index===0?row.correct_answer:!row.correct_answer,seed:1750}});expect(response.status()).toBe(200);
  }
  const completed=await page.request.post(`/api/practice/${created.sessionId}/complete`);expect(completed.status()).toBe(200);
  const result=await completed.json();expect(result.answers.every((answer:{explanation:{text:string}|null})=>!!answer.explanation?.text)).toBe(true);
  await page.goto(`/allenamento/${created.sessionId}/risultato`);
  const list=page.getByRole("region",{name:"Domande e risposte"});
  await expect(list.locator("li")).toHaveCount(10);await expect(list.locator("li").first()).toContainText("La tua risposta");
  await expect(list.getByRole("complementary",{name:"Spiegazione della risposta"})).toHaveCount(10);
  await expect(list.locator("li").first().getByRole("complementary")).toContainText(result.answers[0].explanation.text);
  await expect(list.locator("li").first()).toContainText("Soluzione");
  await expect(page.getByRole("button",{name:"Rivedi risposte"})).toHaveCount(0);
  for(const size of [{width:320,height:568},{width:360,height:640},{width:393,height:852},{width:852,height:393}]) {
    await page.setViewportSize(size);
    await page.addStyleTag({content:`:root{--safe-top:${size.width===393?59:0}px;--safe-bottom:${size.width===393?34:0}px}`});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const nav=await page.getByRole("navigation",{name:"Navigazione risultati"}).boundingBox();
    const bounds=await list.evaluate(el=>({height:el.clientHeight,overflow:el.scrollHeight>el.clientHeight,documentY:document.documentElement.scrollHeight-innerHeight,documentX:document.documentElement.scrollWidth-innerWidth}));
    expect(bounds.height).toBeGreaterThan(70);expect(bounds.overflow).toBe(true);expect(bounds.documentX).toBe(0);expect(bounds.documentY).toBe(0);
    await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    expect(await page.getByRole("navigation",{name:"Navigazione risultati"}).boundingBox()).toEqual(nav);
    await expect(list.locator("li").last()).toBeInViewport();
    await page.getByRole("button",{name:"Errate 1",exact:true}).click();await expect(list.locator("li")).toHaveCount(1);await expect(list).toContainText("✕ Errata");
    await page.getByRole("button",{name:"Esatte 1",exact:true}).click();await expect(list.locator("li")).toHaveCount(1);await expect(list).toContainText("✓ Esatta");
    await page.getByRole("button",{name:"Saltate 8",exact:true}).click();await expect(list.locator("li")).toHaveCount(8);await expect(list.locator("li").first()).toContainText("Non data");
    await page.getByRole("button",{name:"Tutte 10",exact:true}).click();
    await page.screenshot({path:info.outputPath(`results-${size.width}.png`)});
  }
  await context.close();
});

test("continuous results and empty filters do not promise missing history",async({browser})=>{
  const {context,page,created,rows}=await create(browser,true);
  expect((await page.request.post(`/api/practice/${created.sessionId}/answer`,{data:{questionId:rows[0].id,selectedAnswer:rows[0].correct_answer,seed:1750}})).status()).toBe(200);
  expect((await page.request.post(`/api/practice/${created.sessionId}/complete`)).status()).toBe(200);
  await page.goto(`/allenamento/${created.sessionId}/risultato`);
  await expect(page.getByText(/Qui sotto l’ultimo blocco/)).toBeVisible();
  await expect(page.getByRole("region",{name:"Domande e risposte"}).locator("li")).toHaveCount(1);
  await page.getByRole("button",{name:"Errate 0",exact:true}).click();await expect(page.getByText("Nessuna risposta errata.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Mostra tutte le risposte"}).click();await expect(page.getByRole("region",{name:"Domande e risposte"}).locator("li")).toHaveCount(1);
  await context.close();
});

test("slow verification opens a neutral sheet before the real verdict, without guessing a solution",async({browser},info)=>{
  const {context,page,created}=await create(browser);
  await page.goto(`/allenamento/${created.sessionId}`);await page.locator('[data-hydrated="true"]').waitFor();
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/answer",async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  await page.getByRole("button",{name:"VERO",exact:true}).click();
  const pending=page.getByRole("dialog",{name:"Verifica della risposta",exact:true});
  await expect(pending).toBeVisible();await expect(pending).not.toContainText("Soluzione");
  await expect(pending.getByRole("button",{name:"Verifica in corso…"})).toBeDisabled();
  await page.screenshot({path:info.outputPath("verification-pending.png")});release();
  await expect(page.getByRole("dialog",{name:/^Risposta (corretta|errata)$/})).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Soluzione");
  await context.close();
});

test("desktop result filters use existing answers without another server navigation",async({browser})=>{
  const {context,page,created}=await create(browser);
  expect((await page.request.post(`/api/practice/${created.sessionId}/complete`)).status()).toBe(200);
  await page.setViewportSize({width:1440,height:900});await page.goto(`/allenamento/${created.sessionId}/risultato`);
  await expect(page.getByRole("button",{name:/^Corrette \(/})).toBeVisible();
  const requests:string[]=[];page.on("request",request=>{if(request.url().includes("/risultato")&&request.url().includes("_rsc"))requests.push(request.url());});
  await page.getByRole("button",{name:/^Corrette \(/}).click();await expect(page).toHaveURL(/filter=correct/);
  await page.getByRole("button",{name:/^Non risposte \(/}).click();await expect(page).toHaveURL(/filter=unanswered/);
  expect(requests).toEqual([]);await context.close();
});

test("exam review separates wrong answers from unanswered questions",async({browser})=>{
  const context=await phone(browser),page=await context.newPage();
  const response=await page.request.post("/api/exams",{data:{seed:154}});expect(response.status()).toBe(201);
  const created=await response.json();owned.push(created.sessionId);
  const [first]=await db()`select correct_answer from questions where id=${created.questions[0].id}`;
  const submitted=await page.request.post(`/api/exams/${created.sessionId}/submit`,{data:{version:created.version,answers:created.questions.map((q:{id:string},i:number)=>({questionId:q.id,selectedAnswer:i===0?!first.correct_answer:null})),flagged:[]}});
  expect(submitted.status()).toBe(200);await page.goto(`/simulazione/${created.sessionId}/risultato`);
  await expect(page.getByRole("heading",{name:"Esame da riprovare"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Domande e risposte"}).getByRole("complementary")).toHaveCount(30);
  await page.getByRole("button",{name:"Errate 1",exact:true}).click();await expect(page.getByRole("region",{name:"Domande e risposte"}).locator("li")).toHaveCount(1);
  await page.getByRole("button",{name:"Saltate 29",exact:true}).click();await expect(page.getByRole("region",{name:"Domande e risposte"}).locator("li")).toHaveCount(29);
  await expect(page.getByText("30 errori totali su 3 ammessi, incluse le non risposte.",{exact:true})).toBeVisible();await context.close();
});
