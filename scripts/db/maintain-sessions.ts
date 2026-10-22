import { pathToFileURL } from "node:url";
import { sql } from "../../src/lib/db";

export interface MaintenanceInput { mode: "dry-run" | "apply"; environment: string; now?: Date; batchSize?: number }

/** Completed results and source sessions stay intact. No catalogue records are ever deleted. */
export async function maintainSessions({ mode, environment, now = new Date(), batchSize = 500 }: MaintenanceInput) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("batchSize must be 1..1000");
  const emptyCutoff = new Date(now.getTime() - 7 * 86400_000);
  const activeCutoff = new Date(now.getTime() - 90 * 86400_000);
  for (let attempt = 0; ; attempt++) try {
  return await sql.begin(async tx => {
    if (mode === "apply") {
      // Small bounded maintenance batch. Refuse a busy database instead of racing a submission.
      await tx`set local lock_timeout = '2s'`;
      await tx`lock table exam_sessions, exam_session_questions in share row exclusive mode nowait`;
    }
    const candidates = await tx`select s.id,
      (select count(*)::int from exam_session_questions q where q.session_id=s.id) as rows
      from exam_sessions s where s.environment=${environment}
      and s.status in ('in_progress','expired','abandoned')
      and s.submitted_at is null and s.completed_at is null
      and (s.practice_status is null or s.practice_status <> 'completed')
      and (s.mode in ('practice','mistakes') or (s.mode='simulation' and s.expires_at < ${now.toISOString()}))
      and not exists (select 1 from exam_sessions child where child.source_session_id=s.id)
      and greatest(s.started_at,s.updated_at,coalesce((select max(greatest(q.updated_at,q.answered_at,q.verified_at)) from exam_session_questions q where q.session_id=s.id),s.started_at))
        < case when exists (select 1 from exam_session_questions q where q.session_id=s.id and (q.selected_answer is not null or q.answer_verified=true)) then ${activeCutoff.toISOString()}::timestamptz else ${emptyCutoff.toISOString()}::timestamptz end
      order by s.started_at,s.id limit ${batchSize}`;
    const ids = candidates.map(row=>row.id as string);
    const limits = await tx`select count(*)::int as n from session_creation_limits where expires_at < ${now.toISOString()}`;
    let deleted = 0;
    if (mode === "apply") {
      if (ids.length) deleted = (await tx`delete from exam_sessions where id in ${sql(ids)} returning id`).length;
      await tx`delete from session_creation_limits where expires_at < ${now.toISOString()}`;
    }
    return { mode, environment, emptyDays: 7, inactiveDays: 90, batchSize, sessionsFound: ids.length,
      rowsFound: candidates.reduce((sum,row)=>sum+Number(row.rows),0), expiredBudgets: limits[0].n, deletedSessions: deleted };
  });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (mode !== "apply" || attempt >= 4 || !["40P01", "55P03"].includes(String(code))) throw error;
    await new Promise(done=>setTimeout(done, 50 * 2 ** attempt));
  }
}

export function parseMaintenanceArgs(args: string[]) {
  const allowed = ["--dry-run","--apply","--environment=production","--environment=development","--environment=test"];
  if (args.some(arg=>!allowed.includes(arg)) || args.includes("--apply") && args.includes("--dry-run")) throw new Error("Use --dry-run or --apply and --environment=production|development|test");
  const environments = args.filter(arg=>arg.startsWith("--environment="));
  if(environments.length>1) throw new Error("Choose one environment");
  return { mode: args.includes("--apply") ? "apply" as const : "dry-run" as const, environment: environments[0]?.split("=")[1] ?? "production" };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.resolve().then(()=>maintainSessions(parseMaintenanceArgs(process.argv.slice(2))))
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(()=>{console.error("Maintenance failed; transaction rolled back. Check database availability and locks.");process.exitCode=1;})
    .finally(()=>sql.end());
}
