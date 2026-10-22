import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../src/lib/db";
import { consumeCreationBudget, CreationLimitError } from "../src/lib/security/session-creation";

const scope = `test-${randomUUID()}`;
after(async()=>{await sql`delete from session_creation_limits where key like ${scope+"%"}`;await sql.end();});

test("shared budgets enforce concurrency without overshoot or increments from rejected clients",async()=>{
  const settings={scope,limits:[{key:"global-day",seconds:86400,limit:7},{key:"device",seconds:600,limit:3}]};
  const results=await Promise.allSettled(Array.from({length:12},()=>consumeCreationBudget("one",settings)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.status==='rejected'&&r.reason instanceof CreationLimitError));
  assert.equal((await sql`select attempts from session_creation_limits where key=${scope+':global-day'}`)[0].attempts,3);
  for(let i=0;i<3;i++)await consumeCreationBudget("two",settings);
  await consumeCreationBudget("three",settings);
  await assert.rejects(consumeCreationBudget("fresh-cookie",settings),CreationLimitError);
  assert.equal((await sql`select attempts from session_creation_limits where key=${scope+':global-day'}`)[0].attempts,7);
  assert.equal((await sql`select count(*)::int as n from session_creation_limits where key like ${scope+":%"}`)[0].n,4);
});

test("a new time window admits requests again and reports a bounded retry interval",async()=>{
  const start=Math.ceil(Date.now()/10000)*10000;
  const settings={scope:scope+"-window",limits:[{key:"device",seconds:10,limit:1}]};
  await consumeCreationBudget("device",{...settings,now:start+1000});
  await assert.rejects(consumeCreationBudget("device",{...settings,now:start+9000}), (error:unknown)=>error instanceof CreationLimitError&&error.retryAfter===1);
  await consumeCreationBudget("device",{...settings,now:start+10000});
});
