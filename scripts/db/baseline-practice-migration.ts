import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sql } from "../../src/lib/db";

/** Repair only the known db:push drift: never mark an unverified migration as applied. */
async function main() {
  const apply = process.argv.includes("--apply");
  const text = await readFile("drizzle/0006_modern_bloodstorm.sql", "utf8");
  const hash = createHash("sha256").update(text).digest("hex");
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(726061)`;
    const recorded = await tx`select hash from drizzle.__drizzle_migrations where created_at=1785532016811`;
    if (recorded.length) { if (recorded[0].hash !== hash) throw new Error("Migration hash differs; aborting."); console.log("Migration 0006 already recorded."); return; }
    const columns = await tx`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('exam_sessions','exam_session_questions')`;
    const expected = [
      ["exam_session_questions","answer_verified","boolean"], ["exam_session_questions","verified_at","timestamp with time zone"],
      ["exam_sessions","topic_id","uuid"], ["exam_sessions","source_session_id","uuid"], ["exam_sessions","feedback_mode","text"],
      ["exam_sessions","requested_question_count","integer"], ["exam_sessions","practice_status","text"],
    ];
    for (const [table, column, type] of expected) if (!columns.some(c=>c.table_name===table && c.column_name===column && c.data_type===type && c.is_nullable==='YES' && c.column_default===null)) throw new Error(`Schema mismatch: ${table}.${column}`);
    const constraints = await tx`select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.exam_sessions'::regclass`;
    for (const [name, definition] of [
      ["exam_sessions_topic_id_topics_id_fk", "FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL"],
      ["exam_sessions_source_session_id_exam_sessions_id_fk", "FOREIGN KEY (source_session_id) REFERENCES exam_sessions(id) ON DELETE SET NULL"],
    ]) if (!constraints.some(c=>c.conname===name && c.definition===definition)) throw new Error(`Constraint mismatch: ${name}`);
    const indexes = await tx`select indexname,indexdef from pg_indexes where schemaname='public' and tablename='exam_sessions'`;
    for (const [name, column] of [["exam_sessions_topic_idx","topic_id"],["exam_sessions_mode_idx","mode"]]) if (!indexes.some(i=>i.indexname===name && i.indexdef===`CREATE INDEX ${name} ON public.exam_sessions USING btree (${column})`)) throw new Error(`Index mismatch: ${name}`);
    if (apply) await tx`insert into drizzle.__drizzle_migrations (hash,created_at) values (${hash},1785532016811)`;
    console.log(`Migration 0006: exact schema verified; ${apply ? "journal repaired" : "dry-run, no changes"}.`);
  });
  await sql.end();
}
main().catch(async () => { console.error("Migration baseline refused; inspect schema before proceeding."); await sql.end(); process.exitCode=1; });
