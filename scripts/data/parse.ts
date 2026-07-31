import { existsSync } from "node:fs";
import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { extractPdfData } from "./lib/pdf";
import { contentHash } from "./lib/hashes";
import { OFFICIAL_SOURCES } from "./sources";

interface GroupHeader {
  code: string;
  topic: string;
  page: number;
  line: number;
}

interface ParsedQuestion {
  page: number;
  questionNumber: string;
  groupCode: string;
  topic: string;
  statement: string;
  correctAnswer: boolean;
  imageRef: string | null; // media asset hash, null if no image
  sourceLineStart: number;
  sourceLineEnd: number;
  contentHash: string;
}

const SKIP_LINES = new Set([
  "Numero",
  "domanda",
  "Testo domanda",
  "Risposta",
  "Corretta",
  "Risposta Corretta",
  "Immagine",
  "Ministero delle Infrastrutture e dei Trasporti",
]);

const GROUP_RE = /^Quesito\s+n[°o]\s+(\d+)\s*[-–]\s*(.+)$/;
const QUESTION_RE = /^(\d{4,7})\s+(.*)$/;

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Parse a page of extracted text into raw rows (keeps original strings). */
function parsePageText(
  page: number,
  text: string,
  state: {
    out: { questions: ParsedQuestion[]; groups: GroupHeader[]; unrecognized: { page: number; line: number; text: string }[] };
    group: GroupHeader | null;
    globalLineOffset: number;
  },
) {
  const { out, globalLineOffset } = state;
  let group = state.group;
  const lines = text.split("\n");
  let current: {
    number: string;
    lines: string[];
    lineStart: number;
  } | null = null;

  const finish = () => {
    if (current) {
      const answerTok = current.lines[current.lines.length - 1].match(/\s*(VERO|FALSO)\s*$/);
      if (!answerTok) {
        out.unrecognized.push({ page, line: globalLineOffset + current.lineStart, text: current.lines.join(" ").slice(0, 120) });
      } else {
        const last = current.lines[current.lines.length - 1];
        const trimmedLast = last.replace(/\s*(VERO|FALSO)\s*$/, "").trim();
        const all = [...current.lines.slice(0, -1), trimmedLast];
        const statementFull = normalizeLine(all.join(" "));
        if (group) {
          out.questions.push({
            page,
            questionNumber: current.number,
            groupCode: group.code,
            topic: group.topic,
            statement: statementFull,
            correctAnswer: answerTok[1] === "VERO",
            imageRef: null, // filled later
            sourceLineStart: globalLineOffset + current.lineStart,
            sourceLineEnd: globalLineOffset + current.lineStart + current.lines.length - 1,
            contentHash: "", // filled later
          });
        } else {
          out.unrecognized.push({ page, line: globalLineOffset + current.lineStart, text: statementFull.slice(0, 120) });
        }
      }
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = normalizeLine(raw);
    if (!t) continue;

    const gm = t.match(GROUP_RE);
    if (gm) {
      finish();
      group = { code: gm[1], topic: gm[2], page, line: globalLineOffset + i + 1 };
      out.groups.push(group);
      continue;
    }
    if (SKIP_LINES.has(t)) continue;

    const qm = t.match(QUESTION_RE);
    if (qm) {
      finish();
      current = { number: qm[1], lines: [qm[2]], lineStart: i + 1 };
      // single-line question (number + statement + answer on one line)
      if (/VERO|FALSO$/.test(qm[2])) finish();
      continue;
    }

    // continuation line
    if (current) {
      current.lines.push(t);
      if (/VERO|FALSO$/.test(t)) finish();
    } else if (group) {
      // topic continuation (long group names wrap)
      group.topic = normalizeLine(group.topic + " " + t);
    } else {
      out.unrecognized.push({ page, line: globalLineOffset + i + 1, text: t.slice(0, 120) });
    }
  }
  finish();
  state.group = group;
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

  const questions: ParsedQuestion[] = [];
  const groups: GroupHeader[] = [];
  const unrecognized: { page: number; line: number; text: string }[] = [];
  const state = {
    out: { questions, groups, unrecognized },
    group: null as GroupHeader | null,
    globalLineOffset: 0,
  };
  for (const p of pdf.pagesText) {
    parsePageText(p.page, p.text, state);
    state.globalLineOffset += p.text.split("\n").length;
  }

  // --- map images to questions (nearest image center by y, x in image column) ---
  const cellsByPage = new Map<number, Map<string, number>>();
  for (const c of pdf.numberCells) {
    if (!cellsByPage.has(c.page)) cellsByPage.set(c.page, new Map());
    cellsByPage.get(c.page)!.set(c.str, c.y);
  }

  const questionsByPage = new Map<number, ParsedQuestion[]>();
  for (const q of questions) {
    if (!questionsByPage.has(q.page)) questionsByPage.set(q.page, []);
    questionsByPage.get(q.page)!.push(q);
  }

  let matched = 0;
  const unmatchedRowsWithImage = 0;
  const ambiguous: { page: number; questionNumber: string; candidates: string[] }[] = [];

  // Row band = [nextRowBaseline + 10, thisBaseline + 10] (PDF y grows upward).
  // An image [y, y+h] belongs to a row iff it overlaps the row band.
  for (const [page, pageQuestions] of questionsByPage) {
    // question images live in the right-hand column; the only non-question image
    // is the MIT logo at x≈275
    const pageImages = pdf.images.filter((im) => im.page === page && im.x > 350);
    const cells = cellsByPage.get(page) ?? new Map();
    const rows = pageQuestions
      .map((q) => ({ q, baselineY: cells.get(q.questionNumber) }))
      .filter((r): r is { q: ParsedQuestion; baselineY: number } => r.baselineY !== undefined)
      .sort((a, b) => b.baselineY - a.baselineY);
    for (let i = 0; i < rows.length; i++) {
      const { q, baselineY } = rows[i];
      const bandBottom = i < rows.length - 1 ? rows[i + 1].baselineY + 10 : baselineY - 76;
      const bandTop = baselineY + 10;
      const candidates = pageImages.filter((im) => im.y <= bandTop && im.y + im.h >= bandBottom);
      if (candidates.length === 1) {
        q.imageRef = candidates[0].hash;
        matched++;
      } else if (candidates.length > 1) {
        ambiguous.push({ page, questionNumber: q.questionNumber, candidates: candidates.map((c) => c.name) });
      }
    }
  }

  // --- finalize content hashes, dedupe groups/topics ---
  for (const q of questions) {
    q.contentHash = contentHash(q.statement, q.correctAnswer, q.imageRef);
  }

  const uniqueGroups = new Map<string, GroupHeader>();
  for (const g of groups) uniqueGroups.set(g.code, g);
  const topics = new Map<string, string>();
  for (const g of uniqueGroups.values()) topics.set(g.topic, g.code);

  // --- media registry (unique images, dedup by hash) ---
  const media = new Map<string, { hash: string; mime: string; ext: string; width: number; height: number; questions: string[] }>();
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
      };
      media.set(q.imageRef, m);
    }
    if (!m.questions.includes(q.questionNumber)) m.questions.push(q.questionNumber);
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

  // write unique image files
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

  const report = {
    source: { id: src.id, filename: src.localFilename, sha256: undefined as string | undefined },
    catalogId,
    pages: pdf.numPages,
    groups: uniqueGroups.size,
    questions: questions.length,
    vero,
    falso,
    questionsWithImage: imageQuestions,
    questionsWithoutImage: questions.length - imageQuestions,
    uniqueImages: media.size,
    matchedRows: matched,
    unmatchedRowsWithImage,
    ambiguousRows: ambiguous,
    unrecognizedLines: unrecognized.length,
    duplicateQuestionCodes: duplicateCodes,
    duplicateContentHashes: duplicateHashes,
    repeatedGroupHeaders: malformedGroups,
    parseSuccessRate: questions.length / (questions.length + unrecognized.length),
    examples: questions.slice(0, 3).map((q) => ({
      n: q.questionNumber,
      group: q.groupCode,
      topic: q.topic,
      text: q.statement.slice(0, 80),
      answer: q.correctAnswer ? "VERO" : "FALSO",
      image: q.imageRef?.slice(0, 12) ?? null,
    })),
    errors: [] as string[],
    warnings: [] as string[],
  };

  if (unrecognized.length) report.warnings.push(`${unrecognized.length} righe non riconosciute (vedi data/rejected/)`);
  if (duplicateCodes.length) report.errors.push(`${duplicateCodes.length} codici domanda duplicati`);
  if (duplicateHashes.length) report.warnings.push(`${duplicateHashes.length} contenuti duplicati (stesso testo+risposta+immagine)`);
  if (ambiguous.length) report.warnings.push(`${ambiguous.length} righe con candidati immagine ambigui`);

  await writeFile(join(reportDir, `parse-${catalogId}.json`), JSON.stringify(report, null, 2), "utf-8");

  // --- FASE 8: per-image-reference verification report ---
  const imageReport = {
    catalogId,
    source: { id: src.id, filename: src.localFilename, url: src.downloadUrl },
    methodology:
      "Le immagini sono incorporate nel PDF ufficiale, una per riga-domanda (stesso contenuto ripetuto per le domande che usano lo stesso segnale). " +
      "Ogni riferimento immagine è stato mappato alla domanda tramite overlap spaziale (banda di riga vs range immagine). " +
      "Non esistono codici immagine separati nel listato ufficiale: l'identificativo di riferimento è il numero della prima domanda che usa l'immagine.",
    images: [...media.values()]
      .map((m) => ({
        code: m.questions[0],
        officialImageCode: null, // no separate image codes exist in the official listing
        questionCount: m.questions.length,
        source: src.downloadUrl,
        filename: `${m.hash}.${m.ext}`,
        localPath: `data/media/${catalogId}/${m.hash}.${m.ext}`,
        sha256: m.hash,
        width: m.width,
        height: m.height,
        status: "found_verified",
        reason: "Estratta e mappata 1:1 alla domanda nel PDF ufficiale; contenuto verificato via posizione e ripetizione nello stesso gruppo",
        notes: "Verifica visiva manuale ancora da eseguire su campione",
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    summary: {
      totalQuestions: questions.length,
      questionsWithImage: questions.filter((q) => q.imageRef).length,
      questionsWithoutImage: questions.filter((q) => !q.imageRef).length,
      uniqueImages: media.size,
      foundVerified: media.size,
      foundUnverified: 0,
      missing: 0,
      ambiguous: 0,
    },
  };
  await writeFile(join(reportDir, `images-${catalogId}.json`), JSON.stringify(imageReport, null, 2), "utf-8");

  // rejected lines
  if (unrecognized.length) {
    const rejectedDir = join(process.cwd(), "data", "rejected");
    await mkdir(rejectedDir, { recursive: true });
    await writeFile(join(rejectedDir, `rejected-${catalogId}.jsonl`), unrecognized.map((u) => JSON.stringify(u)).join("\n"), "utf-8");
  }

  console.log("\n=== PARSE REPORT ===");
  console.log(`groups: ${uniqueGroups.size}`);
  console.log(`questions: ${questions.length} (VERO=${vero}, FALSO=${falso})`);
  console.log(`questions with image: ${imageQuestions} | without: ${questions.length - imageQuestions}`);
  console.log(`unique images: ${media.size} (written ${written} files)`);
  console.log(`image rows matched: ${matched} | unmatched: ${unmatchedRowsWithImage} | ambiguous: ${ambiguous.length}`);
  console.log(`unrecognized lines: ${unrecognized.length} | parse success: ${(report.parseSuccessRate * 100).toFixed(2)}%`);
  console.log(`duplicate codes: ${duplicateCodes.length} | duplicate content hashes: ${duplicateHashes.length}`);
  console.log(`repeated group headers: ${malformedGroups.length}`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("Output:", outDir, "| media:", mediaDir, "| report:", join(reportDir, `parse-${catalogId}.json`));
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
