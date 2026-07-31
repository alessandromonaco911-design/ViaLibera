import { and, count, eq, inArray, lt } from "drizzle-orm";
import { db, sql } from "../../src/lib/db";
import { pathToFileURL } from "node:url";
import { examSessions, examSessionQuestions } from "../../src/lib/db/schema";

/**
 * Manual cleanup of expired, never-submitted anonymous sessions.
 *
 *   npm run db:cleanup-expired-exams -- --older-than-days 30 --dry-run
 *   npm run db:cleanup-expired-exams -- --older-than-days 30 --apply
 *
 * Deletes ONLY sessions that are still 'in_progress' (never submitted) AND
 * expired for more than the threshold. Completed/submitted sessions are never
 * touched. Single transaction, explicit --apply, idempotent. No cron jobs.
 */

export interface ExpiredCleanupResult {
  mode: "dry-run" | "apply";
  olderThanDays: number;
  sessionsFound: number;
  rowsFound: number;
  deletedSessions: number;
  deletedRows: number;
  ok: boolean;
}

export function parseExpiredArgs(argv: string[]): { mode: "dry-run" | "apply"; olderThanDays: number } {
  const flags = new Set<string>();
  let days = 30;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "--apply") flags.add(a.slice(2));
    else if (a.startsWith("--older-than-days=")) days = parseInt(a.slice("--older-than-days=".length), 10);
    else if (a === "--older-than-days") {
      days = parseInt(argv[i + 1] ?? "30", 10);
      i++;
    } else if (a.startsWith("--")) flags.add(a.slice(2));
  }
  if (!Number.isInteger(days) || days < 0) days = 30;
  return { mode: flags.has("apply") ? "apply" : "dry-run", olderThanDays: days };
}

export async function runExpiredExamCleanup(input: { mode: "dry-run" | "apply"; olderThanDays: number }): Promise<ExpiredCleanupResult> {
  const cutoff = new Date(Date.now() - input.olderThanDays * 86_400_000);
  const sessions = await db
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(and(eq(examSessions.status, "in_progress"), lt(examSessions.expiresAt, cutoff)));

  const ids = sessions.map((s) => s.id);
  let rowsFound = 0;
  if (ids.length) {
    const r = await db
      .select({ c: count() })
      .from(examSessionQuestions)
      .where(inArray(examSessionQuestions.sessionId, ids));
    rowsFound = r[0]?.c ?? 0;
  }

  let deletedSessions = 0;
  let deletedRows = 0;
  if (input.mode === "apply" && ids.length) {
    await db.transaction(async (tx) => {
      const r1 = await tx
        .delete(examSessionQuestions)
        .where(inArray(examSessionQuestions.sessionId, ids))
        .returning({ id: examSessionQuestions.id });
      const r2 = await tx
        .delete(examSessions)
        .where(inArray(examSessions.id, ids))
        .returning({ id: examSessions.id });
      deletedRows = r1.length;
      deletedSessions = r2.length;
    });
  }

  return {
    mode: input.mode,
    olderThanDays: input.olderThanDays,
    sessionsFound: sessions.length,
    rowsFound,
    deletedSessions: input.mode === "apply" ? deletedSessions : 0,
    deletedRows: input.mode === "apply" ? deletedRows : 0,
    ok: true,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    process.argv[1].replace(/\\/g, "/").endsWith("scripts/db/cleanup-expired-exams.ts"));

if (isMain) {
  const { mode, olderThanDays } = parseExpiredArgs(process.argv);
  runExpiredExamCleanup({ mode, olderThanDays })
    .then((res) => {
      console.log("\n=== CLEANUP EXPIRED EXAMS ===");
      console.log(`mode: ${res.mode} | soglia: ${res.olderThanDays} giorni`);
      console.log(`sessioni scadute trovate: ${res.sessionsFound} (righe correlate: ${res.rowsFound})`);
      console.log(`eliminate: ${res.deletedSessions} sessioni, ${res.deletedRows} righe`);
      if (res.mode === "dry-run") console.log("DRY-RUN: nessuna modifica applicata.");
      console.log("ok: true");
      return sql.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
