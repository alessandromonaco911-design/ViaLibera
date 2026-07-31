import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OFFICIAL_SOURCES } from "./sources";
import { sha256File } from "./lib/hashes";
import { db, sql } from "../../src/lib/db";
import { sourceFiles } from "../../src/lib/db/schema";

const ROOT = process.cwd();
const OFFICIAL_DIR = join(ROOT, "data", "official");
const MANIFEST_DIR = join(ROOT, "data", "manifests");
const REPORT_DIR = join(ROOT, "data", "reports");

interface Manifest {
  sourceId: string;
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  downloadedAt: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  licenseCategory: string;
  sourceVersion: string | null;
  notes: string;
  verificationStatus: "verified_download" | "verified_local" | "missing";
  usageLimitations: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

const USAGE_NOTES =
  "Risorsa pubblica ufficiale del Ministero delle Infrastrutture e dei Trasporti (Portale dell'Automobilista). " +
  "Uso per esercitazioni/simulazioni: compatibile con finalità di studio; la ridistribuzione commerciale non è verificata. " +
  "Consulta le condizioni d'uso del portale prima di qualsiasi distribuzione.";

async function main() {
  await mkdir(MANIFEST_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  const manifests: Manifest[] = [];
  for (const src of OFFICIAL_SOURCES) {
    const localPath = join(OFFICIAL_DIR, src.localFilename);
    if (!existsSync(localPath)) {
      manifests.push({
        sourceId: src.id,
        title: src.title,
        url: src.downloadUrl,
        domain: domainOf(src.downloadUrl),
        publishedAt: src.publishedAt,
        downloadedAt: new Date().toISOString(),
        filename: src.localFilename,
        mimeType: "unknown",
        size: 0,
        sha256: "",
        licenseCategory: src.licenseCategory,
        sourceVersion: src.sourceVersion,
        notes: src.notes,
        verificationStatus: "missing",
        usageLimitations: USAGE_NOTES,
      });
      console.error(`[missing] ${src.localFilename}`);
      continue;
    }
    const sha = await sha256File(localPath);
    const meta = await stat(localPath);
    const head = await readFile(localPath).then((b) => b.subarray(0, 8).toString("latin1"));
    const mime = head.startsWith("%PDF") ? "application/pdf" : head.startsWith("PK") ? "application/zip" : "application/octet-stream";

    const manifest: Manifest = {
      sourceId: src.id,
      title: src.title,
      url: src.downloadUrl,
      domain: domainOf(src.downloadUrl),
      publishedAt: src.publishedAt,
      downloadedAt: new Date().toISOString(),
      filename: src.localFilename,
      mimeType: mime,
      size: meta.size,
      sha256: sha,
      licenseCategory: src.licenseCategory,
      sourceVersion: src.sourceVersion,
      notes: src.notes,
      verificationStatus: "verified_local",
      usageLimitations: USAGE_NOTES,
    };
    manifests.push(manifest);
    await writeFile(join(MANIFEST_DIR, `${src.id}.json`), JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`[ok] ${src.localFilename} ${mime} ${meta.size} bytes sha256=${sha.slice(0, 16)}…`);
  }

  await writeFile(join(REPORT_DIR, "sources-audit.json"), JSON.stringify(manifests, null, 2), "utf-8");

  // --- register provenance in DB (source_files only, no question import) ---
  for (const m of manifests) {
    if (m.sha256 === "") continue;
    await db
      .insert(sourceFiles)
      .values({
        sourceType: "quiz_listing",
        sourceUrl: m.url,
        originalFilename: m.filename,
        localPath: join(OFFICIAL_DIR, m.filename),
        mimeType: m.mimeType,
        sha256: m.sha256,
        downloadedAt: new Date(m.downloadedAt),
        publishedAt: m.publishedAt ? new Date(m.publishedAt) : null,
        sourceVersion: m.sourceVersion,
        metadata: { title: m.title, domain: m.domain, notes: m.notes, usageLimitations: m.usageLimitations },
      })
      .onConflictDoNothing({ target: [sourceFiles.sha256] });
  }

  console.log("\nManifests written to", MANIFEST_DIR);
  console.log("Report written to", join(REPORT_DIR, "sources-audit.json"));
  console.log("source_files rows upserted (skip if duplicate sha256).");

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
