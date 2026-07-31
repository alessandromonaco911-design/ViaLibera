import { NextResponse } from "next/server";
import { completePracticeSession, PracticeServiceError } from "@/lib/practice/service";
import type { PracticeResult } from "@/lib/practice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * Complete a practice session (idempotent) and return the final summary.
 */
export async function POST(_request: Request, ctx: Ctx): Promise<NextResponse<PracticeResult | { error: { code: string; message: string } }>> {
  const { sessionId } = await ctx.params;
  try {
    const result = await completePracticeSession(sessionId);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error("[practice:complete]", e);
    if (e instanceof PracticeServiceError) {
      const status =
        e.code === "SESSION_NOT_FOUND"
          ? 404
          : e.code === "NOT_PRACTICE"
            ? 400
            : e.code === "INVALID_PAYLOAD"
              ? 400
              : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    return NextResponse.json({ error: { code: "INTERNAL", message: "errore interno nel completamento" } }, { status: 500 });
  }
}
