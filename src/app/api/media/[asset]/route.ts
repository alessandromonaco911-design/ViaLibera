import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, normalize, relative } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { isMediaUsable } from "@/lib/media/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ asset: string }> };

const ASSET_RE = /^[a-f0-9]{64}$/;
const MEDIA_ROOT = normalize(join(process.cwd(), "data", "media"));

/**
 * Controlled media serving: the URL is the asset sha256 (whitelisted via the DB).
 * No client-provided filesystem path is ever used. Only verified assets are served.
 */
export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
  const { asset } = await ctx.params;
  if (!ASSET_RE.test(asset)) {
    return NextResponse.json({ error: { code: "BAD_ASSET", message: "identificativo media non valido" } }, { status: 400 });
  }
  try {
    const rows = await db
      .select({ localPath: mediaAssets.localPath, mimeType: mediaAssets.mimeType, status: mediaAssets.verificationStatus })
      .from(mediaAssets)
      .where(eq(mediaAssets.sha256, asset))
      .limit(1);
    const media = rows[0];
    if (!media || !media.localPath) {
      console.error(`[media:404] asset non trovato nel catalogo: ${asset}`);
      return NextResponse.json({ error: { code: "MEDIA_NOT_FOUND", message: "immagine non trovata" } }, { status: 404 });
    }
    if (!media.status || !isMediaUsable(media.status)) {
      console.error(`[media:rejected] asset ${asset} con stato non utilizzabile: ${media.status}`);
      return NextResponse.json({ error: { code: "MEDIA_REJECTED", message: "immagine non disponibile" } }, { status: 404 });
    }

    // defense in depth: resolve only within data/media
    const resolved = normalize(join(process.cwd(), media.localPath));
    if (relative(MEDIA_ROOT, resolved).startsWith("..")) {
      console.error(`[media:traversal] localPath fuori da data/media per ${asset}`);
      return NextResponse.json({ error: { code: "MEDIA_NOT_FOUND", message: "immagine non trovata" } }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(resolved);
    } catch {
      console.error(`[media:missing-file] file assente per ${asset}: ${resolved}`);
      return NextResponse.json({ error: { code: "MEDIA_FILE_MISSING", message: "immagine non disponibile" } }, { status: 404 });
    }

    const mime = media.mimeType && /^image\/(png|jpeg|gif|webp)$/.test(media.mimeType) ? media.mimeType : "image/png";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[media:error]", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno" } }, { status: 500 });
  }
}
