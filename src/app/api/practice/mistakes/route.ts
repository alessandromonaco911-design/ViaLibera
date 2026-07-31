import { NextResponse } from "next/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { getImportedCatalogId, isValidSeed } from "@/lib/exam/generator";
import { createMistakesSession, PracticeServiceError } from "@/lib/practice/service";
import { buildPublicPracticePayload } from "@/lib/practice/payload";
import { PracticeGenerationError } from "@/lib/practice/generator";
import type { PublicPracticePayload } from "@/lib/practice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mistakesSchema = z.object({
  sourceSessionId: z.string().uuid(),
  seed: z.number().int().min(siteConfig.selection.seedMin).max(siteConfig.selection.seedMax).optional(),
  /** only honored outside production */
  environment: z.enum(["development", "test"]).optional(),
});

/**
 * Create a mistakes (ripasso errori) session from a COMPLETED practice session.
 * Includes only the questions answered incorrectly in the source session.
 */
export async function POST(request: Request): Promise<NextResponse<PublicPracticePayload | { error: { code: string; message: string } }>> {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_JSON", message: "corpo della richiesta non valido" } }, { status: 400 });
    }
    const parsed = mistakesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: `payload non valido: ${parsed.error.issues.map((i) => i.message).join(",")}` } },
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

    const catalogId = await getImportedCatalogId();
    if (!catalogId) {
      return NextResponse.json({ error: { code: "CATALOG_NOT_IMPORTED", message: "catalogo ufficiale non importato" } }, { status: 503 });
    }

    const { session, questions, topic } = await createMistakesSession({
      sourceSessionId: parsed.data.sourceSessionId,
      seed,
      environment,
    });

    const payload = buildPublicPracticePayload({
      sessionId: session.id,
      mode: "mistakes",
      status: "in_progress",
      topic,
      requestedQuestionCount: session.totalQuestions,
      totalQuestions: session.totalQuestions,
      startedAt: session.startedAt,
      seed,
      sourceSessionId: parsed.data.sourceSessionId,
      questions,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (e) {
    console.error("[practice:mistakes]", e);
    if (e instanceof PracticeGenerationError) {
      return NextResponse.json({ error: { code: "INSUFFICIENT_QUESTIONS", message: e.message } }, { status: 422 });
    }
    if (e instanceof PracticeServiceError) {
      const status =
        e.code === "SESSION_NOT_FOUND"
          ? 404
          : e.code === "SOURCE_NOT_COMPLETED"
            ? 409
            : e.code === "NO_MISTAKES"
              ? 422
              : e.code === "NOT_PRACTICE"
                ? 400
                : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno nella creazione del ripasso" } }, { status: 500 });
  }
}
