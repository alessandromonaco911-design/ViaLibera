import { NextResponse } from "next/server";
import { verifyPracticeAnswer, PracticeServiceError } from "@/lib/practice/service";
import type { AnswerCheckResult } from "@/lib/practice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * Verify a SINGLE answer server-side.
 * Returns { questionId, selectedAnswer, correctAnswer, isCorrect } — the only
 * endpoint that ever reveals a solution. Idempotent for the same answer;
 * after verification the answer is locked.
 */
export async function POST(request: Request, ctx: Ctx): Promise<NextResponse<AnswerCheckResult | { error: { code: string; message: string } }>> {
  const { sessionId } = await ctx.params;
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_JSON", message: "corpo della richiesta non valido" } }, { status: 400 });
    }
    const result = await verifyPracticeAnswer(sessionId, body);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error("[practice:answer]", e);
    if (e instanceof PracticeServiceError) {
      const status =
        e.code === "SESSION_NOT_FOUND"
          ? 404
          : e.code === "QUESTION_NOT_IN_SESSION"
            ? 404
            : e.code === "ALREADY_VERIFIED"
              ? 409
              : e.code === "SESSION_COMPLETED"
                ? 409
                : e.code === "INVALID_PAYLOAD"
                  ? 400
                  : e.code === "NOT_PRACTICE"
                    ? 400
                    : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno nella verifica" } }, { status: 500 });
  }
}
