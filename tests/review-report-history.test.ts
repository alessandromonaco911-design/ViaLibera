import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sanitizeTimestamp, datedReportPath, latestReportPath, legacyReportPath, persistReportHistory } from "../scripts/review/report-history";

let tmp: string;
let realCwd: string;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), "report-history-test-"));
  realCwd = process.cwd();
  // re-home process.cwd() to the temp dir by creating a fake data/reports tree
  await mkdir(join(tmp, "data", "reports"), { recursive: true });
  // report-history uses process.cwd() — emulate by overriding via env-free monkey patch
  // (the module reads process.cwd() at call time, so we temporarily chdir)
  process.chdir(tmp);
});

after(async () => {
  process.chdir(realCwd);
  await rm(tmp, { recursive: true, force: true });
});

test("report-history: percorsi coerenti", () => {
  assert.equal(sanitizeTimestamp("2026-07-31T15:43:57.608Z"), "2026-07-31T15-43-57-608Z");
  assert.ok(
    datedReportPath("ab-2025-04-23", "2026-07-31T15:43:57.608Z").endsWith(
      join("external-ai-review-import-ab-2025-04-23", "2026-07-31T15-43-57-608Z.json"),
    ),
  );
  assert.ok(latestReportPath("ab-2025-04-23").endsWith("latest.json"));
  assert.ok(legacyReportPath("ab-2025-04-23").endsWith("external-ai-review-import-ab-2025-04-23.json"));
});

test("report-history: persiste latest + datato e migra il report legacy esistente", async () => {
  // legacy single file (first import run, already on disk)
  const legacy = legacyReportPath("ab-2025-04-23");
  await writeFile(legacy, JSON.stringify({ importedAt: "2026-07-31T10:00:00.000Z", inserted: { assets: 74, figureCases: 2 } }), "utf-8");

  const report = { importedAt: "2026-07-31T15:43:57.608Z", catalogId: "ab-2025-04-23", inserted: { assets: 0, figureCases: 0 }, unchanged: { assets: 74, figureCases: 2 } };
  const { latest, dated, migratedLegacy } = await persistReportHistory("ab-2025-04-23", report);

  assert.ok(migratedLegacy, "il report legacy deve essere migrato");
  assert.equal(JSON.parse(await readFile(migratedLegacy!, "utf-8")).inserted.assets, 74, "il primo import è preservato nella cronologia");
  assert.equal(JSON.parse(await readFile(latest, "utf-8")).inserted.assets, 0);
  assert.equal(JSON.parse(await readFile(dated, "utf-8")).unchanged.assets, 74);

  const dir = join(tmp, "data", "reports", "external-ai-review-import-ab-2025-04-23");
  const files = await readdir(dir);
  assert.ok(files.includes("latest.json"));
  assert.ok(files.some((f) => f.includes("2026-07-31T10-00-00"))); // cronologia del primo import
  assert.ok(files.some((f) => f.includes("2026-07-31T15-43-57"))); // run corrente
});

test("report-history: seconda esecuzione non sovrascrive la cronologia e genera nome unico", async () => {
  const report = { importedAt: "2026-07-31T16:00:00.000Z", catalogId: "ab-2025-04-23", inserted: { assets: 0, figureCases: 0 } };
  const r1 = await persistReportHistory("ab-2025-04-23", report);
  const r2 = await persistReportHistory("ab-2025-04-23", report);
  assert.notEqual(r1.dated, r2.dated, "ogni run applicativo genera un report datato distinto");
  assert.equal(JSON.parse(await readFile(r1.dated, "utf-8")).importedAt, report.importedAt);
  assert.equal(JSON.parse(await readFile(r2.dated, "utf-8")).importedAt, report.importedAt);
});

test("report-history: decisioni già importate non vengono modificate (solo report)", async () => {
  const { latest } = await persistReportHistory("ab-2025-04-23", { importedAt: "2026-07-31T17:00:00.000Z", catalogId: "ab-2025-04-23" });
  const content = await readFile(latest, "utf-8");
  assert.ok(content.includes("17:00:00.000Z"));
  // il modulo non tocca data/reviews
  assert.ok(!existsSync(join(tmp, "data", "reviews", "reviews.json")));
});
