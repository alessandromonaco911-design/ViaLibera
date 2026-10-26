import { notFound, redirect } from "next/navigation";
import { getPracticeSession, getPracticeSessionQuestions } from "@/lib/practice/service";
import { getTopic } from "@/lib/practice/generator";
import { toPublicPracticeQuestion } from "@/lib/practice/payload";
import { getPracticeExplanation } from "@/lib/practice/explanations";
import { PracticeRunner } from "@/components/practice/practice-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PracticeSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  let session;
  try {
    session = await getPracticeSession(sessionId);
  } catch (e) {
    console.error("[allenamento] db error", e);
    throw e; // handled by error.tsx
  }
  if (!session) notFound();
  if (!["practice", "mistakes"].includes(session.mode)) {
    // a simulation session reached via the practice URL is not valid here
    redirect("/simulazione/" + sessionId);
  }
  if (session.status === "completed" || session.practiceStatus === "completed") {
    redirect(`/allenamento/${sessionId}/risultato`);
  }

  const [rows, topic] = await Promise.all([
    getPracticeSessionQuestions(sessionId),
    session.topicId ? getTopic(session.topicId) : Promise.resolve({ id: "", code: "", name: "" }),
  ]);
  const questions = rows.map((r) =>
    toPublicPracticeQuestion(
      {
        id: r.questionId,
        groupCode: r.groupCode,
        imageRef: r.imageRef,
        mediaStatus: r.imageRef ? "structurally_verified" : null,
        statement: r.statement,
        correctAnswer: r.correctAnswer,
        officialQuestionCode: r.officialQuestionCode,
        topicId: session.topicId,
        topicName: r.topic,
        mediaLocalPath: r.mediaLocalPath,
        mediaMime: r.mediaMime,
        mediaWidth: r.mediaWidth,
        mediaHeight: r.mediaHeight,
      },
      r.position,
    ),
  );


  return (
    <PracticeRunner
      key={session.id}
      sessionId={session.id}
      version={1}
      mode={session.mode as "practice" | "mistakes"}
      topicName={topic.name}
      continuous={session.requestedQuestionCount === 0}
      answeredBefore={session.requestedQuestionCount === 0 ? (session.correctCount??0)+(session.errorCount??0) : 0}
      totalQuestions={session.totalQuestions}
      startedAt={session.startedAt.toISOString()}
      seed={session.selectionSeed}
      sourceSessionId={session.sourceSessionId}
      questions={questions}
      initialStates={rows.map((r) => ({
        attemptId: r.answerVerified ? r.sessionQuestionId : undefined,
        verifiedAt: r.verifiedAt?.toISOString(),
        questionId: r.questionId,
        position: r.position,
        selectedAnswer: r.selectedAnswer,
        verified: r.answerVerified === true,
        isCorrect: r.answerVerified === true ? r.selectedAnswer !== null && r.selectedAnswer === r.correctAnswer : null,
        explanation: r.answerVerified === true ? getPracticeExplanation(r) : null,
      }))}
    />
  );
}
