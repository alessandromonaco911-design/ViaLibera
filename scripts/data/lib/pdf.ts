import { readFile, mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { extractText, getDocumentProxy } from "unpdf";
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
  images: PageImage[];
  numberCells: NumberCell[];
}

interface PositionsResult {
  numPages: number;
  numberCells: NumberCell[];
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
 * Extract per-page text (unpdf) and image bytes + positions (pdf.js in a child
 * process: mixing unpdf and a second pdf.js document in the same process
 * corrupts the shared fake worker and throws DataCloneError).
 * `cacheDir` (optional) makes the extraction idempotent: positions/images are
 * kept there and reused on subsequent calls.
 */
export async function extractPdfData(path: string, cacheDir?: string): Promise<PdfDocumentData> {
  const buf = await readFile(path);
  const bytes = new Uint8Array(buf);

  // --- text via unpdf (main process) ---
  const proxy = await getDocumentProxy(bytes);
  const { text } = await extractText(proxy, { mergePages: false });
  const pagesText: PdfTextPage[] = text.map((t, i) => ({ page: i + 1, text: t }));

  // --- positions + images via child (pdf.js only) ---
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

  // load PNG files
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

  return { numPages: positions.numPages, pagesText, images, numberCells: positions.numberCells };
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
