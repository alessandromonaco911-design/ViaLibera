import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {db} from "./helpers";

const owned:string[]=[];
test.afterAll(async()=>{if(owned.length){await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;await db()`delete from exam_sessions where id in ${db()(owned)}`;}});

test('all creation routes share a device limit; existing sessions and mobile recovery remain usable',async({request,page,context})=>{
  const client=randomUUID();const headers={Cookie:`vialibera-device=${client}`};
  const topics=await(await request.get('/api/practice/topics')).json();
  for(let i=0;i<8;i++){
    const response=await request.post(i%2?'/api/practice':'/api/exams',{headers,data:i%2?{topicId:topics.topics[0].id,questionCount:10}:{}});
    expect(response.status()).toBe(201);owned.push((await response.json()).sessionId);
  }
  for(const [path,data] of [['/api/exams',{}],['/api/practice',{topicId:topics.topics[0].id,questionCount:10}],['/api/practice/mistakes',{sourceSessionId:owned[1]}]] as const){
    const response=await request.post(path,{headers,data});expect(response.status()).toBe(429);
    expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
    expect((await response.json()).error.code).toBe('RATE_LIMITED');
  }
  expect((await request.get(`/api/exams/${owned[0]}`,{headers})).status()).toBe(200);
  const practice=await(await request.get(`/api/practice/${owned[1]}`,{headers})).json();
  expect((await request.post(`/api/practice/${owned[1]}/answer`,{headers,data:{questionId:practice.questions[0].id,selectedAnswer:true}})).status()).toBe(200);
  await context.addCookies([{name:'vialibera-device',value:client,url:'http://127.0.0.1:3210'}]);
  await page.setViewportSize({width:320,height:568});await page.goto('/?sezione=esame');
  await page.getByRole('button',{name:'Inizia prova',exact:true}).click();
  await expect(page.locator('[data-mobile-hub]').getByRole('alert')).toContainText('limite');
  for(const size of [{width:320,height:568},{width:390,height:844},{width:667,height:375}]) {
    await page.setViewportSize(size);
    await expect(page.locator('[data-mobile-hub]').getByRole('alert')).toBeInViewport();
    const action=await page.getByRole('button',{name:'Inizia prova',exact:true}).boundingBox();
    const stage=await page.locator('[data-mobile-hub] main').boundingBox();
    expect(action!.y+action!.height).toBeLessThanOrEqual(stage!.y+stage!.height);
    expect(await page.locator('[data-mobile-hub] [data-active="true"]').evaluate(el=>el.scrollHeight-el.clientHeight)).toBe(0);
  }
  await page.setViewportSize({width:320,height:568});
  await page.getByRole('navigation',{name:'Sezioni'}).getByRole('button',{name:'Allenamento',exact:true}).click();
  const active=page.locator('[data-mobile-hub] [data-active="true"]');
  await active.getByRole('button',{name:/^Circolazione/}).click();
  await active.getByRole('button',{name:/^Velocità e passaggi/}).click();
  await active.getByRole('button',{name:'Inizia allenamento',exact:true}).click();
  await expect(active.getByRole('alert')).toContainText('limite');
  for(const size of [{width:320,height:568},{width:667,height:375}]) {
    await page.setViewportSize(size);
    expect(await active.evaluate(el=>el.scrollHeight-el.clientHeight)).toBe(0);
    await expect(active.getByRole('button',{name:'Inizia allenamento',exact:true})).toBeInViewport();
  }
});
