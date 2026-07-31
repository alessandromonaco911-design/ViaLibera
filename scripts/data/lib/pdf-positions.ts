/**
 * Standalone child process: extracts question-number cells, image paint
 * positions AND decoded image data from a PDF using pdf.js ONLY.
 * Images are written as PNG files.
 *
 * Usage: tsx pdf-positions.ts <pdfPath> <outDir>
 * Output: outDir/positions.json + outDir/images/*.png
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

async function main() {
  const [pdfPath, outDir] = process.argv.slice(2);
  if (!pdfPath || !outDir) throw new Error("usage: pdf-positions.ts <pdfPath> <outDir>");

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const imgDir = join(outDir, "images");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(imgDir, { recursive: true });

  const buf = await readFile(pdfPath);
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const numPages = doc.numPages;

  const numberCells: { page: number; str: string; x: number; y: number }[] = [];
  const images: {
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
    channels: number;
  }[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);

    const tc = await page.getTextContent();
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      const s = (it.str ?? "").trim();
      if (/^\d{4,7}$/.test(s) && typeof it.transform?.[4] === "number") {
        numberCells.push({ page: p, str: s, x: it.transform[4], y: it.transform[5] });
      }
    }

    const opList = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const ctmStack: number[][] = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i] as unknown[];
      if (fn === OPS.save) {
        ctmStack.push([...ctm]);
      } else if (fn === OPS.restore) {
        ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        const m = args as number[];
        ctm = [
          ctm[0] * m[0] + ctm[2] * m[1],
          ctm[1] * m[0] + ctm[3] * m[1],
          ctm[0] * m[2] + ctm[2] * m[3],
          ctm[1] * m[2] + ctm[3] * m[3],
          ctm[0] * m[4] + ctm[2] * m[5] + ctm[4],
          ctm[1] * m[4] + ctm[3] * m[5] + ctm[5],
        ];
      }
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue;
      const name = String(args[0]);
      const image = await new Promise<{ data: unknown; width: number; height: number } | null>((resolve) =>
        (name.startsWith("g_") ? page.commonObjs : page.objs).get(name, resolve),
      );
      if (!image || !image.data || !image.width || !image.height) continue;
      const width = image.width;
      const height = image.height;
      const imgData = image.data as ArrayLike<number>;
      const channels = imgData.length / (width * height);
      if (![1, 3, 4].includes(channels)) {
        console.error(`[pdf-positions] skip image ${name} (page ${p}): unexpected channels=${channels}`);
        continue;
      }
      const png = encodePng(new Uint8Array(imgData), width, height, channels);
      const hash = createHash("sha256").update(png).digest("hex");
      const file = `${hash}.png`;
      await writeFile(join(imgDir, file), png);
      images.push({
        page: p,
        name,
        x: ctm[4],
        y: ctm[5],
        w: Math.abs(ctm[0]),
        h: Math.abs(ctm[3]),
        file,
        hash,
        width,
        height,
        channels,
      });
    }
    if (p % 50 === 0) console.error(`[pdf-positions] page ${p}/${numPages}`);
  }

  await writeFile(join(outDir, "positions.json"), JSON.stringify({ numPages, numberCells, images }));
  console.error(
    `[pdf-positions] done: ${numberCells.length} cells, ${images.length} images (${numPages} pages) -> ${outDir}`,
  );
}

// --- minimal PNG encoder (RGB/RGBA/gray, 8-bit) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, Buffer.from(data)])));
  return new Uint8Array(Buffer.concat([len, typeBuf, Buffer.from(data), crcBuf]));
}

function encodePng(data: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const colorType = channels === 4 ? 6 : channels === 3 ? 2 : 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // scanlines with filter byte 0
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(chunk("IHDR", new Uint8Array(ihdr))),
      Buffer.from(chunk("IDAT", new Uint8Array(idat))),
      Buffer.from(chunk("IEND", new Uint8Array())),
    ]),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
