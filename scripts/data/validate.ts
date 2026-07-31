import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const CATALOG_ID = process.argv[2] ?? "ab-2025-04-23";

const questionSchema = z.object({
  page: z.number().int().positive(),
  questionNumber: z.string().regex(/^\d{4,7}$/),
  groupCode: z.string().regex(/^\d+$/),
  topic: z.string().min(1),
  statement: z.string().min(1),
  correctAnswer: z.boolean(),
  imageRef: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  sourceLineStart: z.number().int().positive(),
  sourceLineEnd: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

async function main() {
  const ROOT = process.cwd();
  const processedDir = join(ROOT, "data", "processed", CATALOG_ID);
  if (!existsSync(processedDir)) {
    console.error(`No processed output at ${processedDir}. Run: npm run data:parse`);
    process.exit(1);
  }

  const qlPath = join(processedDir, "questions.jsonl");
  const groups = JSON.parse(await readFile(join(processedDir, "groups.json"), "utf-8")) as { code: string; topic: string }[];
  const topics = JSON.parse(await readFile(join(processedDir, "topics.json"), "utf-8")) as { code: string; name: string }[];
  const media = JSON.parse(await readFile(join(processedDir, "media.json"), "utf-8")) as { hash: string; questions: string[] }[];

  const lines = (await readFile(qlPath, "utf-8")).split("\n").filter(Boolean);
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenNumbers = new Set<string>();
  const mediaHashes = new Set(media.map((m) => m.hash));
  const groupCodes = new Set(groups.map((g) => g.code));
  let parsed = 0;
  const withImageRef = new Set<string>();
  const { contentHash } = await import("./lib/hashes");

  for (let i = 0; i < lines.length; i++) {
    let raw: unknown;
    try {
      raw = JSON.parse(lines[i]);
    } catch {
      errors.push(`line ${i + 1}: invalid JSON`);
      continue;
    }
    const res = questionSchema.safeParse(raw);
    if (!res.success) {
      errors.push(`line ${i + 1}: schema violation: ${res.error.issues.map((x) => x.path.join(".") + " " + x.message).join("; ")}`);
      continue;
    }
    parsed++;
    const q = res.data;
    if (q.imageRef) withImageRef.add(q.questionNumber);
    if (seenNumbers.has(q.questionNumber)) errors.push(`duplicate question number ${q.questionNumber}`);
    seenNumbers.add(q.questionNumber);
    if (!groupCodes.has(q.groupCode)) errors.push(`question ${q.questionNumber}: unknown groupCode ${q.groupCode}`);
    if (q.imageRef && !mediaHashes.has(q.imageRef)) errors.push(`question ${q.questionNumber}: imageRef not in media registry`);
    if (q.sourceLineEnd < q.sourceLineStart) errors.push(`question ${q.questionNumber}: bad line range`);
    const recomputed = contentHash(q.statement, q.correctAnswer, q.imageRef);
    if (recomputed !== q.contentHash) errors.push(`question ${q.questionNumber}: contentHash mismatch`);
  }

  // media registry checks
  const mediaQuestions = new Set<string>();
  for (const m of media) {
    for (const n of m.questions) mediaQuestions.add(n);
    const ext = await detectExt(m.hash);
    if (!(await fileExists(join(ROOT, "data", "media", CATALOG_ID, `${m.hash}.${ext}`)))) {
      warnings.push(`media ${m.hash.slice(0, 12)}… file missing in data/media`);
    }
  }
  const orphans = [...mediaQuestions].filter((n) => !withImageRef.has(n));

  // topic references
  const topicNames = new Set(topics.map((t) => t.name));
  for (const g of groups) {
    if (!topicNames.has(g.topic)) warnings.push(`group ${g.code}: topic not in topics.json`);
  }

  const report = {
    catalogId: CATALOG_ID,
    input: {
      questionsJsonl: qlPath,
      lines: lines.length,
      parsed: parsed,
    },
    groups: groups.length,
    topics: topics.length,
    mediaAssets: media.length,
    checks: {
      uniqueQuestionNumbers: seenNumbers.size,
      questionsReferencingMedia: withImageRef.size,
      orphanMediaReferences: orphans.length,
    },
    errors: errors.length,
    warnings: warnings.length,
    errorSamples: errors.slice(0, 10),
    warningSamples: warnings.slice(0, 10),
    passed: errors.length === 0,
  };

  const reportDir = join(ROOT, "data", "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, `validate-${CATALOG_ID}.json`), JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== VALIDATION REPORT ===");
  console.log(`lines: ${lines.length} | parsed: ${parsed}`);
  console.log(`groups: ${groups.length} | topics: ${topics.length} | media assets: ${media.length}`);
  console.log(`unique question numbers: ${seenNumbers.size}`);
  console.log(`errors: ${errors.length} | warnings: ${warnings.length}`);
  for (const e of errors.slice(0, 8)) console.log("  ERR:", e);
  for (const w of warnings.slice(0, 8)) console.log("  WARN:", w);
  console.log(`RESULT: ${report.passed ? "PASS" : "FAIL"}`);
  console.log("Report:", join(reportDir, `validate-${CATALOG_ID}.json`));
  process.exitCode = report.passed ? 0 : 1;
}

async function detectExt(hash: string): Promise<string> {
  const ROOT = process.cwd();
  const dir = join(ROOT, "data", "media", CATALOG_ID);
  try {
    const files = await readdir(dir);
    const hit = files.find((f) => f.startsWith(hash));
    return hit ? hit.split(".").pop() ?? "bin" : "bin";
  } catch {
    return "bin";
  }
}

async function fileExists(p: string): Promise<boolean> {
  return existsSync(p);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
