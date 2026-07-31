import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm, copyFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { renderPageAsImage, getDocumentProxy } from "unpdf";
import { OFFICIAL_SOURCES } from "../data/sources";
import type { ImageLike, ParsedQuestion } from "../data/lib/types";

/**
 * Offline review export (FASE 7b).
 *   npm run review:export
 *
 * Builds a self-contained ZIP for an external human reviewer:
 *   review-export/            (extract root)
 *     index.html              fully offline (double-click), data embedded, no fetch/CDN
 *     review-data.json        structured data (assets, questions, figureReferenceCases)
 *     assets/{sha256}.png     only the recommended-sample images (+ HR-case assets, if any)
 *     pages/page-{NNNN}.png   only the pages actually needed
 *     README.txt
 *
 * Rules:
 *   - reads processed data, sample report, figure audit, reviews (read-only);
 *   - may delete/regenerate ONLY its own output dir (data/exports/review-export-<catalog>/);
 *   - never writes visually_verified, never changes verificationStatus;
 *   - never starts persistent servers; no new dependencies (pure-Node ZIP writer).
 */

const ROOT = process.cwd();
const CATALOG_ID = "ab-2025-04-23";
const SOURCE_ID = "pda-2025-ab-it";
const PAGE_SCALE = 1.5; // same as the review gallery (readable text & signs)

const P_DIR = join(ROOT, "data", "processed", CATALOG_ID);
const CACHE_POS_DIR = join(ROOT, "data", "processed", ".cache", CATALOG_ID);
const MEDIA_DIR = join(ROOT, "data", "media", CATALOG_ID);
const REPORTS_DIR = join(ROOT, "data", "reports");
const PAGE_CACHE_DIR = join(REPORTS_DIR, ".gallery-pages", CATALOG_ID);
const REVIEWS_PATH = join(ROOT, "data", "reviews", "reviews.json");
const PDF_PATH = join(
  ROOT,
  "data",
  "official",
  OFFICIAL_SOURCES.find((s) => s.id === SOURCE_ID)!.localFilename,
);

const EXPORT_DIR = join(ROOT, "data", "exports", `review-export-${CATALOG_ID}`);
const ZIP_PATH = join(ROOT, "data", "exports", `review-export-${CATALOG_ID}.zip`);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function pageFileName(page: number): string {
  return `page-${pad4(page)}.png`;
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf-8")) as T;
}

async function readPngSize(buf: Buffer): Promise<{ width: number; height: number }> {
  // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) + width (4) + height (4)
  if (buf.length < 24 || buf.toString("latin1", 1, 4) !== "PNG") {
    throw new Error("not a PNG buffer");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
// pure-Node ZIP writer (deflate via zlib, UTF-8 names) — no external deps
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function createZip(entries: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const comp = deflateRawSync(e.data, { level: 9 });
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(8, 8); // deflate
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cdStart = offset;
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, cd, eocd]);
}

// ---------------------------------------------------------------------------
// data loading
// ---------------------------------------------------------------------------

interface SampleEntry {
  hash: string;
  categories: string[];
  minConfidence: number;
  questionCount: number;
  pageFirstSeen: number;
}

interface MediaEntry {
  hash: string;
  mime: string;
  ext: string;
  width: number;
  height: number;
  questions: string[];
  verificationStatus: string;
  verificationMethod: string;
  minConfidence: number;
  pageFirstSeen: number;
}

interface PositionsData {
  pageDims: { page: number; width: number; height: number }[];
  images: ImageLike[];
  numberCells: { page: number; str: string; x: number; y: number }[];
}

interface ReviewRecord {
  assetHash: string;
  decision: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now();

