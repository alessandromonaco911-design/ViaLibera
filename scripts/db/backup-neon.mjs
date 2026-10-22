import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const connection = process.env.DATABASE_URL;
const url = new URL(connection);
if (!url.hostname.endsWith(".neon.tech")) throw new Error("Expected the configured Neon database");
const stamp = new Date().toISOString().replace(/[:.]/g,"-");
const directory = resolve("test-output");
const path = resolve(directory,`neon-before-update-${stamp}.dump`);
const sql = postgres(connection,{max:1,connect_timeout:15});
const childEnv = { ...process.env, PGHOST:url.hostname.replace(/-pooler\./,"."), PGPORT:url.port||"5432",
  PGDATABASE:decodeURIComponent(url.pathname.slice(1)), PGUSER:decodeURIComponent(url.username),
  PGPASSWORD:decodeURIComponent(url.password), PGSSLMODE:"require", PGCONNECT_TIMEOUT:"20" };
const mount = `type=bind,source=${directory},target=/backup`;
let restoreContainer;
function docker(args,env=childEnv) {
  const result=spawnSync("docker",args,{env,windowsHide:true,encoding:"utf8",maxBuffer:4*1024*1024});
  if(result.status!==0) throw new Error(`Docker backup/restore step failed (exit ${result.status}); no remote writes performed`);
  return result.stdout.trim();
}
const fingerprint = `select json_build_object(
  'sessions',(select count(*) from public.exam_sessions),
  'sessionRows',(select count(*) from public.exam_session_questions),
  'sessionHash',(select md5(coalesce(string_agg(row_to_json(s)::text,chr(10) order by s.id),'')) from public.exam_sessions s),
  'rowHash',(select md5(coalesce(string_agg(row_to_json(q)::text,chr(10) order by q.id),'')) from public.exam_session_questions q)
) as state`;
try {
  await mkdir(directory,{recursive:true});
  const before=await sql.begin("read only",async tx=>{await tx`set local timezone='UTC'`;return (await tx.unsafe(fingerprint))[0].state;});
  docker(["run","--rm","--mount",mount,...["PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD","PGSSLMODE","PGCONNECT_TIMEOUT"].flatMap(key=>["--env",key]),"postgres:18-alpine","pg_dump","-Fc","--no-owner","--no-privileges","--file",`/backup/${basename(path)}`]);
  const toc=docker(["run","--rm","--mount",mount+",readonly","postgres:18-alpine","pg_restore","--list",`/backup/${basename(path)}`]);
  if(!toc.includes("exam_sessions")||!toc.includes("questions"))throw new Error("Backup is missing application tables");
  const restoreEnv={...process.env,POSTGRES_PASSWORD:randomUUID()+randomUUID()};
  restoreContainer=docker(["run","--rm","--detach","--env","POSTGRES_PASSWORD","--mount",mount+",readonly","postgres:18-alpine"],restoreEnv);
  let ready=false;
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
    const probe=spawnSync("docker",["exec",restoreContainer,"pg_isready","-U","postgres"],{windowsHide:true,stdio:"ignore"});
    if(probe.status===0){ready=true;break;}await new Promise(done=>setTimeout(done,250));
  }
  if(!ready){await writeFile(path+".restore-log.txt",docker(["logs",restoreContainer],restoreEnv));throw new Error("Restore test database did not start");}
  docker(["exec",restoreContainer,"pg_restore","--no-owner","--no-privileges","--exit-on-error","--dbname","postgres","--username","postgres",`/backup/${basename(path)}`],restoreEnv);
  const restored=JSON.parse(docker(["exec",restoreContainer,"psql","-U","postgres","-d","postgres","-At","-c",fingerprint],restoreEnv));
  const after=await sql.begin("read only",async tx=>{await tx`set local timezone='UTC'`;return (await tx.unsafe(fingerprint))[0].state;});
  if(JSON.stringify(before)!==JSON.stringify(restored)||JSON.stringify(before)!==JSON.stringify(after))throw new Error("Backup consistency check failed; do not update Neon");
  const report={createdAt:new Date().toISOString(),backup:path,bytes:(await stat(path)).size,sha256:createHash("sha256").update(await readFile(path)).digest("hex"),restoreTestPassed:true,preserved:before};
  await writeFile(path+".json",JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(restoreContainer)docker(["stop","--time","3",restoreContainer]);await sql.end();}
