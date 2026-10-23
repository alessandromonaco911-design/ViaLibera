"use client";

import { Brand } from "@/components/brand/brand";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ResultViewData } from "@/components/exam/result-view";
import type { PracticeResult } from "@/lib/practice/types";
import { QuizQuestion } from "@/components/exam/quiz-question";
import { QuestionImage } from "@/components/exam/question-image";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMobileLayout } from "./use-mobile-layout";
import { MobileIcon } from "./mobile-icon";
import styles from "./mobile-hub.module.css";

type Props = { children: ReactNode; exam?: ResultViewData; practice?: PracticeResult };
export function MobileResultEntry(props: Props) {
  const mobile = useMobileLayout();
  if (!mobile) return <div className="mobile-entry-desktop">{props.children}</div>;
  return <MobileResults exam={props.exam} practice={props.practice}/>;
}

function MobileResults({ exam, practice }: Omit<Props, "children">) {
  const router = useRouter();
  const [detail, setDetail] = useState(false), [filter, setFilter] = useState<"all" | "correct" | "errors" | "unanswered">("all"), [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const starting = useRef(false);
  const data = exam ?? practice!;
  const questions = exam ? exam.questions.map(q => ({ ...q, image: q.imageUrl ? { url: q.imageUrl, width: null, height: null } : null }))
    : practice!.answers.map(q => ({ ...q, correct: q.isCorrect }));
  const filtered = questions.filter(q => filter === "all" || filter === "correct" && q.correct || filter === "errors" && !q.correct && (!!exam || !q.unanswered) || filter === "unanswered" && q.unanswered);
  const current = filtered[Math.min(index, filtered.length - 1)];
  const title = exam ? exam.passed ? "SUPERATO" : "NON SUPERATO" : practice!.mode === "mistakes" ? "Ripasso completato" : "Allenamento completato";
  function inspect(next: typeof filter) { setFilter(next); setIndex(0); setDetail(true); }
  async function mistakes() {
    if (starting.current) return; starting.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch("/api/practice/mistakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSessionId: data.sessionId }) });
      const payload = await response.json() as { sessionId?: string; error?: { code?: string; message?: string } };
      if (payload.error?.code === "RATE_LIMITED") { setError(payload.error.message ?? "Troppi nuovi quiz. Riprova tra qualche minuto."); starting.current = false; setBusy(false); return; }
      if (!response.ok || !payload.sessionId) throw new Error("unavailable");
      router.push(`/allenamento/${payload.sessionId}`);
    } catch { starting.current = false; setBusy(false); setError("Non riesco ad avviare il ripasso. Riprova tra poco."); }
  }
  if (detail && current) return <div className="quiz-shell" data-mobile-result>
    <header className="border-b-2 bg-accent-blue px-3 py-2 flex items-center justify-between gap-3">
      <button className="min-h-12 inline-flex items-center gap-2 px-2 font-medium" onClick={() => setDetail(false)}><MobileIcon name="back"/>Riepilogo</button><span className="text-sm font-mono">{index + 1} / {filtered.length}</span>
    </header>
    <main className="quiz-stage"><div className="quiz-stage-inner"><div key={current.questionId} className="quiz-frame">
      <QuizQuestion question={{ ...current, officialQuestionCode: current.officialQuestionCode ?? null, groupCode: current.groupCode ?? null }} position={current.position} total={questions.length} onZoom={setZoom} emphasize={!!practice}>
        <div className={`mobile-answer-result ${current.correct ? "bg-success-soft" : "bg-danger-soft"}`}>
          <span>{current.unanswered ? "Non risposta" : `La tua risposta: ${current.selectedAnswer ? "VERO" : "FALSO"}`}</span>
          <strong>Risposta corretta: {current.correctAnswer ? "VERO" : "FALSO"}</strong>
        </div>
      </QuizQuestion>
    </div></div></main>
    <div className="quiz-action-bar"><div className="quiz-actions quiz-actions--practice">
      <Button variant="outline" aria-label="Risposta precedente" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>←</Button>
      <Button aria-label="Risposta successiva" disabled={index >= filtered.length - 1} onClick={() => setIndex(i => i + 1)}>Successiva →</Button>
    </div></div>
    <Dialog open={!!zoom} onClose={() => setZoom(null)} title="Immagine ingrandita" size="image">{zoom && <QuestionImage src={zoom} width={null} height={null} className="quiz-image-zoom"/>}</Dialog>
  </div>;

  return <div className={styles.app} data-mobile-result>
    <header><Link className={styles.logo} aria-label="ViaLibera · Home" href="/"><Brand /></Link><span className={styles.preview}>RISULTATO</span></header>
    <main className={styles.screen}>
      <div className={styles.heading}><h1 className={exam ? exam.passed ? "text-success" : "text-danger" : ""}>{title}</h1></div>
      <section className={`${styles.panel} ${styles.grow}`} aria-label="Riepilogo risultati">
        <div className={styles.examMetrics}>{([
          ["correct", "Corrette", data.correctCount], ["errors", "Errori", data.errorCount], ["unanswered", "Non risposte", data.unansweredCount],
        ] as const).map(([key, label, count]) => <button key={key} className={styles.metric} onClick={() => inspect(key)}><b>{count}</b><span>{label}</span></button>)}</div>
        <p className={styles.muted}>{data.totalQuestions} domande · {Math.floor(data.timeUsedSeconds / 60)} min {data.timeUsedSeconds % 60} s</p>
        {exam && <p className={styles.muted}>Massimo {exam.allowedErrors} errori. Le non risposte contano come errori.</p>}
        {detail && !current && <p role="status" className={styles.muted}>Nessuna risposta in questa categoria.</p>}
        {error && <p className={styles.errorBox} role="alert">{error}</p>}
        <div className={styles.bottomAction} style={{ display: "grid", gap: "8px" }}>
          <button className={styles.primary} onClick={() => inspect("all")}>Rivedi risposte<MobileIcon name="arrow"/></button>
          {practice && practice.errorCount > 0 && <button className={styles.primary} onClick={() => void mistakes()} disabled={busy}>{busy ? "Preparazione…" : "Ripassa gli errori"}</button>}
        </div>
      </section>
    </main>
    <nav aria-label="Navigazione risultati"><Link className={styles.navLink} href="/"><MobileIcon name="home"/><span>Home</span></Link><Link className={styles.navLink} href="/allenamento"><MobileIcon name="training"/><span>Argomenti</span></Link><Link className={styles.navLink} href="/?sezione=esame"><MobileIcon name="exam"/><span>Nuova prova</span></Link></nav>
  </div>;
}
