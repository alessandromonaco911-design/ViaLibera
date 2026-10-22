import { notFound, redirect } from "next/navigation";
import { getExamSession, getSessionQuestions } from "@/lib/exam/session-service";
import { mediaUrlFor } from "@/lib/exam/payload";
import { ResultView, type ResultViewData } from "@/components/exam/result-view";
import { SiteHeader } from "@/components/ui/site-header";
import { MobileResultEntry } from "@/components/mobile/mobile-results";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RisultatoPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  let session;
  try {
    session = await getExamSession(sessionId);
  } catch (e) {
    console.error("[risultato] db error", e);
    throw e; // handled by error.tsx
  }
  if (!session) {
    notFound();
  }
  if (session.status === "in_progress") {
    redirect(`/simulazione/${sessionId}`);
  }

  const rows = await getSessionQuestions(sessionId);

  const data: ResultViewData = {
    sessionId: session.id,
    passed: session.passed ?? false,
    correctCount: session.correctCount ?? 0,
    errorCount: session.errorCount ?? 0,
    unansweredCount: session.unansweredCount ?? 0,
    totalQuestions: session.totalQuestions,
    allowedErrors: session.allowedErrors,
    timeUsedSeconds: (() => {
      const end = session.completedAt ?? session.submittedAt ?? new Date();
      return Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 1000));
    })(),
    questions: rows.map((r) => ({
      position: r.position,
      questionId: r.questionId,
      officialQuestionCode: r.officialQuestionCode,
      statement: r.statement,
      topic: r.topic,
      groupCode: r.groupCode,
      imageUrl: r.imageRef ? mediaUrlFor(r.imageRef) : null,
      selectedAnswer: r.selectedAnswer,
      correctAnswer: r.correctAnswer,
      correct: r.selectedAnswer !== null && r.selectedAnswer === r.correctAnswer,
      unanswered: r.selectedAnswer === null,
    })),
  };

  return (
    <MobileResultEntry exam={data}>
    <div className="flex min-h-viewport w-full flex-col">
      <SiteHeader mode="Risultato" />
      <div className="flex-1">
        <ResultView data={data} />
      </div>
    </div>
    </MobileResultEntry>
  );
}
