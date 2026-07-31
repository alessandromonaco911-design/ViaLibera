import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://scuolaguida:dev_only_change_me@localhost:5433/scuolaguida",
  },
  verbose: true,
  strict: true,
});
