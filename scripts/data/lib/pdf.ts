import { readFile, mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { sha256 } from "./hashes";

export interface PdfTextPage {
  page: number; // 1-based
  text: string;
}

export interface PageImage {
  page: number; // 1-based
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hash: string;
  mime: string;
  data: Uint8Array;
  width: number;
  height: number;
}

export interface NumberCell {
  page: number;
  str: string;
  x: number;
  y: number;
}

export interface PdfDocumentData {
  numPages: number;
  pagesText: PdfTextPage[];
  textItems: { page: number; s: string; x: number; y: number }[];
  images: PageImage[];
  numberCells: NumberCell[];
  pageDims: { page: number; width: number; height: number }[];
}

interface PositionsResult {
  numPages: number;
  numberCells: NumberCell[];
  pageDims: { page: number; width: number; height: number }[];
  pagesText: PdfTextPage[];
  textItems: { page: number; s: string; x: number; y: number }[];
  images: {
    page: number;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    file: string;
    hash: string;
    width: number;
    height: number;
  }[];
}

/**
 * Extract per-page text (visual order, reconstructed from pdf.js text items),
 * image bytes + positions, and number cells — all via a pdf.js CHILD process.
 * (Mixing unpdf and a second pdf.js document in the same process corrupts the
 * shared fake worker; unpdf text extraction also misorders multi-section pages.)
 * `cacheDir` (optional) makes the extraction idempotent: the child output is
 * kept there and reused on subsequent calls.
 */
export async function extractPdfData(path: string, cacheDir?: string): Promise<PdfDocumentData> {
  // --- positions + images + visual text via child (pdf.js only) ---
  let workDir: string;
  let isCache = false;
  if (cacheDir && (await fileExists(join(cacheDir, "positions.json")))) {
    workDir = cacheDir;
    isCache = true;
  } else {
    workDir = cacheDir ?? (await mkdtemp(join(tmpdir(), "sg-positions-")));
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    try {
      execFileSync(
        process.execPath,
        ["--import", "tsx", join(__dirname, "pdf-positions.ts"), path, workDir],
        { stdio: "inherit", timeout: 30 * 60 * 1000 },
      );
    } catch (e) {
      if (!cacheDir) await rm(workDir, { recursive: true, force: true });
      throw new Error("pdf-positions child failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  if (isCache) console.error(`[cache] reused extracted positions from ${cacheDir}`);
  else if (cacheDir) console.error(`[cache] wrote extracted positions to ${cacheDir}`);

  const positions = JSON.parse(await readFile(join(workDir, "positions.json"), "utf-8")) as PositionsResult;

  const images: PageImage[] = [];
  for (const im of positions.images) {
    const data = new Uint8Array(await readFile(join(workDir, "images", im.file)));
    images.push({
      page: im.page,
      name: im.name,
      x: im.x,
      y: im.y,
      w: im.w,
      h: im.h,
      hash: im.hash,
      mime: "image/png",
      data,
      width: im.width,
      height: im.height,
    });
  }

  if (!cacheDir) await rm(workDir, { recursive: true, force: true });

  return {
    numPages: positions.numPages,
    pagesText: positions.pagesText,
    textItems: positions.textItems,
    images,
    numberCells: positions.numberCells,
    pageDims: positions.pageDims,
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

export { sha256 };
