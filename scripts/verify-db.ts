import { db, sql } from "../src/lib/db";
import { sourceFiles, questionCatalogVersions, topics, questions } from "../src/lib/db/schema";
import { sql as dsql } from "drizzle-orm";

async function main() {
  const idx = await sql`select indexname from pg_indexes where tablename = 'questions'`;
  console.log("questions indexes:", idx.map((r) => (r as { indexname: string }).indexname).join(", "));
  const ver = await sql`select id from drizzle.__drizzle_migrations order by created_at desc limit 4`;
  console.log("applied migrations:", ver.map((v) => (v as { id: string }).id).join(", "));
  const sf = await db.select().from(sourceFiles);
  console.log("source_files rows:", sf.map((s) => `${s.originalFilename} ${s.sha256.slice(0, 8)}`).join(" | "));
  const cats = await db.select().from(questionCatalogVersions);
  console.log("catalogs:", JSON.stringify(cats.map((c) => ({ cat: c.licenseCategory, ver: c.versionCode, status: c.status }))));
  const tps = await db.select().from(topics);
  console.log("topics:", tps.map((t) => t.code).join(","));
  const q = await db.select({ c: dsql<number>`count(*)` }).from(questions);
  console.log("questions count:", q[0].c);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
