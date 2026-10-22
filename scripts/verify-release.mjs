import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join, resolve } from "node:path";
import postgres from "postgres";

// Deliberate allowlist: no env files, notes, PDF downloads, extraction output, or Git metadata.
const root = process.cwd();
const stage = resolve(root, "test-output", `release-${Date.now()}`);
const origin = "http://127.0.0.1:3211";
const owned = [];
let server;
let log = "";
const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const env = { ...process.env, SESSION_CREATION_NAMESPACE: `release-${randomUUID()}` };
function run(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", data=>{ log += data; }); child.stderr.on("data", data=>{ log += data; });
  return child;
}
async function json(path, data) {
  const response = await fetch(origin + path, data === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`Request failed: ${path}, HTTP ${response.status}`);
  const payload = await response.json();
  if (data !== undefined && payload.sessionId && response.status === 201) owned.push(payload.sessionId);
  return payload;
}
async function assets(questions) {
  for (const question of questions) {
    if (!question.image) continue;
    if (!question.image.url.startsWith("/media/questions/")) throw new Error("Non-static question image");
    const response = await fetch(origin + question.image.url);
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Image missing from release");
  }
}
try {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("Release proof requires a local test database");
  try { await fetch(origin); throw new Error("Port 3211 is already occupied"); } catch (error) { if (error.message.includes("occupied")) throw error; }
  await mkdir(stage, { recursive: true });
  for (const name of ["src", "public", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "next-env.d.ts"]) await cp(join(root,name),join(stage,name),{recursive:true});
  await symlink(join(root,"node_modules"),join(stage,"node_modules"),process.platform === "win32" ? "junction" : "dir");
  const refs = await sql`select distinct image_reference from questions where status='imported' and image_reference is not null`;
  const files = await readdir(join(stage,"public/media/questions"));
  for (const {image_reference: hash} of refs) {
    if (!files.includes(`${hash}.png`) || createHash("sha256").update(await readFile(join(stage,"public/media/questions",`${hash}.png`))).digest("hex") !== hash) throw new Error("Referenced public image missing or altered");
  }
  const next = join(root,"node_modules/next/dist/bin/next");
  const build = run([next,"build"],stage);
  if ((await once(build,"exit"))[0] !== 0) throw new Error("Clean source build failed; inspect build.log");
  server = run([next,"start","--hostname","127.0.0.1","--port","3211"],stage);
  let ready = false;
  for (let attempt=0;attempt<100;attempt++) {
    if (server.exitCode !== null) throw new Error("Release server stopped");
    try { const response = await fetch(origin); if(response.ok) {ready=true;break;} } catch {}
    await new Promise(done=>setTimeout(done,250));
  }
  if (!ready) throw new Error("Release server did not start");
  const html = await (await fetch(origin)).text();
  const staticAssets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]+\.(?:css|js)(?:\?[^" ]*)?)"/g)].map(match=>match[1]))];
  if (!staticAssets.length) throw new Error("No CSS or JavaScript found");
  for (const path of staticAssets) if (!(await fetch(new URL(path, origin))).ok) throw new Error("Missing CSS/JavaScript");
  const topics = (await json("/api/practice/topics")).topics;
  const exam = await json("/api/exams",{seed:42}); await assets(exam.questions);
  await json(`/api/exams/${exam.sessionId}/submit`,{version:1,answers:exam.questions.map(q=>({questionId:q.id,selectedAnswer:false})),flagged:[]});
  if (!(await fetch(`${origin}/simulazione/${exam.sessionId}/risultato`)).ok) throw new Error("Exam result unavailable");
  const practice = await json("/api/practice",{topicId:topics.find(topic=>topic.imageCount>0).id,questionCount:10,seed:42});
  const restored = await json(`/api/practice/${practice.sessionId}`); await assets(restored.questions);
  const [solution] = await sql`select correct_answer from questions where id=${practice.questions[0].id}`;
  await json(`/api/practice/${practice.sessionId}/answer`,{questionId:practice.questions[0].id,selectedAnswer:!solution.correct_answer});
  const result = await json(`/api/practice/${practice.sessionId}/complete`,{}); await assets(result.answers);
  const mistakes = await json("/api/practice/mistakes",{sourceSessionId:practice.sessionId,seed:42}); await assets(mistakes.questions);
  const legacy = refs[0].image_reference;
  const compatibility = await fetch(`${origin}/api/media/${legacy}`);
  if (!compatibility.ok || !compatibility.url.includes("/media/questions/")) throw new Error("Legacy media compatibility failed");
  const proof = { passed:true, stage, publicImages:refs.length, staticAssets:staticAssets.length, checked:["build from source allowlist", "runtime without data or env files", "homepage CSS/JS", "exam and result", "practice, resume, answer and result images", "mistakes review", "legacy media URL"] };
  await writeFile(join(stage,"proof.json"),JSON.stringify(proof,null,2));
  console.log(JSON.stringify(proof,null,2));
} catch(error) { console.error(error.message); process.exitCode=1; }
finally {
  if(server && server.exitCode===null && server.signalCode===null) { const stopped=once(server,"exit");server.kill();await stopped; }
  if(owned.length) {
    await sql`delete from exam_session_questions where session_id in ${sql(owned)}`;
    await sql`delete from exam_sessions where id in ${sql(owned)}`;
  }
  await sql.end();
  await mkdir(stage,{recursive:true}); await writeFile(join(stage,"build.log"),log);
}
