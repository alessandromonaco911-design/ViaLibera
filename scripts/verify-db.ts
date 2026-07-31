import { db, sql } from "../src/lib/db";
import { questionCatalogVersions, topics } from "../src/lib/db/schema";

async function main() {
  const cats = await db.select().from(questionCatalogVersions);
  const tps = await db.select().from(topics);
  console.log(
    "catalogs:",
    JSON.stringify(cats.map((c) => ({ cat: c.licenseCategory, ver: c.versionCode, status: c.status }))),
  );
  console.log("topics:", tps.map((t) => t.code).join(","));
  console.log("simple query 1+1 =", await sql`select 1 + 1 as sum`.then((r) => r[0].sum));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
