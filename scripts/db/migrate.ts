import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "../../src/lib/db";

async function main() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
