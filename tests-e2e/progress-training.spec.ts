import { test, expect, devices, type Browser, type Page } from "@playwright/test";
import { db } from "./helpers";
import { emptyProgress, applyProgressAnswer, applyProgressExam } from "../src/lib/progress/model";

const owned: string[] = [];
test.beforeEach(async ({}, info)=>test.skip(info.project.name!=="desktop","Own installed phone contexts"));
test.afterAll(async()=>{if(owned.length) await db()`delete from exam_sessions where id in ${db()(owned)}`;});
async function phone(browser: Browser) {
  const context = await browser.newContext({...devices["iPhone 13"],viewport:{width:393,height:852},reducedMotion:"reduce"});
  await context.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));
  return context;
}
async function progress(page: Page) {
  return page.evaluate(()=>new Promise<Record<string,unknown>>((resolve,reject)=>{
    const request=indexedDB.open("vialibera-progress-v1",1);
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction("summary");const get=tx.objectStore("summary").get("current");get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};
    request.onerror=()=>reject(request.error);
  }));
}
async function session(page: Page, continuous=false) {
  const {topics}=await(await page.request.get("/api/practice/topics")).json();
  const response=await page.request.post("/api/practice",{data:{topicId:topics[0].id,questionCount:10,seed:1540,continuous}});
  expect(response.status()).toBe(201);const created=await response.json();owned.push(created.sessionId);
  await page.goto(`/allenamento/${created.sessionId}`);await page.locator('[data-hydrated="true"]').waitFor();return created;
}

