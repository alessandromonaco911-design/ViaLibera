import { existsSync } from "node:fs";
import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { extractPdfData } from "./lib/pdf";
import { contentHash } from "./lib/hashes";
import { parsePositional } from "./lib/position-parser";
import { mapImagesToQuestions, bboxWithinPage } from "./lib/mapping";
import { verifyAsset, pngIsValid } from "./lib/verification";
import { OFFICIAL_SOURCES } from "./sources";
import type { VerificationStatus } from "./lib/types";

interface MediaEntry {
  hash: string;
  mime: string;
  ext: string;
  width: number;
  height: number;
  questions: string[];
  verificationStatus: VerificationStatus;
  verificationMethod: string;
  minConfidence: number;
  pageFirstSeen: number;
}

async function main() {
  const srcId = process.argv[2] ?? "pda-2025-ab-it";
  const src = OFFICIAL_SOURCES.find((s) => s.id === srcId);
  if (!src) throw new Error(`unknown source ${srcId}`);
  const pdfPath = join(process.cwd(), "data", "official", src.localFilename);
  if (!existsSync(pdfPath)) {
    console.error(`Missing ${pdfPath}. Run: npm run data:download && npm run data:audit`);
    process.exit(1);
  }

  console.log(`Parsing ${pdfPath} ...`);
  const started = Date.now();
  const catalogId = srcId === "pda-2025-ab-it" ? "ab-2025-04-23" : srcId;
  const cacheDir = join(process.cwd(), "data", "processed", ".cache", catalogId);
  const pdf = await extractPdfData(pdfPath, cacheDir);
  console.log(`Extracted ${pdf.numPages} pages in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // --- text + image parsing (position-based, pure) ---
  const parsed = parsePositional(pdf.textItems, pdf.numberCells);
  const { questions, groups, unrecognized } = parsed;
  questions.sort((a, b) => a.page - b.page || a.sourceLineStart - b.sourceLineStart);

  // --- image mapping (pure geometry) ---
  const mapping = mapImagesToQuestions(questions, pdf.images, pdf.numberCells);

  // --- content hashes ---
  for (const q of questions) {
    q.contentHash = contentHash(q.statement, q.correctAnswer, q.imageRef);
  }

  const uniqueGroups = new Map<string, (typeof groups)[number]>();
  for (const g of groups) uniqueGroups.set(g.code, g);
  const topics = new Map<string, string>();
  for (const g of uniqueGroups.values()) topics.set(g.topic, g.code);

  // --- media registry with verification statuses ---
  const pageDims = new Map(pdf.pageDims.map((d) => [d.page, d]));
  const media = new Map<string, MediaEntry>();
  for (const q of questions) {
    if (!q.imageRef) continue;
    const im = pdf.images.find((i) => i.hash === q.imageRef && i.page === q.page);
    if (!im) continue;
    let m = media.get(q.imageRef);
    if (!m) {
      m = {
        hash: q.imageRef,
        mime: im.mime,
        ext: mimeToExt(im.mime) ?? "bin",
        width: im.width,
        height: im.height,
        questions: [],
        verificationStatus: "extracted",
        verificationMethod: "pipeline:auto",
        minConfidence: 1,
        pageFirstSeen: q.page,
      };
      media.set(q.imageRef, m);
    }
    if (!m.questions.includes(q.questionNumber)) m.questions.push(q.questionNumber);
    if (q.structuralConfidence !== null && q.structuralConfidence < m.minConfidence) {
      m.minConfidence = q.structuralConfidence;
    }
  }

  // per-asset automated verification
  const dimsOf = (hash: string, page: number) => pageDims.get(page);
  for (const m of media.values()) {
    const im = pdf.images.find((i) => i.hash === m.hash && i.page === m.pageFirstSeen);
    const assocQuestions = questions.filter((q) => q.imageRef === m.hash);
    const allInPage = assocQuestions.every((q) => {
      if (!q.imageBBox) return false;
      return bboxWithinPage(q.imageBBox, dimsOf(m.hash, q.imageBBox.page));
    });
    const decision = verifyAsset({
      hash: m.hash,
      pngValid: im ? pngIsValid(im.data).valid : false,
      officialSource: true,
      mapped: m.questions.length > 0,
      noAmbiguous: mapping.ambiguous.filter((a) => {
        const q = questions.find((x) => x.questionNumber === a.questionNumber);
        return q?.imageRef === m.hash;
      }).length === 0,
      minConfidence: m.minConfidence,
      bboxWithinPage: allInPage,
      filePresent: im !== undefined,
    });
    m.verificationStatus = decision.status;
    m.verificationMethod = decision.method;
  }

  // --- write outputs ---
  const outDir = join(process.cwd(), "data", "processed", catalogId);
  const mediaDir = join(process.cwd(), "data", "media", catalogId);
  const reportDir = join(process.cwd(), "data", "reports");
  await rm(outDir, { recursive: true, force: true });
  await rm(mediaDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(mediaDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });

  const ql = join(outDir, "questions.jsonl");
  await rm(ql, { force: true });
  for (const q of questions) {
    await appendFile(ql, JSON.stringify(q) + "\n", "utf-8");
  }
  await writeFile(join(outDir, "groups.json"), JSON.stringify([...uniqueGroups.values()], null, 2), "utf-8");
  await writeFile(
    join(outDir, "topics.json"),
    JSON.stringify([...topics.entries()].map(([name, code]) => ({ code, name })), null, 2),
    "utf-8",
  );
  await writeFile(join(outDir, "media.json"), JSON.stringify([...media.values()], null, 2), "utf-8");

  let written = 0;
  for (const m of media.values()) {
    const im = pdf.images.find((i) => i.hash === m.hash);
    if (!im) continue;
    await writeFile(join(mediaDir, `${m.hash}.${m.ext}`), im.data);
    written++;
  }

  // --- report ---
  const vero = questions.filter((q) => q.correctAnswer).length;
  const falso = questions.length - vero;
  const imageQuestions = questions.filter((q) => q.imageRef).length;
  const duplicateCodes = [...questions.reduce((m, q) => m.set(q.questionNumber, (m.get(q.questionNumber) ?? 0) + 1), new Map<string, number>())].filter(([, c]) => c > 1);
  const duplicateHashes = [...questions.reduce((m, q) => m.set(q.contentHash, (m.get(q.contentHash) ?? 0) + 1), new Map<string, number>())].filter(([, c]) => c > 1);
  const malformedGroups = [...groups.reduce((m, g) => m.set(g.code, (m.get(g.code) ?? 0) + 1), new Map<string, number>())].filter(([, c]) => c > 1);
  const statusCounts = new Map<VerificationStatus, number>();
  for (const m of media.values()) statusCounts.set(m.verificationStatus, (statusCounts.get(m.verificationStatus) ?? 0) + 1);

  const report = {
    source: { id: src.id, filename: src.localFilename },
    catalogId,
    encoding: "PDF text layer estratta come Unicode (UTF-8); file PDF 1.4 con stream compressi FlateDecode",
    totalLines: Math.max(...questions.map((q) => q.sourceLineEnd), 0),
    pages: pdf.numPages,
    groups: uniqueGroups.size,
    topics: topics.size,
    questions: questions.length,
    vero,
    falso,
    questionsWithImage: imageQuestions,
    questionsWithoutImage: questions.length - imageQuestions,
    uniqueImages: media.size,
    matchedRows: mapping.matched,
    ambiguousRows: mapping.ambiguous,
    unrecognizedLines: unrecognized.length,
    duplicateQuestionCodes: duplicateCodes,
    duplicateContentHashes: duplicateHashes,
    repeatedGroupHeaders: malformedGroups,
    mediaVerification: Object.fromEntries(statusCounts),
    parseSuccessRate: questions.length / (questions.length + unrecognized.length),
    examples: questions.slice(0, 3).map((q) => ({
      n: q.questionNumber,
      group: q.groupCode,
      topic: q.topic,
      text: q.statement.slice(0, 80),
      answer: q.correctAnswer ? "VERO" : "FALSO",
      image: q.imageRef?.slice(0, 12) ?? null,
      confidence: q.structuralConfidence,
    })),
    errors: [] as string[],
    warnings: [] as string[],
  };

  if (unrecognized.length) report.warnings.push(`${unrecognized.length} righe non riconosciute (vedi data/rejected/)`);
  if (duplicateCodes.length) report.errors.push(`${duplicateCodes.length} codici domanda duplicati`);
  if (duplicateHashes.length) report.warnings.push(`${duplicateHashes.length} contenuti duplicati (stesso testo+risposta+immagine)`);
  if (mapping.ambiguous.length) report.warnings.push(`${mapping.ambiguous.length} righe con candidati immagine ambigui`);

  await writeFile(join(reportDir, `parse-${catalogId}.json`), JSON.stringify(report, null, 2), "utf-8");

  // --- per-image verification report (corrected model) ---
  const imageReport = {
    catalogId,
    source: { id: src.id, filename: src.localFilename, url: src.downloadUrl },
    methodology:
      "Immagini incorporate nel PDF ufficiale, una per riga-domanda. Ogni riferimento è mappato alla domanda tramite " +
      "overlap spaziale (banda di riga vs range immagine) con confidence strutturale riproducibile. " +
      "Nessuna immagine è marked visually_verified senza un'azione umana esplicita nella galleria di revisione. " +
      "Stati: extracted | structurally_verified | visually_verified | ambiguous | missing | rejected.",
    confidenceScale:
      "0..1 = overlapRatio * ambiguityFactor (vedi scripts/data/lib/mapping.ts). Soglia structurally_verified: 0.5.",
    images: [...media.values()]
      .map((m) => ({
        code: m.questions[0],
        officialImageCode: null,
        questionCount: m.questions.length,
        source: src.downloadUrl,
        filename: `${m.hash}.${m.ext}`,
        localPath: `data/media/${catalogId}/${m.hash}.${m.ext}`,
        sha256: m.hash,
        width: m.width,
        height: m.height,
        status: m.verificationStatus,
        verificationMethod: m.verificationMethod,
        minConfidence: m.minConfidence,
        notes: "Verifica visiva manuale non ancora eseguita (visual verification richiede azione umana in galleria)",
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    summary: {
      totalQuestions: questions.length,
      questionsWithImage: imageQuestions,
      questionsWithoutImage: questions.length - imageQuestions,
      uniqueImages: media.size,
      extracted: statusCounts.get("extracted") ?? 0,
      structurallyVerified: statusCounts.get("structurally_verified") ?? 0,
      visuallyVerified: statusCounts.get("visually_verified") ?? 0,
      ambiguous: statusCounts.get("ambiguous") ?? 0,
      missing: statusCounts.get("missing") ?? 0,
      rejected: statusCounts.get("rejected") ?? 0,
    },
  };
  await writeFile(join(reportDir, `images-${catalogId}.json`), JSON.stringify(imageReport, null, 2), "utf-8");

  if (unrecognized.length) {
    const rejectedDir = join(process.cwd(), "data", "rejected");
    await mkdir(rejectedDir, { recursive: true });
    await writeFile(join(rejectedDir, `rejected-${catalogId}.jsonl`), unrecognized.map((u) => JSON.stringify(u)).join("\n"), "utf-8");
  }

  console.log("\n=== PARSE REPORT ===");
  console.log(`groups: ${uniqueGroups.size} | topics: ${topics.size}`);
  console.log(`questions: ${questions.length} (VERO=${vero}, FALSO=${falso})`);
  console.log(`questions with image: ${imageQuestions} | without: ${questions.length - imageQuestions}`);
  console.log(`unique images: ${media.size} (written ${written} files)`);
  console.log(`image rows matched: ${mapping.matched} | ambiguous: ${mapping.ambiguous.length}`);
  console.log(`media verification: ${Object.entries(Object.fromEntries(statusCounts)).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`unrecognized lines: ${unrecognized.length} | parse success: ${(report.parseSuccessRate * 100).toFixed(2)}%`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

function mimeToExt(mime: string): string | null {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("bmp")) return "bmp";
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
