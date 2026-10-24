import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceContinuousPractice, PracticeServiceError } from "@/lib/practice/service";
import { GET } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, ctx: {params:Promise<{sessionId:string}>}) {
  const {sessionId} = await ctx.params;
  try {
    const input = z.object({seed:z.number().int().min(1).max(2147483647)}).safeParse(await request.json().catch(()=>null));
    if (!input.success) return NextResponse.json({error:{code:"INVALID_PAYLOAD",message:"Blocco non valido."}},{status:400});
    await advanceContinuousPractice(sessionId,input.data.seed);
    const response = await GET(request,ctx); response.headers.set("Cache-Control","no-store"); return response;
  } catch(error) {
    if (error instanceof PracticeServiceError) return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.code === "SESSION_NOT_FOUND" ? 404 : 409});
    console.error("[practice:next]",error);
    return NextResponse.json({error:{code:"INTERNAL",message:"Non riesco a caricare le prossime domande. Riprova."}},{status:500});
  }
}
