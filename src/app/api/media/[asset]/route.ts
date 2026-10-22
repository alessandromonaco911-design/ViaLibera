import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { isMediaUsable } from "@/lib/media/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ asset: string }> };

const ASSET_RE = /^[a-f0-9]{64}$/;

/**
 * Controlled media serving: the URL is the asset sha256 (whitelisted via the DB).
 * No client-provided filesystem path is ever used. Only verified assets are served.
 */
export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
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

    // Compatibility for old saved payloads; runtime never reads extraction folders.
    return NextResponse.redirect(new URL(`/media/questions/${asset}.png`, request.url), 307);
  } catch (e) {
    console.error("[media:error]", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno" } }, { status: 500 });
  }
}
