import { notFound, redirect } from "next/navigation";
import { getExamSession, getSessionQuestions } from "@/lib/exam/session-service";
import { siteConfig } from "@/config/site";
import { mediaUrlFor } from "@/lib/exam/payload";
import { ExamRunner } from "@/components/exam/exam-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SimulationPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  let session;
  try {
    session = await getExamSession(sessionId);
  } catch (e) {
    console.error("[simulazione] db error", e);
    throw e; // handled by error.tsx
  }

  if (!session) {
    notFound();
  }

  if (session.status !== "in_progress") {
    redirect(`/simulazione/${sessionId}/risultato`);
  }

  const rows = await getSessionQuestions(sessionId);
  const questions = rows.map((r) => ({
    id: r.questionId,
    position: r.position,
    statement: r.statement,
    image: r.imageRef ? { url: mediaUrlFor(r.imageRef)!, width: null, height: null } : null,
    officialQuestionCode: r.officialQuestionCode,
    groupCode: r.groupCode,
    topic: r.topic,
  }));

  return (
    <ExamRunner
      sessionId={session.id}
      version={siteConfig.payloadVersion}
      startedAt={session.startedAt.toISOString()}
      expiresAt={session.expiresAt.toISOString()}
      totalQuestions={session.totalQuestions}
      allowedErrors={session.allowedErrors}
      questions={questions}
    />
  );
}
