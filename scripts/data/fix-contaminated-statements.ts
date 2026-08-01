import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePositional } from "./lib/position-parser";
import { contentHash } from "./lib/hashes";

/**
 * Contamination fix for official question statements.
 *
 * Background (audit 2026-08, catalog ab-2025-04-23):
 * - 603 statements end with the PDF column header "Testo domanda" (the header
 *   row of a page falls inside the previous question row band);
 * - 25 statements end with "VERO"/"FALSO" (short questions where the answer is
 *   concatenated inside the statement cell of the PDF, x≈77.5).
 *
 * The fix re-runs the (now fixed) position parser against the cached PDF
 * extraction and updates ONLY the affected rows in the processed JSONL,
 * preserving every other field (image mapping, bands, confidence).
 *
 * Usage:
 *   tsx scripts/data/fix-contaminated-statements.ts            # dry-run + report
 *   tsx scripts/data/fix-contaminated-statements.ts --write    # update JSONL (+ .bak)
 *   tsx scripts/data/fix-contaminated-statements.ts --db       # apply the fix to PostgreSQL
 */

const CATALOG = "ab-2025-04-23";
const ROOT = process.cwd();
const CACHE = join(ROOT, "data", "processed", ".cache", CATALOG);
const JSONL = join(ROOT, "data", "processed", CATALOG, "questions.jsonl");
const REPORT_DIR = join(ROOT, "data", "reports");

const flags = new Set(process.argv.slice(2));

interface JsonlRow {
  page: number;
  questionNumber: string;
  groupCode: string;
  topic: string;
  statement: string;
  correctAnswer: boolean;
  imageRef: string | null;
  imageBBox: unknown;
  rowBand: unknown;
  structuralConfidence: number | null;
  sourceLineStart: number;
  sourceLineEnd: number;
  contentHash: string;
  [k: string]: unknown;
}

function loadJsonl(path: string): JsonlRow[] {
  const text = readFileSync(path, "utf8");
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

async function main() {
  const positionsPath = join(CACHE, "positions.json");
  if (!existsSync(positionsPath)) {
    console.error(`Missing ${positionsPath}. Run: npm run data:parse`);
    process.exit(1);
  }
  const pdf = JSON.parse(await readFile(positionsPath, "utf8"));
  const rows = loadJsonl(JSONL);

  // re-run the fixed parser (pure, from cached positions)
  const { questions } = parsePositional(pdf.textItems, pdf.numberCells);
  const byNumber = new Map(questions.map((q) => [q.questionNumber, q]));

  const changes: { questionNumber: string; code?: string; before: string; after: string }[] = [];
  const answerDrift: string[] = [];
  const missing: string[] = [];
  let answerMismatch = 0;

  for (const row of rows) {
    const parsed = byNumber.get(row.questionNumber);
    if (!parsed) {
      missing.push(row.questionNumber);
      continue;
    }
    if (parsed.statement === row.statement) {
      // untouched rows must keep the SAME answer (parser fix never changes it)
      if (parsed.correctAnswer !== row.correctAnswer) {
        answerMismatch++;
        answerDrift.push(row.questionNumber);
      }
      continue;
    }
    if (parsed.correctAnswer !== row.correctAnswer) {
      // the answer would change: refuse (never modify correctAnswer)
      answerMismatch++;
      answerDrift.push(row.questionNumber);
      continue;
    }
    changes.push({ questionNumber: row.questionNumber, before: row.statement, after: parsed.statement });
  }

  console.log("=== REPORT CONTAMINAZIONE ===");
  console.log("righe jsonl:", rows.length);
  console.log("domande parsePositional:", questions.length);
  console.log("righe con statement diversa (candidate fix):", changes.length);
  console.log("righe non trovate nel parse:", missing.length);
  console.log("righe con correctAnswer che cambierebbe (bloccate):", answerMismatch);

  const byType = { header: 0, answer: 0, other: 0 };
  for (const c of changes) {
    if (/Testo domanda/i.test(c.before)) byType.header++;
    else if (/\s(VERO|FALSO)\s*$/i.test(c.before)) byType.answer++;
    else byType.other++;
  }
  console.log("  - terminano con 'Testo domanda':", byType.header);
  console.log("  - terminano con VERO/FALSO:", byType.answer);
  console.log("  - altro:", byType.other);

  for (const c of changes.slice(0, 5)) {
    console.log(`\n  [${c.questionNumber}]\n    prima: ${c.before.slice(0, 140)}\n    dopo : ${c.after.slice(0, 140)}`);
  }

  if (answerMismatch > 0 || byType.other > 0) {
    console.error("\nFIX BLOCCATO: ci sono casi non sicuri. Nessun file modificato.");
    process.exit(1);
  }

  // report file (always written, machine readable)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(REPORT_DIR, `contamination-fix-${stamp}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        catalog: CATALOG,
        generatedAt: stamp,
        totals: { rows: rows.length, changed: changes.length, missing: missing.length },
        changes,
      },
      null,
      2,
    ),
  );
  console.log("\nreport scritto:", reportPath);

  // apply to JSONL
  if (flags.has("--write")) {
    const byNum = new Map(changes.map((c) => [c.questionNumber, c]));
    const out: string[] = [];
    for (const row of rows) {
      const fix = byNum.get(row.questionNumber);
      if (fix) {
        row.statement = fix.after;
        row.contentHash = contentHash(row.statement, row.correctAnswer, row.imageRef ?? null);
      }
      out.push(JSON.stringify(row));
    }
    await copyFile(JSONL, JSONL + ".bak-" + stamp);
    await writeFile(JSONL, out.join("\n") + "\n");
    console.log("jsonl aggiornato (backup:", `questions.jsonl.bak-${stamp})`);
  }

  // apply to DB
  if (flags.has("--db")) {
    const { db } = await import("../../src/lib/db");
    const { questions: questionsTable } = await import("../../src/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    if (changes.length === 0) {
      console.log("db: nessuna modifica da applicare (idempotente).");
    } else {
      await db.transaction(async (tx) => {
        for (const c of changes) {
          const row = rows.find((r) => r.questionNumber === c.questionNumber);
          if (!row) continue;
          const newHash = contentHash(c.after, row.correctAnswer, row.imageRef ?? null);
          await tx
            .update(questionsTable)
            .set({ statement: c.after, contentHash: newHash })
            .where(
              and(
                eq(questionsTable.officialQuestionCode, c.questionNumber),
                eq(questionsTable.status, "imported"),
                eq(questionsTable.correctAnswer, row.correctAnswer),
              ),
            );
        }
      });
      console.log("db: applicate", changes.length, "correzioni (statement + content_hash, correct_answer invariato).");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
