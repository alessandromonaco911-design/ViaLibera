import { NextResponse } from "next/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { generateExamQuestions, getImportedCatalogId, isValidSeed, ExamGenerationError } from "@/lib/exam/generator";
import { createExamSession } from "@/lib/exam/session-service";
import { buildPublicPayload } from "@/lib/exam/payload";
import type { PublicExamPayload } from "@/lib/exam/types";
import { reserveSessionCreation, withCreationCookie, creationLimitResponse } from "@/lib/security/session-creation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  seed: z.number().int().min(siteConfig.selection.seedMin).max(siteConfig.selection.seedMax).optional(),
  /** only honored outside production; production always tags 'production' */
  environment: z.enum(["development", "test"]).optional(),
});

export async function POST(request: Request): Promise<NextResponse<PublicExamPayload | { error: { code: string; message: string } }>> {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_JSON", message: "corpo della richiesta non valido" } }, { status: 400 });
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_SEED", message: `seed non valido: ${parsed.error.issues.map((i) => i.message).join(",")}` } },
        { status: 400 },
      );
    }
    const seed = parsed.data.seed ?? Math.floor(Math.random() * siteConfig.selection.seedMax) + 1;
    if (!isValidSeed(seed)) {
      return NextResponse.json({ error: { code: "INVALID_SEED", message: "seed fuori intervallo" } }, { status: 400 });
    }
    const environment =
      process.env.NODE_ENV === "production"
        ? "production"
        : parsed.data.environment === "test"
          ? "test"
          : "development";

    const clientId = await reserveSessionCreation(request);
    const catalogId = await getImportedCatalogId();
    if (!catalogId) {
      return NextResponse.json({ error: { code: "CATALOG_NOT_IMPORTED", message: "catalogo ufficiale non importato" } }, { status: 503 });
    }

    const { questions } = await generateExamQuestions(catalogId, seed, siteConfig.exam.totalQuestions);
    const { session } = await createExamSession({ catalogVersionId: catalogId, seed, questions, environment });

    const payload = buildPublicPayload({
      sessionId: session.id,
      status: "in_progress",
      seed,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      questions,
    });
    return withCreationCookie(NextResponse.json(payload, { status: 201 }), clientId);
  } catch (e) {
    const limited = creationLimitResponse(e);
    if (limited) return limited;
    console.error("[exam:create]", e);
    if (e instanceof ExamGenerationError) {
      return NextResponse.json({ error: { code: "INSUFFICIENT_CATALOG", message: e.message } }, { status: 503 });
    }
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno nella creazione della simulazione" } }, { status: 500 });
  }
}