  // --- 1. read inputs (read-only) ---
  const [questionsRaw, groups, media, positions, sampleReport, figureAudit] = await Promise.all([
    readFile(join(P_DIR, "questions.jsonl"), "utf-8"),
    readJson<{ code: string; topic: string; page: number }[]>(join(P_DIR, "groups.json")),
    readJson<MediaEntry[]>(join(P_DIR, "media.json")),
    readJson<PositionsData>(join(CACHE_POS_DIR, "positions.json")),
    readJson<{ sample: SampleEntry[] }>(join(REPORTS_DIR, `review-sample-${CATALOG_ID}.json`)),
    readJson<{
      cases: {
        officialQuestionCode: string;
        officialGroupCode: string;
        statement: string;
        page: number;
        pageHasImages: boolean;
        nearbyImages: { name: string; x: number; y: number; w: number; h: number; hash: string }[];
        mediaRelation: string | null;
        reason: string;
        classification: string;
        evidence: string[];
        requiresHumanReview: boolean;
      }[];
      requiresHumanReview: number;
    }>(join(REPORTS_DIR, `figure-reference-audit-${CATALOG_ID}.json`)),
  ]);
  const questions = questionsRaw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as ParsedQuestion);
  const reviews: ReviewRecord[] = existsSync(REVIEWS_PATH)
    ? await readJson<ReviewRecord[]>(REVIEWS_PATH)
    : [];
  const reviewByHash = new Map(reviews.map((r) => [r.assetHash, r]));
  const groupNameByCode = new Map(groups.map((g) => [g.code, g.topic]));
  const pageDimsByPage = new Map(positions.pageDims.map((d) => [d.page, d]));

  const sampleHashes = new Set(sampleReport.sample.map((s) => s.hash));
  const sampleByHash = new Map(sampleReport.sample.map((s) => [s.hash, s]));

  const hrCases = figureAudit.cases.filter((c) => c.requiresHumanReview);

  // --- 2. selection ---
  // assets: the recommended sample (74); the 2 HR cases have no asset (mediaRelation null)
  const exportedAssets = media.filter((m) => sampleHashes.has(m.hash)).sort((a, b) => a.minConfidence - b.minConfidence);
  if (exportedAssets.length !== sampleReport.sample.length) {
    throw new Error(
      `sample mismatch: ${exportedAssets.length} media found, expected ${sampleReport.sample.length} (run npm run review:sample)`,
    );
  }

  // questions associated with exported assets
  const questionsByHash = new Map<string, ParsedQuestion[]>();
  for (const q of questions) {
    if (!q.imageRef || !sampleHashes.has(q.imageRef)) continue;
    const arr = questionsByHash.get(q.imageRef) ?? [];
    arr.push(q);
    questionsByHash.set(q.imageRef, arr);
  }

  // pages needed: all pages of sample questions + pages of HR cases
  const neededPages = new Set<number>();
  for (const q of questions) {
    if (q.imageRef && sampleHashes.has(q.imageRef)) neededPages.add(q.page);
  }
  for (const c of hrCases) neededPages.add(c.page);
  const sortedPages = [...neededPages].sort((a, b) => a - b);

  // --- 3. fresh output dir (own dir only) ---
  await rm(EXPORT_DIR, { recursive: true, force: true });
  await mkdir(join(EXPORT_DIR, "assets"), { recursive: true });
  await mkdir(join(EXPORT_DIR, "pages"), { recursive: true });

  // --- 4. copy assets (bytes as-is, never re-encoded) ---
  for (const m of exportedAssets) {
    const src = join(MEDIA_DIR, `${m.hash}.${m.ext}`);
    if (!existsSync(src)) throw new Error(`missing media file: ${src}`);
    await copyFile(src, join(EXPORT_DIR, "assets", `${m.hash}.${m.ext}`));
  }

  // --- 5. pages: reuse gallery cache when available, else render ---
  const pdfBuf = await readFile(PDF_PATH);
  const proxy = await getDocumentProxy(new Uint8Array(pdfBuf));
  const pagePngDims = new Map<number, { width: number; height: number }>();
  let rendered = 0;
  for (const page of sortedPages) {
    const cacheFile = join(PAGE_CACHE_DIR, `p${page}.png`);
    const outFile = join(EXPORT_DIR, "pages", pageFileName(page));
    let buf: Buffer | null = null;
    if (existsSync(cacheFile)) {
      const cached = await readFile(cacheFile);
      const dims = await readPngSize(cached);
      const dim = pageDimsByPage.get(page);
      const expW = Math.round((dim?.width ?? 595) * PAGE_SCALE);
      const expH = Math.round((dim?.height ?? 842) * PAGE_SCALE);
      if (Math.abs(dims.width - expW) <= 1 && Math.abs(dims.height - expH) <= 1) {
        buf = cached;
      }
    }
    if (!buf) {
      const out = await renderPageAsImage(proxy, page, {
        canvasImport: async () => (await import("@napi-rs/canvas")) as never,
        scale: PAGE_SCALE,
      });
      buf = Buffer.from(out);
      rendered++;
    }
    const dims = await readPngSize(buf);
    pagePngDims.set(page, dims);
    await writeFile(outFile, buf);
  }
  console.log(`[export] pages: ${sortedPages.length} (${rendered} rendered, ${sortedPages.length - rendered} from cache)`);

  // --- 6. build review-data.json ---
  const pageImageMap: Record<string, { filename: string; pdfWidth: number; pdfHeight: number; pngWidth: number; pngHeight: number }> = {};
  for (const page of sortedPages) {
    const dim = pageDimsByPage.get(page);
    const png = pagePngDims.get(page)!;
    pageImageMap[String(page)] = {
      filename: `pages/${pageFileName(page)}`,
      pdfWidth: dim?.width ?? 595,
      pdfHeight: dim?.height ?? 842,
      pngWidth: png.width,
      pngHeight: png.height,
    };
  }

  const assets = exportedAssets.map((m) => {
    const assocQuestions = (questionsByHash.get(m.hash) ?? []).sort(
      (a, b) => a.page - b.page || a.sourceLineStart - b.sourceLineStart,
    );
    const sample = sampleByHash.get(m.hash);
    // representative image coordinates: first question on the asset's first-seen page
    const onFirstPage = assocQuestions.find((q) => q.page === m.pageFirstSeen && q.imageBBox);
    const firstBBox = onFirstPage?.imageBBox ?? assocQuestions[0]?.imageBBox ?? null;
    const sourcePage = m.pageFirstSeen;

    return {
      assetHash: m.hash,
      assetFilename: `assets/${m.hash}.${m.ext}`,
      width: m.width,
      height: m.height,
      verificationStatus: m.verificationStatus,
      minimumConfidence: m.minConfidence,
      sampleReason: (sample?.categories ?? []).join(", "),
      requiresHumanReview: false,
      sourcePage,
      pageImageFilename: pageImageMap[String(sourcePage)]?.filename ?? null,
      imageCoordinates: firstBBox
        ? { page: firstBBox.page, x: firstBBox.x, y: firstBBox.y, w: firstBBox.w, h: firstBBox.h }
        : null,
      questions: assocQuestions.map((q) => {
        const review = reviewByHash.get(m.hash);
        return {
          officialQuestionCode: q.questionNumber,
          officialGroupCode: q.groupCode,
          groupName: groupNameByCode.get(q.groupCode) ?? q.topic,
          statement: q.statement,
          correctAnswer: q.correctAnswer,
          sourcePage: q.page,
          rowCoordinates: q.rowBand ? { bottom: q.rowBand.bottom, top: q.rowBand.top } : null,
          relationConfidence: q.structuralConfidence,
          currentReviewStatus: review?.decision ?? null,
          currentReviewNote: review?.note ?? null,
          imageBBox: q.imageBBox
            ? { page: q.imageBBox.page, x: q.imageBBox.x, y: q.imageBBox.y, w: q.imageBBox.w, h: q.imageBBox.h }
            : null,
        };
      }),
    };
  });

  const figureReferenceCases = hrCases.map((c) => {
    const q = questions.find((x) => x.questionNumber === c.officialQuestionCode);
    return {
      officialQuestionCode: c.officialQuestionCode,
      officialGroupCode: c.officialGroupCode,
      groupName: groupNameByCode.get(c.officialGroupCode) ?? "",
      statement: c.statement,
      correctAnswer: q?.correctAnswer ?? null,
      sourcePage: c.page,
      pageImageFilename: pageImageMap[String(c.page)]?.filename ?? null,
      rowCoordinates: q?.rowBand ? { bottom: q.rowBand.bottom, top: q.rowBand.top } : null,
      classification: c.classification,
      reason: c.reason,
      evidence: c.evidence,
      requiresHumanReview: c.requiresHumanReview,
      nearbyImages: c.nearbyImages,
    };
  });

  const reviewData = {
    catalogId: CATALOG_ID,
    generatedAt: new Date().toISOString(),
    note:
      "Esportazione offline per revisione visiva esterna. Nessuna associazione è stata marcata visually_verified durante l'export.",
    source: {
      id: SOURCE_ID,
      filename: OFFICIAL_SOURCES.find((s) => s.id === SOURCE_ID)!.localFilename,
      pdfSha256: null,
    },
    pageImageMap,
    assets,
    figureReferenceCases,
    counts: {
      assets: assets.length,
      questions: assets.reduce((a, x) => a + x.questions.length, 0),
      pages: sortedPages.length,
      figureReferenceCases: figureReferenceCases.length,
    },
  };

  await writeFile(join(EXPORT_DIR, "review-data.json"), JSON.stringify(reviewData, null, 2), "utf-8");

  // --- 7. index.html (fully offline, data embedded) ---
  const html = buildHtml(reviewData);
  await writeFile(join(EXPORT_DIR, "index.html"), html, "utf-8");

  // --- 8. README.txt ---
  const readme = buildReadme(reviewData);
  await writeFile(join(EXPORT_DIR, "README.txt"), readme, "utf-8");

  // --- 9. validation ---
  const problems = await validateExport(EXPORT_DIR, reviewData);
  if (problems.length) {
    console.error("[export] VALIDATION FAILED:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  // --- 10. zip ---
  const entries = await collectZipEntries(EXPORT_DIR);
  const zip = createZip(entries);
  await mkdir(join(ROOT, "data", "exports"), { recursive: true });
  await writeFile(ZIP_PATH, zip);

  // --- 11. summary ---
  const sizeMb = (zip.length / 1048576).toFixed(2);
  console.log("\n=== REVIEW EXPORT ===");
  console.log(`assets: ${assets.length}`);
  console.log(`questions (assets): ${reviewData.counts.questions} + figure cases: ${reviewData.figureReferenceCases.length}`);
  console.log(`pages: ${sortedPages.length}`);
  console.log(`zip: ${ZIP_PATH} (${sizeMb} MB, ${entries.length} entries)`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// ---------------------------------------------------------------------------
// HTML generation (offline; data is embedded inline — no fetch, no CDN)
// ---------------------------------------------------------------------------

interface ReviewDataShape {
  catalogId: string;
  generatedAt: string;
  note: string;
  source: { id: string; filename: string; pdfSha256: string | null };
  pageImageMap: Record<string, { filename: string; pdfWidth: number; pdfHeight: number; pngWidth: number; pngHeight: number }>;
  assets: Array<{
    assetHash: string;
    assetFilename: string;
    width: number;
    height: number;
    verificationStatus: string;
    minimumConfidence: number;
    sampleReason: string;
    requiresHumanReview: boolean;
    sourcePage: number;
    pageImageFilename: string | null;
    imageCoordinates: { page: number; x: number; y: number; w: number; h: number } | null;
    questions: Array<{
      officialQuestionCode: string;
      officialGroupCode: string;
      groupName: string;
      statement: string;
      correctAnswer: boolean;
      sourcePage: number;
      rowCoordinates: { bottom: number; top: number } | null;
      relationConfidence: number | null;
      currentReviewStatus: string | null;
      currentReviewNote: string | null;
      imageBBox: { page: number; x: number; y: number; w: number; h: number } | null;
    }>;
  }>;
  figureReferenceCases: Array<{
    officialQuestionCode: string;
    officialGroupCode: string;
    groupName: string;
    statement: string;
    correctAnswer: boolean | null;
    sourcePage: number;
    pageImageFilename: string | null;
    rowCoordinates: { bottom: number; top: number } | null;
    classification: string;
    reason: string;
    evidence: string[];
    requiresHumanReview: boolean;
    nearbyImages: { name: string; x: number; y: number; w: number; h: number; hash: string }[];
  }>;
  counts: { assets: number; questions: number; pages: number; figureReferenceCases: number };
}

function buildHtml(data: ReviewDataShape): string {
  const embedded = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisione visiva esterna — catalogo AB 2025-04-23</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; background: #f5f5f7; color: #1c1c1e; }
  header { background: #1c1c1e; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; }
  header .badge { background: #3a3a3c; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; padding: 10px 16px; background: #fff; border-bottom: 1px solid #ddd; align-items: center; }
  .toolbar select, .toolbar input { padding: 5px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #444; padding: 6px 16px; background: #fff; border-bottom: 1px solid #eee; }
  .legend .sw { display: inline-block; width: 18px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
  .summary { font-size: 12px; color: #555; padding: 8px 16px; }
  main { padding: 16px; }
  .asset { background: #fff; border: 1px solid #e0e0e2; border-radius: 10px; margin-bottom: 14px; padding: 12px; }
  .asset-hr { border-left: 5px solid #ff9f0a; }
  .asset-head { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; }
  .asset-img { width: 160px; height: 160px; object-fit: contain; border: 1px solid #ddd; background: #fff; border-radius: 6px; }
  .asset-meta { flex: 1; min-width: 280px; font-size: 13px; }
  .asset-meta .row { margin: 3px 0; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; margin-right: 4px; }
  .tag.structurally_verified { background: #d2f0dc; color: #0a5a2a; }
  .tag.visually_verified { background: #cfe4ff; color: #063a75; }
  .tag.ambiguous { background: #ffe9c2; color: #7a4d00; }
  .tag.rejected { background: #ffd9d9; color: #7a1111; }
  .tag.hr { background: #ffd9a0; color: #7a3d00; }
  .q { border-top: 1px dashed #ddd; padding: 6px 0; font-size: 13px; }
  .q .code { font-weight: 600; }
  .q .ans { font-weight: 600; }
  .ans.true { color: #0a5a2a; }
  .ans.false { color: #7a1111; }
  .q .coords { color: #888; font-size: 11px; }
  .pageview { margin-top: 10px; }
  .pageview .page-wrap { position: relative; display: inline-block; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; }
  .pageview img { display: block; width: 100%; height: auto; }
  .pageview svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .pageview summary { cursor: pointer; font-size: 12px; color: #0a64d0; padding: 4px 0; }
  details { margin-top: 8px; }
  .hl-row { stroke: #ff3b30; stroke-width: 2; fill: rgba(255,59,48,.08); }
  .hl-img { stroke: #0a84ff; stroke-width: 2; fill: rgba(10,132,255,.12); }
  .hl-near { stroke: #ff9f0a; stroke-width: 2; stroke-dasharray: 5 3; fill: rgba(255,159,10,.15); }
  .empty { padding: 20px; color: #888; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>Revisione visiva esterna — AB 2025-04-23</h1>
  <span class="badge" id="statCount"></span>
  <span class="badge">offline</span>
</header>
<div class="toolbar">
  <label>Vista
    <select id="fView">
      <option value="all">tutti</option>
      <option value="sample">campione consigliato</option>
      <option value="hr">requiresHumanReview</option>
    </select>
  </label>
  <label>Ordina
    <select id="fSort">
      <option value="asc">confidence crescente</option>
      <option value="desc">confidence decrescente</option>
    </select>
  </label>
  <label>Cerca per codice domanda
    <input id="fSearch" type="search" placeholder="es. 21810" style="width:220px">
  </label>
</div>
<div class="legend">
  <span><span class="sw" style="background:#ff3b30"></span>banda riga domanda</span>
  <span><span class="sw" style="background:#0a84ff"></span>area immagine associata</span>
  <span><span class="sw" style="background:#ff9f0a"></span>immagine vicina non associata (casi HR)</span>
</div>
<div class="summary" id="summary"></div>
<main id="main"></main>
<script>
"use strict";
var DATA = ${embedded};
function $(id){ return document.getElementById(id); }

var PAGE = {};
Object.keys(DATA.pageImageMap).forEach(function(k){
  var p = DATA.pageImageMap[k];
  PAGE[k] = { filename: p.filename, pdfW: p.pdfWidth, pdfH: p.pdfHeight, pngW: p.pngWidth, pngH: p.pngHeight };
});

function ptX(x, page){ return x * PAGE[page].pngW / PAGE[page].pdfW; }
function ptY(y, page){ return (PAGE[page].pdfH - y) * PAGE[page].pngH / PAGE[page].pdfH; }

function clampRect(y, h, pageH) {
  var y2 = Math.max(0, y);
  var h2 = Math.min(h, pageH - y2);
  return h2 > 0 ? ' y="' + y2 + '" height="' + h2 + '"' : '';
}

function overlayBoxes(page, rows) {
  var boxes = "";
  var pngH = PAGE[page].pngH, pngW = PAGE[page].pngW;
  rows.forEach(function(r){
    if (r.row) {
      var y = ptY(r.row.top, page);
      var h = ptY(r.row.bottom, page) - y;
      boxes += '<rect class="hl-row" x="0"' + clampRect(y, h, pngH) + ' width="' + pngW + '"/>';
    }
    if (r.img) {
      var x = ptX(r.img.x, page);
      var y2 = ptY(r.img.y + r.img.h, page);
      var w = r.img.w * pngW / PAGE[page].pdfW;
      var h2 = r.img.h * pngH / PAGE[page].pdfH;
      if (x >= 0 && x < pngW) {
        boxes += '<rect class="hl-img" x="' + x + '"' + clampRect(y2, h2, pngH) + ' width="' + w + '"/>';
      }
    }
  });
  return boxes;
}

function pageView(page, rows, extra) {
  if (!PAGE[page]) return "";
  var svg = '<svg viewBox="0 0 ' + PAGE[page].pngW + ' ' + PAGE[page].pngH + '" preserveAspectRatio="none">' + overlayBoxes(page, rows) + (extra || "") + '</svg>';
  return '<details class="pageview"><summary>Pagina ' + page + ' — originale PDF</summary><div class="page-wrap" style="max-width:640px"><img src="' + PAGE[page].filename + '" alt="pagina ' + page + '"><div style="position:absolute;inset:0">' + svg + '</div></div></details>';
}

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function questionRows(asset){
  var rows = [];
  asset.questions.forEach(function(q){
    var page = String(q.sourcePage);
    var r = rows.filter(function(x){ return x.page === page; })[0];
    var entry = { row: q.rowCoordinates, img: q.imageBBox };
    if (r) { r.entries.push(entry); } else { rows.push({ page: page, entries: [entry] }); }
  });
  return rows;
}

function assetCard(a){
  var first = a.questions[0] || {};
  var pages = {};
  a.questions.forEach(function(q){ pages[String(q.sourcePage)] = true; });
  var pageCount = Object.keys(pages).length;
  var views = questionRows(a).map(function(r){
    var rows = r.entries.map(function(e){ return { row: e.row, img: e.img }; });
    return pageView(parseInt(r.page, 10), rows);
  }).join("");
  var qs = a.questions.map(function(q){
    return '<div class="q">'
      + '<span class="code">' + esc(q.officialQuestionCode) + '</span> · '
      + '<span class="ans ' + (q.correctAnswer ? "true" : "false") + '">' + (q.correctAnswer ? "VERO" : "FALSO") + '</span>'
      + ' · gruppo ' + esc(q.officialGroupCode) + ' — ' + esc(q.groupName)
      + (q.currentReviewStatus ? ' · <span class="reviewed">revisione: ' + esc(q.currentReviewStatus) + (q.currentReviewNote ? ' — ' + esc(q.currentReviewNote) : '') + '</span>' : '')
      + '<br><span class="coords">pag. ' + q.sourcePage
      + (q.rowCoordinates ? ', banda [' + q.rowCoordinates.bottom.toFixed(0) + '..' + q.rowCoordinates.top.toFixed(0) + ']' : '')
      + (q.imageBBox ? ', immagine (' + q.imageBBox.x.toFixed(1) + ',' + q.imageBBox.y.toFixed(1) + ')' : '')
      + (q.relationConfidence != null ? ', confidence ' + q.relationConfidence.toFixed(3) : '')
      + '</span><br>' + esc(q.statement) + '</div>';
  }).join("");
  return '<div class="asset" data-hash="' + a.assetHash + '">'
    + '<div class="asset-head">'
    + '<img class="asset-img" src="' + a.assetFilename + '" alt="asset ' + a.assetHash.slice(0,8) + '">'
    + '<div class="asset-meta">'
    + '<div class="row"><span class="tag ' + esc(a.verificationStatus) + '">' + esc(a.verificationStatus) + '</span>'
    + '<span class="tag">campione</span> <b>' + a.assetHash.slice(0,12) + '…</b></div>'
    + '<div class="row">' + a.width + '×' + a.height + 'px · ' + a.questions.length + ' domande · confidence min ' + a.minimumConfidence.toFixed(3) + ' · prima comparsa pag. ' + a.sourcePage + ' · ' + pageCount + ' pagine</div>'
    + (a.sampleReason ? '<div class="row coords">motivo campione: ' + esc(a.sampleReason) + '</div>' : '')
    + qs
    + '</div></div>' + views + '</div>';
}

function hrCard(c){
  var extra = "";
  var rows = [];
  if (c.rowCoordinates) rows.push({ row: c.rowCoordinates, img: null });
  c.nearbyImages.forEach(function(n){
    rows.push({ row: null, img: { page: c.sourcePage, x: n.x, y: n.y, w: n.w, h: n.h } });
    extra += '<rect class="hl-near" x="' + ptX(n.x, String(c.sourcePage)) + '" y="' + ptY(n.y + n.h, String(c.sourcePage)) + '" width="' + (n.w * PAGE[String(c.sourcePage)].pngW / PAGE[String(c.sourcePage)].pdfW) + '" height="' + (n.h * PAGE[String(c.sourcePage)].pngH / PAGE[String(c.sourcePage)].pdfH) + '"/>';
  });
  var ev = c.evidence.map(function(e){ return '<li>' + esc(e) + '</li>'; }).join("");
  return '<div class="asset asset-hr" data-code="' + esc(c.officialQuestionCode) + '">'
    + '<div class="asset-head"><div class="asset-meta">'
    + '<div class="row"><span class="tag hr">requiresHumanReview</span> <b>' + esc(c.officialQuestionCode) + '</b></div>'
    + '<div class="row"><span class="ans ' + (c.correctAnswer ? "true" : "false") + '">' + (c.correctAnswer === true ? "VERO" : c.correctAnswer === false ? "FALSO" : "n/d") + '</span> · gruppo ' + esc(c.officialGroupCode) + ' — ' + esc(c.groupName) + ' · pag. ' + c.sourcePage + '</div>'
    + '<div class="row">classificazione: ' + esc(c.classification) + '</div>'
    + '<div class="q"><b>Testo:</b> ' + esc(c.statement) + '</div>'
    + '<div class="q"><b>Motivo:</b> ' + esc(c.reason) + '</div>'
    + (ev ? '<div class="q"><b>Evidenze:</b><ul style="margin:4px 0 0 18px">' + ev + '</ul></div>' : '')
    + (c.nearbyImages.length ? '<div class="row coords">immagini vicine (evidenziate in arancione): ' + c.nearbyImages.map(function(n){ return n.name + " (" + n.hash.slice(0,8) + "…)"; }).join(", ") + '</div>' : '')
    + '<div class="row coords">nessuna immagine associata a questa domanda</div>'
    + '</div></div>'
    + pageView(c.sourcePage, rows, extra) + '</div>';
}

function render(){
  var view = $("fView").value;
  var sort = $("fSort").value;
  var search = $("fSearch").value.trim().toLowerCase();
  var assets = DATA.assets.slice();
  var cards = [];
  if (view === "all" || view === "sample") {
    if (sort === "asc") assets.sort(function(a,b){ return a.minimumConfidence - b.minimumConfidence; });
    else assets.sort(function(a,b){ return b.minimumConfidence - a.minimumConfidence; });
    if (search) {
      assets = assets.filter(function(a){
        return a.questions.some(function(q){
          return q.officialQuestionCode.toLowerCase().indexOf(search) !== -1
            || q.statement.toLowerCase().indexOf(search) !== -1;
        });
      });
    }
    cards = assets.map(assetCard);
  }
  if (view === "all" || view === "hr") {
    var hrc = DATA.figureReferenceCases.slice();
    if (search) hrc = hrc.filter(function(c){
      return c.officialQuestionCode.toLowerCase().indexOf(search) !== -1
        || c.statement.toLowerCase().indexOf(search) !== -1;
    });
    cards = cards.concat(hrc.map(hrCard));
  }
  $("main").innerHTML = cards.length ? cards.join("") : '<div class="empty">Nessun risultato.</div>';
  var qTotal = assets.reduce(function(a,x){ return a + x.questions.length; }, 0) + (view === "all" || view === "hr" ? DATA.figureReferenceCases.length : 0);
  $("summary").textContent = view + " · " + cards.length + " elementi · " + qTotal + " domande" + (search ? ' · ricerca: "' + search + '"' : "");
  $("statCount").textContent = DATA.assets.length + " asset · " + DATA.figureReferenceCases.length + " casi HR";
}

["fView","fSort","fSearch"].forEach(function(id){ $(id).addEventListener("input", render); });
render();
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// README.txt
// ---------------------------------------------------------------------------

function buildReadme(data: ReviewDataShape): string {
  const totalQ = data.counts.questions + data.counts.figureReferenceCases;
  return `REVISIONE VISIVA ESTERNA — catalogo AB 2025-04-23
====================================================

Catalogo:                AB 2025-04-23 (Portale dell'Automobilista, domande AB italiano 23-04-2025)
Data di generazione:     ${data.generatedAt}
Asset esportati:         ${data.counts.assets}
Pagine esportate:        ${data.counts.pages}
Domande esportate:       ${data.counts.questions} (associate agli asset) + ${data.counts.figureReferenceCases} casi "figura" = ${totalQ}
Casi requiresHumanReview:${data.counts.figureReferenceCases}

ISTRUZIONE
----------
Estrarre lo ZIP e aprire index.html (doppio clic). Nessun server,
nessuna connessione e nessuna installazione sono necessari.

COLORI DEGLI OVERLAY (sulle pagine PDF originali)
-------------------------------------------------
- Rosso (#ff3b30): banda di riga della domanda (intervallo verticale della riga nel PDF)
- Blu (#0a84ff): area dell'immagine associata alla domanda (bounding box PDF)
- Arancione (#ff9f0a, tratteggiato): immagine vicina alla riga ma NON associata
  (solo nei casi requiresHumanReview)

STRUTTURA
---------
index.html          galleria offline (dati incorporati; doppio clic)
review-data.json    dati strutturati (assets, questions, figureReferenceCases)
assets/<sha256>.png immagini estratte del campione consigliato
pages/page-NNNN.png pagine PDF originali rasterizzate (solo quelle necessarie)

NOTA SULLA VERIFICA
-------------------
Nessuna associazione è stata automaticamente marcata visually_verified
durante l'export. Gli stati restano quelli della pipeline automatica
(structurally_verified per gli asset del campione).
`;
}

// ---------------------------------------------------------------------------
// validation: all references relative, files exist, no localhost / absolute fs paths
// ---------------------------------------------------------------------------

async function validateExport(dir: string, data: ReviewDataShape): Promise<string[]> {
  const problems: string[] = [];
  const indexHtml = await readFile(join(dir, "index.html"), "utf-8");
  const dataJson = await readFile(join(dir, "review-data.json"), "utf-8");

  // 1. embedded data === review-data.json (same object serialized)
  const embeddedMatch = indexHtml.match(/var DATA = (\{.*\});\n/);
  if (!embeddedMatch) {
    problems.push("embedded DATA not found in index.html");
  } else {
    try {
      const embedded = JSON.parse(embeddedMatch[1]);
      if (JSON.stringify(embedded) !== JSON.stringify(data)) {
        problems.push("embedded data differs from review-data.json");
      }
    } catch (e) {
      problems.push("embedded DATA is not valid JSON: " + String(e));
    }
  }

  // 2. references in JSON
  const refs: string[] = [];
  for (const a of data.assets) {
    refs.push(a.assetFilename);
    if (a.pageImageFilename) refs.push(a.pageImageFilename);
  }
  for (const c of data.figureReferenceCases) {
    if (c.pageImageFilename) refs.push(c.pageImageFilename);
  }
  for (const p of Object.values(data.pageImageMap)) refs.push(p.filename);

  // 3. references in HTML (src/href) — only real HTML, not the inline <script> code
  const htmlNoScript = indexHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  const htmlRefs = [...htmlNoScript.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  refs.push(...htmlRefs.filter((r) => !r.startsWith("#") && !r.startsWith("javascript:")));

  for (const ref of refs) {
    if (!ref) continue;
    if (/^(https?:)?\/\//.test(ref) || ref.includes("localhost") || ref.includes("127.0.0.1")) {
      problems.push(`non-relative/localhost reference: ${ref}`);
      continue;
    }
    if (/^[a-zA-Z]:[\\/]/.test(ref) || ref.startsWith("/")) {
      problems.push(`absolute filesystem reference: ${ref}`);
      continue;
    }
    const filePath = join(dir, ref);
    if (!existsSync(filePath)) problems.push(`missing file referenced: ${ref}`);
  }

  // 4. no leftover absolute paths anywhere in HTML/JSON text
  for (const [label, text] of [["index.html", indexHtml], ["review-data.json", dataJson]] as const) {
    if (/E:[\\/]|C:[\\/]|localhost|127\.0\.0\.1/.test(text)) {
      const hits = text.match(/(E:[\\/][^"'\s]+|C:[\\/][^"'\s]+|localhost|127\.0\.0\.1)/g) ?? [];
      problems.push(`${label} contains forbidden absolute/localhost reference: ${hits.slice(0, 3).join(", ")}`);
    }
  }

  // 5. asset files exist on disk and are referenced by exactly the assets list
  const assetFiles = await readdir(join(dir, "assets"));
  const pageFiles = await readdir(join(dir, "pages"));
  const expectedAssets = new Set(data.assets.map((a) => a.assetFilename.split("/").pop()!));
  for (const f of assetFiles) if (!expectedAssets.has(f)) problems.push(`unexpected asset file: ${f}`);
  const expectedPages = new Set(data.pageImageMap ? Object.values(data.pageImageMap).map((p) => p.filename.split("/").pop()!) : []);
  for (const f of pageFiles) if (!expectedPages.has(f)) problems.push(`unexpected page file: ${f}`);

  return problems;
}

async function collectZipEntries(dir: string): Promise<{ name: string; data: Buffer }[]> {
  const entries: { name: string; data: Buffer }[] = [];
  const walk = async (rel: string) => {
    const full = join(dir, rel);
    const st = await stat(full);
    if (st.isDirectory()) {
      const children = await readdir(full);
      for (const c of children.sort()) await walk(rel ? `${rel}/${c}` : c);
    } else {
      entries.push({ name: rel, data: await readFile(full) });
    }
  };
  await walk("");
  // deterministic order: index.html, review-data.json, README.txt, assets/, pages/
  const rank = (n: string) => (n === "index.html" ? 0 : n === "review-data.json" ? 1 : n === "README.txt" ? 2 : n.startsWith("assets/") ? 3 : 4);
  entries.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  return entries;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
