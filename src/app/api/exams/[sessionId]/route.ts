import { NextResponse } from "next/server";
import { siteConfig } from "@/config/site";
import { getExamSession, getSessionQuestions } from "@/lib/exam/session-service";
import { mediaUrlFor } from "@/lib/exam/payload";
import type { ExamStateResponse } from "@/lib/exam/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
  const { sessionId } = await ctx.params;
  try {
    const session = await getExamSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: { code: "SESSION_NOT_FOUND", message: "sessione inesistente" } }, { status: 404 });
    }
    if (session.mode !== "simulation") {
      return NextResponse.json({ error: { code: "NOT_EXAM_SESSION", message: "sessione non valida per la simulazione d'esame" } }, { status: 400 });
    }
    const rows = await getSessionQuestions(sessionId);

    const questions = rows.map((r) => {
      const url = r.imageRef ? mediaUrlFor(r.imageRef) : null;
      return {
        id: r.questionId,
        position: r.position,
        statement: r.statement,
        image: url ? { url, width: null, height: null } : null,
        officialQuestionCode: r.officialQuestionCode,
        groupCode: r.groupCode,
        topic: r.topic,
      };
    });

    const state: ExamStateResponse = {
      sessionId: session.id,
      version: siteConfig.payloadVersion,
      status: (session.status as ExamStateResponse["status"]) ?? "in_progress",
      totalQuestions: session.totalQuestions,
      allowedErrors: session.allowedErrors,
      durationSeconds: session.durationSeconds,
      startedAt: session.startedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      seed: session.selectionSeed,
      questions,
      answers: rows.map((r) => ({ position: r.position, selectedAnswer: r.selectedAnswer, flagged: r.flagged })),
    };
    return NextResponse.json(state);
  } catch (e) {
    console.error("[exam:get]", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno" } }, { status: 500 });
  }
}
