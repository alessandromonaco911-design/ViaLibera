import { activeCatalog } from "../../config/catalog";

export interface ProgressAnswer { id: string; question: string; topic: string; correct: boolean; at: string }
export interface QuestionProgress { correct: number; wrong: number; streak: number; recovered: boolean }
export interface ProgressExam { id: string; passed: boolean; errors: number; at: string }
export interface DailyAdvice { day: string; topic: string | null; angle: number; errors: number; answered: number }
export interface ProgressData {
  version: 1; catalog: string; profile: string; seen: string[];
  questions: Record<string, QuestionProgress>; recent: ProgressAnswer[]; exams: ProgressExam[];
  answered: number; correct: number; recovered: number; achievements: string[]; advice?: DailyAdvice;
}
export const adviceAngles = [
  "Rivedi la regola dietro agli errori, poi riprova.",
  "Cerca parole come «sempre», «solo» e «mai» prima di rispondere.",
  "Spiega a voce la tua scelta, poi confrontala con la spiegazione.",
  "Rivedi un errore recente, poi prova nuove domande sullo stesso tema.",
  "Leggi tutta la frase, senza fretta, prima di scegliere.",
  "Se c’è una figura, osservane i dettagli prima di rispondere.",
  "Riparti dalla regola: ricordare solo la risposta non basta.",
] as const;

export function emptyProgress(profile: string): ProgressData {
  return { version: 1, catalog: activeCatalog.id, profile, seen: [], questions: {}, recent: [], exams: [], answered: 0, correct: 0, recovered: 0, achievements: [] };
}
export function readProgress(value: unknown, profile: string): ProgressData {
  const data = value as Partial<ProgressData> | null;
  if (!data || data.version !== 1 || data.catalog !== activeCatalog.id || !data.questions || !Array.isArray(data.recent) || !Array.isArray(data.exams) || !Array.isArray(data.seen) || !Array.isArray(data.achievements) || typeof data.profile !== "string" || typeof data.answered !== "number" || typeof data.correct !== "number" || typeof data.recovered !== "number") return emptyProgress(profile);
  return data as ProgressData;
}
function unlock(data: ProgressData): ProgressData {
  const keys = [...data.achievements];
  const add = (key: string, yes: boolean) => { if (yes && !keys.includes(key)) keys.push(key); };
  const unique = Object.keys(data.questions).length;
  let streak = 0; for (const exam of [...data.exams].reverse()) { if (!exam.passed) break; streak++; }
  add("first100", unique >= 100); add("recovered10", data.recovered >= 10);
  add("exams3", streak >= 3); add("unique500", unique >= 500);
  return { ...data, achievements: keys };
}
/** Only verified attempts enter analytics. Replays are deduplicated; local history stays bounded. */
export function applyProgressAnswer(data: ProgressData, answer: ProgressAnswer): ProgressData {
  if (data.seen.includes(answer.id)) return data;
  if (data.recent.length === 100 && answer.at < data.recent[0].at) return data;
  const previous = data.questions[answer.question] ?? { correct: 0, wrong: 0, streak: 0, recovered: false };
  const streak = answer.correct ? previous.streak + 1 : 0;
  const recovered = previous.recovered || previous.wrong > 0 && streak >= 2;
  const questions = { ...data.questions, [answer.question]: { correct: previous.correct + Number(answer.correct), wrong: previous.wrong + Number(!answer.correct), streak, recovered } };
  // The current catalogue has 7,020 unique codes; guard damaged/foreign input too.
  if (Object.keys(questions).length > activeCatalog.questionCount) delete questions[Object.keys(questions)[0]];
  return unlock({ ...data, questions, seen: [...data.seen, answer.id].slice(-4096), recent: [...data.recent, answer].sort((a,b)=>a.at.localeCompare(b.at)).slice(-100), answered: data.answered + 1, correct: data.correct + Number(answer.correct), recovered: data.recovered + Number(recovered && !previous.recovered) });
}
export function applyProgressExam(data: ProgressData, exam: ProgressExam): ProgressData {
  if (data.exams.some(item => item.id === exam.id)) return data;
  if (data.exams.length === 20 && exam.at < data.exams[0].at) return data;
  return unlock({ ...data, exams: [...data.exams, exam].slice(-20) });
}
export function weakTopics(data: ProgressData) {
  const names = [...new Set(data.recent.map(answer => answer.topic))];
  return names.map(topic => {
    const answers = data.recent.filter(answer => answer.topic === topic).slice(-20);
    return { topic, answered: answers.length, errors: answers.filter(answer => !answer.correct).length };
  }).filter(item => item.errors > 0).sort((a, b) => b.errors / (b.answered + 5) - a.errors / (a.answered + 5) || b.errors - a.errors || a.topic.localeCompare(b.topic));
}
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function hash(text: string) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; }
/** Stable during the day, personal to this installation; a new day avoids yesterday's exact advice. */
export function chooseDailyAdvice(data: ProgressData, day: string): DailyAdvice {
  const candidates = weakTopics(data).filter(item => item.answered >= 5).slice(0, 3);
  const ready = data.answered >= 10 && candidates.length > 0;
  if (data.advice?.day === day && (data.advice.topic !== null || !ready)) return data.advice;
  const seed = hash(`${data.profile}:${day}`);
  const target = ready ? candidates[seed % candidates.length] : null;
  let angle = seed % adviceAngles.length;
  if (data.advice && data.advice.day !== day && data.advice.topic === (target?.topic ?? null) && data.advice.angle === angle) angle = (angle + 1) % adviceAngles.length;
  return { day, topic: target?.topic ?? null, angle, errors: target?.errors ?? 0, answered: target?.answered ?? 0 };
}
