import { NextResponse } from "next/server";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalogId = await getImportedCatalogId();
    return NextResponse.json({ topics: catalogId ? await listPracticeTopics(catalogId) : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[practice:topics]", error);
    return NextResponse.json({ error: "Le categorie non sono disponibili. Riprova tra poco." }, { status: 503 });
  }
}
