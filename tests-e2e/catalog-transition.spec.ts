import { test, expect } from "@playwright/test";
import { db } from "./helpers";
import { activeCatalog } from "../src/config/catalog";

const owned: string[] = [];
test.afterAll(async () => {
  if (owned.length) {
    await db()`delete from exam_session_questions where session_id in ${db()(owned)}`;
    await db()`delete from exam_sessions where id in ${db()(owned)}`;
  }
});

test('new exams and practice use the explicitly configured 7,020-question catalogue', async ({ request, page }) => {
  const [catalog] = await db()`select id from question_catalog_versions where license_category=${activeCatalog.licenseCategory} and version_code=${activeCatalog.versionCode}`;
  expect((await db()`select count(*)::int as n from questions where catalog_version_id=${catalog.id}`)[0].n).toBe(7020);
  const topics = await (await request.get('/api/practice/topics')).json();
  expect(topics.topics).toHaveLength(25);
  expect(topics.topics.reduce((sum:number, t:{questionCount:number})=>sum+t.questionCount,0)).toBe(7020);
  for (const [path, data] of [['/api/exams', {}], ['/api/practice', {topicId:topics.topics[0].id,questionCount:10}]] as const) {
    const response=await request.post(path,{data}); expect(response.status()).toBe(201);
    const payload=await response.json(); owned.push(payload.sessionId);
    const [session]=await db()`select catalog_version_id from exam_sessions where id=${payload.sessionId}`;
    expect(session.catalog_version_id).toBe(catalog.id);
    const [mismatch]=await db()`select count(*)::int as n from exam_session_questions sq join questions q on q.id=sq.question_id where sq.session_id=${payload.sessionId} and q.catalog_version_id<>${catalog.id}`;
    expect(mismatch.n).toBe(0);
  }
  await page.setViewportSize({width:320,height:568}); await page.goto('/');
  await page.getByRole('button',{name:'Fonte e versione dei quesiti'}).click();
  await expect(page.getByRole('dialog')).toContainText(/7\.?020 quesiti/);
  await expect(page.getByRole('link',{name:/Consulta la fonte ufficiale/})).toBeInViewport();
});

test('a question absent from the new snapshot remains usable in historical sessions and mistakes review', async ({ request, page }) => {
  const [old] = await db()`select id from question_catalog_versions where license_category='AB' and version_code='2025-04-23'`;
  const [removed] = await db()`select q.* from questions q where q.catalog_version_id=${old.id} and not exists (select 1 from questions n join question_catalog_versions c on c.id=n.catalog_version_id where c.version_code=${activeCatalog.versionCode} and c.license_category='AB' and n.official_question_code=q.official_question_code) order by q.official_question_code limit 1`;
  expect(removed).toBeTruthy();
  const rest=await db()`select id from questions where catalog_version_id=${old.id} and topic_id=${removed.topic_id} and id<>${removed.id} order by official_question_code limit 29`;
  for (const mode of ['practice','simulation']) {
    const count=mode==='practice'?10:30;
    const [session]=await db()`insert into exam_sessions (catalog_version_id,mode,status,environment,topic_id,feedback_mode,requested_question_count,practice_status,total_questions,allowed_errors,duration_seconds,started_at,expires_at,selection_seed) values (${old.id},${mode},'in_progress','test',${removed.topic_id},${mode==='practice'?'immediate':'deferred'},${count},${mode==='practice'?'in_progress':null},${count},3,1200,now(),now()+interval '20 minutes',42) returning id`;
    owned.push(session.id);
    const ids=[removed.id,...rest.slice(0,count-1).map(q=>q.id)];
    await db()`insert into exam_session_questions ${db()(ids.map((id, index)=>({session_id:session.id,question_id:id,position:index+1,flagged:false})))}`;
    if(mode==='practice') {
      expect((await request.get(`/api/practice/${session.id}`)).status()).toBe(200);
      const checked=await request.post(`/api/practice/${session.id}/answer`,{data:{questionId:removed.id,selectedAnswer:!removed.correct_answer}});
      expect(checked.status()).toBe(200);
      expect((await request.post(`/api/practice/${session.id}/complete`)).status()).toBe(200);
      const review=await request.post('/api/practice/mistakes',{data:{sourceSessionId:session.id,seed:42}});
      expect(review.status()).toBe(201); const payload=await review.json();owned.push(payload.sessionId);
      expect(payload.questions).toHaveLength(1);expect(payload.questions[0].id).toBe(removed.id);
      expect((await db()`select catalog_version_id from exam_sessions where id=${payload.sessionId}`)[0].catalog_version_id).toBe(old.id);
    } else {
      await page.setViewportSize({width:390,height:844});await page.goto(`/simulazione/${session.id}`);
      await expect(page.locator('main h1')).toHaveText(removed.statement);
      const submitted=await request.post(`/api/exams/${session.id}/submit`,{data:{version:1,answers:ids.map(id=>({questionId:id,selectedAnswer:false})),flagged:[]}});
      expect(submitted.status()).toBe(200);
      await page.goto(`/simulazione/${session.id}/risultato`);
      await page.getByRole('button',{name:'Rivedi risposte'}).click();
      await expect(page.locator('main h1')).toHaveText(removed.statement);
    }
  }
});