test("empty progress has one navigation, no backup and no nested slider",async({browser})=>{
  const context=await phone(browser), page=await context.newPage();
  await page.goto("/progressi");
  await expect(page.getByText("Il tuo percorso parte da qui.",{exact:true})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Sezioni"}).getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByText(/backup|esporta|importa/i)).toHaveCount(0);
  await page.getByRole("button",{name:"Inizia allenamento",exact:true}).click();
  await expect(page).toHaveURL(/\/allenamento$/);
  await expect(page.getByRole("heading",{name:"Allenamento",exact:true})).toBeVisible();
  await context.close();
});

test("progress matches the approved overview, opens normal details, fits phones and rotates daily advice",async({browser},info)=>{
  const context=await phone(browser),page=await context.newPage();
  await page.goto("/progressi");await expect(page.locator("[data-progress-empty]")).toBeVisible();
  const {topics}=await(await page.request.get("/api/practice/topics")).json();
  const topic=topics.find((item:{code:string})=>item.code==="4462");expect(topic).toBeTruthy();
  let data=emptyProgress("progress-phone-fixture");let id=0;
  const add=(question:string,correct:boolean,name=topic.name)=>{data=applyProgressAnswer(data,{id:`fixture-${id++}`,question,topic:name,correct,at:new Date(2026,9,24,10,0,id).toISOString()});};
  for(let i=0;i<10;i++){add(`q-${i}`,false);add(`q-${i}`,true);add(`q-${i}`,true);}
  const errors=new Set([0,5,10,15,20,25,30,35,40,45,50,55,80,83,86,90,94,98]);
  const names=[topic.name,topics.find((item:{code:string})=>item.code==="4056").name,topics.find((item:{code:string})=>item.code==="4408").name];
  for(let i=0;i<240;i++)add(`q-${i}`,i<140 || !errors.has(i-140),names[i%3]);
  for(const [index,passed]of[false,true,false,true,true].entries())data=applyProgressExam(data,{id:`exam-${index}`,passed,errors:passed?1:5,at:new Date(2026,9,24,11,index).toISOString()});
  await page.evaluate(value=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open("vialibera-progress-v1",1);request.onsuccess=()=>{const db=request.result;const tx=db.transaction("summary","readwrite");tx.objectStore("summary").put(value,"current");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),data);
  await page.reload();await expect(page.locator("[data-progress-overview]")).toBeVisible();
  await expect(page.getByLabel("Precisione e copertura")).toContainText("82%");
  await expect(page.getByLabel("Precisione e copertura")).toContainText("240");
  const card=page.getByLabel("Consiglio di oggi");const before=await card.innerText();
  for(const size of[{width:320,height:568},{width:360,height:640},{width:393,height:852},{width:852,height:393}]){
    await page.setViewportSize(size);
    await page.addStyleTag({content:`:root{--safe-top:${size.width===393?59:0}px;--safe-bottom:${size.width===393?34:0}px}`});
    const bounds=await page.locator('[data-section="progress"] [data-progress-overview]').evaluate(el=>{
      const area=el.getBoundingClientRect();const bad=[...el.querySelectorAll("button,p,strong,b,h1")].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.bottom>area.bottom+1||r.top<area.top-1||r.left<0||r.right>innerWidth+1);}).map(node=>node.textContent);
      return{bad,scroll:document.documentElement.scrollHeight-innerHeight};
    });
    expect(bounds).toEqual({bad:[],scroll:0});await page.screenshot({path:info.outputPath(`progress-${size.width}.png`)});
    for(const which of ["weak","achievements"] as const){
      await page.getByRole("button",{name:which==="weak"?/^Da ripassare/:/^Traguardi/}).click();
      const root=page.locator(`[data-progress-detail="${which}"]`);await expect(root).toBeVisible();
      const outside=await root.evaluate(el=>{const area=el.getBoundingClientRect();return[...el.querySelectorAll("button,p,strong,h1")].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.bottom>area.bottom+1||r.top<area.top-1||r.left<0||r.right>innerWidth+1);}).map(node=>node.textContent);});
      expect(outside).toEqual([]);await page.screenshot({path:info.outputPath(`${which}-${size.width}.png`)});
      await root.getByRole("button",{name:"Progressi",exact:true}).click();
    }
  }
  await page.setViewportSize({width:393,height:852});
  await page.getByRole("button",{name:/^Da ripassare/}).click();
  await expect(page).toHaveURL(/vista=ripasso/);await expect(page.getByRole("heading",{name:"Da ripassare",exact:true})).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.goBack();await expect(page.locator("[data-progress-overview]")).toBeVisible();
  await page.getByRole("button",{name:/^Traguardi/}).click();
  await expect(page.getByRole("heading",{name:"Traguardi",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Progressi",exact:true}).first().click();
  await expect(page.locator("[data-progress-overview]")).toBeVisible();
  await page.clock.install();await page.clock.fastForward(24*3600*1000+61000);
  await expect(card).not.toHaveText(before);
  await page.setViewportSize({width:320,height:568});
  await page.route("**/api/practice",route=>route.fulfill({status:429,contentType:"application/json",body:JSON.stringify({error:{code:"RATE_LIMITED",message:"Riprova fra qualche minuto. I progressi restano salvati."}})}));
  await card.getByRole("button").click();
  const error=page.getByRole("dialog",{name:"Ripasso non disponibile"});await expect(error).toBeVisible();
  await expect(error).toContainText("I progressi restano salvati");
  await error.getByRole("button",{name:"Ho capito"}).click();await expect(error).toHaveCount(0);
  await context.close();
});

test("one tap verifies once, opens explanation and records progress once across reload",async({browser})=>{
  const context=await phone(browser),page=await context.newPage();const created=await session(page);
  const [solution]=await db()`select correct_answer from questions where id=${created.questions[0].id}`;
  let posts=0;page.on("request",request=>{if(request.url().endsWith("/answer"))posts++;});
  const answer=page.getByRole("button",{name:solution.correct_answer?"VERO":"FALSO",exact:true});
  await answer.evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  await expect(page.getByRole("dialog",{name:"Risposta corretta",exact:true})).toBeVisible();
  expect(posts).toBe(1);await expect(page.getByRole("button",{name:"Verifica risposta",exact:true})).toHaveCount(0);
  await expect.poll(async()=>(await progress(page)).answered).toBe(1);
  await page.reload();await page.locator('[data-hydrated="true"]').waitFor();
  await expect.poll(async()=>(await progress(page)).answered).toBe(1);
  await context.close();
});

test("topic selection and continuous setup stay readable at compact and landscape sizes",async({browser},info)=>{
  const context=await phone(browser),page=await context.newPage();
  for(const size of[{width:320,height:568},{width:360,height:640},{width:393,height:852},{width:852,height:393}]){
    await page.setViewportSize(size);await page.goto("/allenamento");
    const screen=page.locator('[data-active="true"][data-section="training"]');
    await expect(screen.getByRole("heading",{name:"Allenamento",exact:true})).toBeVisible();
    await expect(screen.getByRole("button",{name:/^Segnali/})).toBeVisible();
    const macroBounds=await screen.locator('button:has(strong)').evaluateAll(buttons=>buttons.flatMap(button=>{
      const b=button.getBoundingClientRect();return[...button.querySelectorAll("strong,small")].filter(text=>{const r=text.getBoundingClientRect();return r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1;}).map(text=>text.textContent);
    }));
    expect(macroBounds).toEqual([]);await page.screenshot({path:info.outputPath(`topics-${size.width}.png`)});
    await screen.getByRole("button",{name:/^Segnali/}).click();
    await screen.getByRole("button",{name:/^Segnali di pericolo/}).click();
    await expect(screen.getByRole("button",{name:/Senza limite/})).toHaveAttribute("aria-pressed","true");
    const geometry=await screen.evaluate(el=>{
      const bounds=el.getBoundingClientRect();return [...el.querySelectorAll("button,h1,p")].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.bottom>bounds.bottom+1||r.top<bounds.top-1||r.right>innerWidth+1);}).map(node=>node.textContent);
    });
    expect(geometry).toEqual([]);await page.screenshot({path:info.outputPath(`setup-${size.width}.png`)});
  }
  await context.close();
});

