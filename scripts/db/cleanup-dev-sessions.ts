import { count, inArray } from "drizzle-orm";
import { db, sql } from "../../src/lib/db";
import { pathToFileURL } from "node:url";
import { examSessions, examSessionQuestions } from "../../src/lib/db/schema";

/**
 * Safe cleanup of development/test exam sessions.
 *
 *   npm run db:cleanup-dev-sessions -- --dry-run
 *   npm run db:cleanup-dev-sessions -- --apply
 *   npm run db:cleanup-dev-sessions -- --environments test --apply
 *
 * Acts ONLY on sessions explicitly tagged environment IN (development, test).
 * Normal (production) sessions are never touched. Single transaction with
 * full rollback; idempotent; explicit --apply required.
 */

export interface CleanupResult {
  mode: "dry-run" | "apply";
  environments: string[];
  sessionsFound: number;
  rowsFound: number;
  deletedSessions: number;
  deletedRows: number;
  ok: boolean;
}

export function parseCleanupArgs(argv: string[]): { mode: "dry-run" | "apply"; environments: string[] } {
  const flags = new Set<string>();
  let envs = ["development", "test"];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "--apply") flags.add(a.slice(2));
    else if (a.startsWith("--environments=")) {
      envs = a.slice("--environments=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--environments") {
      envs = argv[i + 1]?.split(",").map((s) => s.trim()).filter(Boolean) ?? envs;
      i++;
    } else if (a.startsWith("--")) flags.add(a.slice(2));
  }
  return { mode: flags.has("apply") ? "apply" : "dry-run", environments: envs.length ? envs : ["development", "test"] };
}

export async function runDevSessionCleanup(input: {
  mode: "dry-run" | "apply";
  environments: string[];
}): Promise<CleanupResult> {
  const sessions = await db
    .select({ id: examSessions.id, environment: examSessions.environment })
    .from(examSessions)
    .where(inArray(examSessions.environment, input.environments));

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
    environments: input.environments,
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
    process.argv[1].replace(/\\/g, "/").endsWith("scripts/db/cleanup-dev-sessions.ts"));

if (isMain) {
  const { mode, environments } = parseCleanupArgs(process.argv);
  runDevSessionCleanup({ mode, environments })
    .then((res) => {
      console.log("\n=== CLEANUP DEV SESSIONS ===");
      console.log(`mode: ${res.mode}`);
      console.log(`environments: ${res.environments.join(", ")}`);
      console.log(`sessioni trovate: ${res.sessionsFound} (righe correlate: ${res.rowsFound})`);
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
