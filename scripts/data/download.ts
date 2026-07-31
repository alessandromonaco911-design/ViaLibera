import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { OFFICIAL_SOURCES } from "./sources";
import { sha256File } from "./lib/hashes";

const ROOT = process.cwd();
const OFFICIAL_DIR = join(ROOT, "data", "official");
const MANIFEST_DIR = join(ROOT, "data", "manifests");
const TMP_SUFFIX = ".part";

interface DownloadResult {
  sourceId: string;
  localPath: string;
  status: "downloaded" | "already_present" | "error";
  sha256?: string;
  size?: number;
  mime?: string;
  error?: string;
}

async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

async function download(url: string, dest: string): Promise<string> {
  const tmp = dest + TMP_SUFFIX;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(tmp, buf);
  await rename(tmp, dest);
  return res.headers.get("content-type") ?? "application/octet-stream";
}

async function manifestHash(sourceId: string): Promise<string | null> {
  const p = join(MANIFEST_DIR, `${sourceId}.json`);
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(await readFile(p, "utf-8"));
    return typeof m.sha256 === "string" ? m.sha256 : null;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(OFFICIAL_DIR, { recursive: true });
  await mkdir(MANIFEST_DIR, { recursive: true });
  const results: DownloadResult[] = [];

  for (const src of OFFICIAL_SOURCES) {
    const dest = join(OFFICIAL_DIR, src.localFilename);
    const result: DownloadResult = { sourceId: src.id, localPath: dest, status: "error" };
    try {
      if (existsSync(dest)) {
        const onDisk = await sha256File(dest);
        const known = await manifestHash(src.id);
        if (known === null || known === onDisk) {
          result.status = "already_present";
          result.sha256 = onDisk;
          result.size = await fileSize(dest);
          console.log(`[skip] ${src.localFilename} already present (${onDisk.slice(0, 12)}…)`);
        } else {
          console.warn(
            `[warn] ${src.localFilename} on disk (${onDisk.slice(0, 12)}…) differs from manifest (${known.slice(0, 12)}…); re-downloading.`,
          );
          result.mime = await download(src.downloadUrl, dest);
          result.sha256 = await sha256File(dest);
          result.size = await fileSize(dest);
          result.status = "downloaded";
        }
      } else {
        console.log(`[get] ${src.localFilename} <- ${src.downloadUrl}`);
        result.mime = await download(src.downloadUrl, dest);
        result.sha256 = await sha256File(dest);
        result.size = await fileSize(dest);
        result.status = "downloaded";
      }
    } catch (err) {
      result.status = "error";
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`[error] ${src.localFilename}: ${result.error}`);
    }
    results.push(result);
  }

  console.log("\n=== DOWNLOAD SUMMARY ===");
  for (const r of results) {
    console.log(`  ${r.sourceId}: ${r.status}${r.sha256 ? ` (${r.sha256.slice(0, 16)}…)` : ""}`);
  }
  if (results.some((r) => r.status === "error")) {
    console.error("Some downloads failed.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
