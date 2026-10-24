import test from "node:test";
import assert from "node:assert/strict";
import { applyProgressAnswer, applyProgressExam, chooseDailyAdvice, emptyProgress, localDay } from "../src/lib/progress/model";

const answer = (id: number, correct = false, question = "q1") => ({ id: `attempt-${id}`, question, topic: "Precedenze", correct, at: "2026-10-24T10:00:00Z" });
test("progress counts verified attempts once and distinguishes unique questions from retries", () => {
  let data = emptyProgress("person-a");
  data = applyProgressAnswer(data, answer(1));
  assert.equal(applyProgressAnswer(data, answer(1)), data);
  data = applyProgressAnswer(data, answer(2, true)); data = applyProgressAnswer(data, answer(3, true));
  assert.equal(data.answered, 3); assert.equal(data.correct, 2); assert.equal(Object.keys(data.questions).length, 1); assert.equal(data.recovered, 1);
  data = applyProgressAnswer(data, answer(4)); data = applyProgressAnswer(data, answer(5, true)); data = applyProgressAnswer(data, answer(6, true));
  assert.equal(data.recovered, 1);
});
test("daily advice is personal, evidence-based, stable today and different tomorrow", () => {
  let data = emptyProgress("person-a");
  assert.equal(chooseDailyAdvice(data, "2026-10-24").topic, null);
  for (let i=0; i<30; i++) data = applyProgressAnswer(data, answer(i, i%3===0));
  const today = chooseDailyAdvice(data, "2026-10-24"); data = { ...data, advice: today };
  assert.equal(today.topic, "Precedenze"); assert.equal(today.answered, 20);
  assert.deepEqual(chooseDailyAdvice(data, "2026-10-24"), today);
  const tomorrow = chooseDailyAdvice(data, "2026-10-25");
  assert.notEqual(`${tomorrow.topic}:${tomorrow.angle}`, `${today.topic}:${today.angle}`);
  assert.ok(new Set(Array.from({length:20}, (_,i) => chooseDailyAdvice({...data, profile:`person-${i}`}, "2026-10-25").angle)).size > 1);
});
test("history stays bounded and exam replays do not unlock fabricated streaks", () => {
  let data = emptyProgress("person-a");
  for (let i=0; i<4200; i++) data = applyProgressAnswer(data, answer(i, true));
  assert.equal(data.recent.length, 100); assert.equal(data.seen.length, 4096); assert.equal(data.answered, 4200);
  const exam = { id: "exam-1", passed: true, errors: 1, at: "2026-10-24T10:00:00Z" };
  data = applyProgressExam(data, exam); data = applyProgressExam(data, exam);
  assert.equal(data.exams.length, 1); assert.equal(data.achievements.includes("exams3"), false);
  data = applyProgressExam(data, {...exam,id:"exam-2"}); data = applyProgressExam(data, {...exam,id:"exam-3"});
  assert.equal(data.achievements.includes("exams3"), true);
  assert.equal(localDay(new Date(2026,9,24,23,59)), "2026-10-24");
});
