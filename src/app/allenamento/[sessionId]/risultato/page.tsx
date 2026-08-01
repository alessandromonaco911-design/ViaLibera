import { notFound } from "next/navigation";
import { getPracticeSession, getPracticeSessionQuestions } from "@/lib/practice/service";
import { getTopic } from "@/lib/practice/generator";
import { buildPracticeResult } from "@/lib/practice/service";
import { PracticeResultView } from "@/components/practice/practice-result-view";
import { SiteHeader } from "@/components/ui/site-header";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PracticeResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  let session;
  try {
    session = await getPracticeSession(sessionId);
  } catch (e) {
    console.error("[allenamento:risultato] db error", e);
    throw e; // handled by error.tsx
  }
  if (!session) notFound();
  if (!["practice", "mistakes"].includes(session.mode)) notFound();
  if (session.status !== "completed" && session.practiceStatus !== "completed") {
    // not completed yet -> back to the runner
    const { redirect } = await import("next/navigation");
    redirect(`/allenamento/${sessionId}`);
  }

  const rows = await getPracticeSessionQuestions(sessionId);
  const result = buildPracticeResult(session, rows);
  const topic = session.topicId ? await getTopic(session.topicId).catch(() => ({ id: "", code: "", name: "" })) : { id: "", code: "", name: "" };

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <SiteHeader mode="Risultato" />
      <div className="flex-1">
        <PracticeResultView result={result} topicName={topic.name || (rows[0]?.topic ?? "")} />
      </div>
    </div>
  );
}
