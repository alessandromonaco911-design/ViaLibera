import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../src/lib/db";
import { maintainSessions, parseMaintenanceArgs } from "../scripts/db/maintain-sessions";

const environment=`maintenance-${randomUUID()}`;
const ids:string[]=[];
after(async()=>{if(ids.length){await sql`delete from exam_session_questions where session_id in ${sql(ids)}`;await sql`delete from exam_sessions where id in ${sql(ids)}`;}await sql.end();});

test("maintenance is dry-run by default and rejects ambiguous or unsafe flags",()=>{
  assert.equal(parseMaintenanceArgs([]).mode,"dry-run");
  assert.throws(()=>parseMaintenanceArgs(["--apply","--dry-run"]));
  assert.throws(()=>parseMaintenanceArgs(["--older-than-days=-1"]));
});

test("bounded maintenance removes only stale unfinished sessions and respects actual answer activity",async()=>{
  const [question]=await sql`select q.id,q.catalog_version_id,q.topic_id from questions q join question_catalog_versions c on c.id=q.catalog_version_id where c.license_category='AB' and c.status='imported' limit 1`;
  const now=new Date();
  async function make(age:number, opts:{completed?:boolean;answered?:boolean;recentAnswer?:boolean;foreign?:boolean;futureExam?:boolean}={}){
    const old=new Date(now.getTime()-age*86400_000).toISOString();
    const [session]=await sql`insert into exam_sessions (catalog_version_id,mode,status,environment,total_questions,allowed_errors,duration_seconds,started_at,expires_at,selection_seed,updated_at,completed_at,practice_status)
      values (${question.catalog_version_id},${opts.futureExam?'simulation':'practice'},${opts.completed?'completed':'in_progress'},${opts.foreign?environment+'-other':environment},1,0,0,${old},${opts.futureExam?new Date(now.getTime()+86400_000).toISOString():old},1,${old},${opts.completed?old:null},${opts.completed?'completed':'in_progress'}) returning id`;
    ids.push(session.id);
    await sql`insert into exam_session_questions (session_id,question_id,position,selected_answer,answer_verified,updated_at) values (${session.id},${question.id},1,${opts.answered?false:null},${!!opts.answered},${opts.recentAnswer?now.toISOString():old})`;
    return session.id as string;
  }
  const emptyOld=await make(8), inactiveOld=await make(91,{answered:true});
  const retained=[await make(2),await make(30,{answered:true}),await make(100,{completed:true}),await make(100,{answered:true,recentAnswer:true}),await make(100,{foreign:true}),await make(100,{futureExam:true})];
  const dry=await maintainSessions({mode:'dry-run',environment,now});assert.equal(dry.sessionsFound,2);assert.equal(dry.deletedSessions,0);
  const first=await maintainSessions({mode:'apply',environment,now,batchSize:1});assert.equal(first.deletedSessions,1);
  const second=await maintainSessions({mode:'apply',environment,now});assert.equal(second.deletedSessions,1);
  assert.equal((await sql`select id from exam_sessions where id in ${sql([emptyOld,inactiveOld])}`).length,0);
  assert.equal((await sql`select id from exam_sessions where id in ${sql(retained)}`).length,retained.length);
  assert.equal((await maintainSessions({mode:'apply',environment,now})).deletedSessions,0);
});
