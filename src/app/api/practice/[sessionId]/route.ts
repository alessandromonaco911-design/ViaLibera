import { NextResponse } from "next/server";
import { getPracticeSession, getPracticeSessionQuestions, PracticeServiceError, assertPracticeSessionMode } from "@/lib/practice/service";
import { toQuestionStates } from "@/lib/practice/payload";
import { getTopic } from "@/lib/practice/generator";
import { siteConfig } from "@/config/site";
import type { PracticeStateResponse, PublicPracticeQuestion } from "@/lib/practice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * GET practice session state.
 * Never exposes correctAnswer for unverified questions: only the
 * per-question verification state (selected answer + verified + isCorrect
 * for already-verified ones) is returned.
 */
export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse<PracticeStateResponse | { error: { code: string; message: string } }>> {
  const { sessionId } = await ctx.params;
  try {
    const session = await getPracticeSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: { code: "SESSION_NOT_FOUND", message: "sessione inesistente" } }, { status: 404 });
    }
    try {
      assertPracticeSessionMode(session);
    } catch (e) {
      if (e instanceof PracticeServiceError && e.code === "NOT_PRACTICE") {
        return NextResponse.json({ error: { code: "NOT_PRACTICE", message: "sessione non di allenamento" } }, { status: 400 });
      }
      throw e;
    }

    const rows = await getPracticeSessionQuestions(sessionId);
    const topicId = session.topicId;
    const topic = topicId ? await getTopic(topicId) : { id: "", code: "", name: "" };

    const questions: PublicPracticeQuestion[] = rows.map((r) => ({
      id: r.questionId,
      position: r.position,
      statement: r.statement,
      image: r.imageRef ? { url: `/api/media/${r.imageRef}`, width: r.mediaWidth, height: r.mediaHeight } : null,
      officialQuestionCode: r.officialQuestionCode,
      groupCode: r.groupCode,
      topic: r.topic,
    }));

    const base = {
      sessionId: session.id,
      version: siteConfig.payloadVersion,
      mode: (session.mode as "practice" | "mistakes") ?? "practice",
      status: session.status === "completed" ? ("completed" as const) : ("in_progress" as const),
      topic: {
        id: topic.id,
        name: topic.name,
        code: topic.code,
        questionCount: session.totalQuestions,
        imageCount: 0,
      },
      requestedQuestionCount: session.requestedQuestionCount ?? session.totalQuestions,
      totalQuestions: session.totalQuestions,
      untimed: true as const,
      startedAt: session.startedAt.toISOString(),
      seed: session.selectionSeed,
      sourceSessionId: session.sourceSessionId,
    };

    const state: PracticeStateResponse = {
      ...base,
      questions,
      states: toQuestionStates(rows),
    };
    return NextResponse.json(state);
  } catch (e) {
    console.error("[practice:get]", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno" } }, { status: 500 });
  }
}

// keep type import used for consistency of the module interface
export type { PracticeStateResponse };
