import { NextResponse } from "next/server";
import { submitExamSession, ExamSubmissionError } from "@/lib/exam/session-service";
import type { ExamResult } from "@/lib/exam/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, ctx: Ctx): Promise<NextResponse> {
  const { sessionId } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "corpo della richiesta non valido" } }, { status: 400 });
  }
  try {
    const { result, alreadySubmittedSame } = await submitExamSession(sessionId, body);
    return NextResponse.json({ result, alreadySubmittedSame } satisfies { result: ExamResult; alreadySubmittedSame: boolean }, {
      status: alreadySubmittedSame ? 200 : 200,
    });
  } catch (e) {
    if (e instanceof ExamSubmissionError) {
      const status =
        e.code === "SESSION_NOT_FOUND" ? 404 : e.code === "ALREADY_SUBMITTED" ? 409 : e.code === "EXPIRED" ? 410 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    console.error("[exam:submit]", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno nella consegna" } }, { status: 500 });
  }
}