test("failed automatic verification keeps the answer and retries without double counting",async({browser})=>{
  const context=await phone(browser),page=await context.newPage();await session(page);
  let fail=true;await page.route("**/answer",route=>{if(fail){fail=false;return route.abort();}return route.continue();});
  await page.getByRole("button",{name:"VERO",exact:true}).click();
  await expect(page.getByRole("button",{name:"Riprova la risposta",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Riprova la risposta",exact:true}).click();
  await expect(page.getByRole("dialog",{name:/Risposta (corretta|errata)/})).toBeVisible();
  await expect.poll(async()=>(await progress(page)).answered).toBe(1);
  await context.close();
});

test("continuous training crosses its first block, resumes and finishes with bounded database rows",async({browser})=>{
  test.setTimeout(150000);
  const context=await phone(browser),page=await context.newPage();const created=await session(page,true);
  const rows=await db()`select q.correct_answer,e.question_id from exam_session_questions e join questions q on q.id=e.question_id where e.session_id=${created.sessionId} order by e.position`;
  for(const row of rows){
    await page.getByRole("button",{name:row.correct_answer?"VERO":"FALSO",exact:true}).click();
    const sheet=page.getByRole("dialog",{name:"Risposta corretta",exact:true});await expect(sheet).toBeVisible();
    await sheet.getByRole("button",{name:"Ho capito, avanti",exact:false}).click();
  }
  await expect(page.locator("article").getByText("Domanda 11 · senza limite",{exact:true})).toBeVisible();
  const [count]=await db()`select count(*)::int as value from exam_session_questions where session_id=${created.sessionId}`;expect(count.value).toBe(10);
  await page.reload();await expect(page.locator("article").getByText("Domanda 11 · senza limite",{exact:true})).toBeVisible();
  await expect.poll(async()=>(await progress(page)).answered).toBe(10);
  await page.getByRole("button",{name:"Termina",exact:true}).click();
  await page.getByRole("dialog",{name:"Terminare l’allenamento?"}).getByRole("button",{name:"Completa",exact:true}).click();
  await expect(page).toHaveURL(/risultato/);await expect(page.getByText("Allenamento completato",{exact:true})).toBeVisible();
  const [result]=await db()`select correct_count,error_count,unanswered_count from exam_sessions where id=${created.sessionId}`;
  expect(result).toMatchObject({correct_count:10,error_count:0,unanswered_count:0});
  await context.close();
});

test("exam grading remains deferred and adds one final exam with only answered questions to progress",async({browser})=>{
  const context=await phone(browser),page=await context.newPage();
  const response=await page.request.post("/api/exams",{data:{seed:44}});expect(response.status()).toBe(201);
  const created=await response.json();owned.push(created.sessionId);await page.goto(`/simulazione/${created.sessionId}`);
  await page.getByRole("button",{name:"VERO",exact:true}).click();
  await expect(page.getByRole("dialog",{name:/Risposta (corretta|errata)/})).toHaveCount(0);
  await page.getByRole("button",{name:"Termina",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Consegna",exact:true}).click();
  await expect(page).toHaveURL(/risultato/);
  await expect.poll(async()=>(await progress(page)).answered).toBe(1);
  expect(((await progress(page)).exams as unknown[]).length).toBe(1);
  await context.close();
});
