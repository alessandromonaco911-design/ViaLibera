import { db, sql } from "../src/lib/db";

async function main() {
  const idx = await sql`select indexname from pg_indexes where tablename = 'questions'` as { indexname: string }[];
  console.log("questions indexes:", idx.map((r) => r.indexname).join(", "));
  const ver = await sql`select id from drizzle.__drizzle_migrations order by created_at desc limit 4` as { id: string }[];
  console.log("applied migrations:", ver.map((v) => v.id).join(", "));
  const sf = await db.query.sourceFiles.findMany();
  console.log("source_files rows:", sf.map((s) => `${s.originalFilename} ${s.sha256.slice(0, 8)}`).join(" | "));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
