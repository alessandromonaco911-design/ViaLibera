import test from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/lib/db";
import { getImportedCatalogId } from "../src/lib/exam/generator";
import { listPracticeTopics } from "../src/lib/practice/generator";
import { createPracticeSession, advanceContinuousPractice, verifyPracticeAnswer, getPracticeSession, getPracticeSessionQuestions, completePracticeSession, computePracticeSummary, PracticeServiceError } from "../src/lib/practice/service";

test("continuous practice reuses one bounded session, locks concurrent answers and advances idempotently", async () => {
  const catalog = await getImportedCatalogId(); assert.ok(catalog);
  const topic = (await listPracticeTopics(catalog)).find(topic=>topic.questionCount>=30); assert.ok(topic);
  const created = await createPracticeSession({catalogVersionId:catalog,topicId:topic.id,questionCount:10,seed:1900,continuous:true,environment:"test"});
  const id = created.session.id;
  try {
    assert.equal(created.session.requestedQuestionCount,0);
    await assert.rejects(advanceContinuousPractice(id,1900), (error: unknown)=>error instanceof PracticeServiceError && error.code==="INVALID_PAYLOAD");
    const first = created.questions[0];
    const parallel = await Promise.allSettled([true,false].map(selectedAnswer=>verifyPracticeAnswer(id,{questionId:first.id,selectedAnswer,seed:1900})));
    assert.equal(parallel.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(parallel.filter(result=>result.status==="rejected").length,1);
    await sql`update exam_session_questions e set selected_answer=q.correct_answer,answer_verified=true,verified_at=now() from questions q where e.question_id=q.id and e.session_id=${id} and e.answer_verified is distinct from true`;
    const counts = computePracticeSummary(await getPracticeSessionQuestions(id));
    await Promise.all([advanceContinuousPractice(id,1900),advanceContinuousPractice(id,1900)]);
    const current = await getPracticeSession(id); assert.ok(current);
    assert.equal(current.selectionSeed,1901); assert.equal(current.correctCount,counts.correctCount); assert.equal(current.errorCount,counts.errorCount);
    const rows = await getPracticeSessionQuestions(id); assert.equal(rows.length,10);
    assert.equal(rows.some(row=>created.questions.some(question=>question.id===row.questionId)),false);
    await advanceContinuousPractice(id,1900);
    assert.equal((await getPracticeSession(id))!.selectionSeed,1901);
    await assert.rejects(verifyPracticeAnswer(id,{questionId:rows[0].questionId,selectedAnswer:true,seed:1900}));
    const verified = await verifyPracticeAnswer(id,{questionId:rows[0].questionId,selectedAnswer:rows[0].correctAnswer,seed:1901});
    const replay = await verifyPracticeAnswer(id,{questionId:rows[0].questionId,selectedAnswer:rows[0].correctAnswer,seed:1901});
    assert.deepEqual(replay,verified);
    const result = await completePracticeSession(id);
    assert.equal(result.totalQuestions,11); assert.equal(result.correctCount,counts.correctCount+1); assert.equal(result.errorCount,counts.errorCount); assert.equal(result.unansweredCount,0);
    assert.deepEqual(await completePracticeSession(id),result);
    assert.equal(result.answers.length,1);
    await assert.rejects(advanceContinuousPractice(id,1901));
  } finally { await sql`delete from exam_sessions where id=${id}`; }
});
