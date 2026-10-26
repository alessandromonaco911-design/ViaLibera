"use client";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand/brand";
import type { ResultViewData } from "@/components/exam/result-view";
import type { PracticeResult } from "@/lib/practice/types";
import { QuestionImage } from "@/components/exam/question-image";
import { Dialog } from "@/components/ui/dialog";
import { useMobileLayout } from "./use-mobile-layout";
import { MobileIcon } from "./mobile-icon";
import styles from "./mobile-hub.module.css";
import r from "./mobile-results.module.css";

type Props = { children: ReactNode; exam?: ResultViewData; practice?: PracticeResult };
type Filter = "all" | "correct" | "errors" | "unanswered";
export function MobileResultEntry(props: Props) {
  const mobile = useMobileLayout();
  if (!mobile) return <div className="mobile-entry-desktop">{props.children}</div>;
  return <MobileResults exam={props.exam} practice={props.practice}/>;
}
function MobileResults({ exam, practice }: Omit<Props, "children">) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [zoom, setZoom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const starting = useRef(false), list = useRef<HTMLDivElement>(null);
  const data = exam ?? practice!;
  const wrongCount = exam ? data.errorCount - data.unansweredCount : data.errorCount;
  const questions = exam ? exam.questions.map(q => ({ ...q, image: q.imageUrl ? { url: q.imageUrl, width: null, height: null } : null })) : practice!.answers.map(q => ({ ...q, position: q.position + (practice!.continuous ? data.totalQuestions - practice!.answers.length : 0), correct: q.isCorrect }));
  const matches = (q: typeof questions[number], key: Filter) => key === "all" || key === "correct" && q.correct || key === "errors" && !q.correct && !q.unanswered || key === "unanswered" && q.unanswered;
  const filtered = questions.filter(q => matches(q, filter));
  const title = exam ? exam.passed ? "Esame superato" : "Esame da riprovare" : practice!.mode === "mistakes" ? "Ripasso completato" : "Allenamento completato";
  function inspect(next: Filter) { setFilter(next); list.current?.scrollTo({top:0}); }
  async function mistakes() {
    if (starting.current) return;
    starting.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch("/api/practice/mistakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSessionId: data.sessionId }) });
      const payload = await response.json() as { sessionId?: string; error?: { message?: string } };
      if (!response.ok || !payload.sessionId) throw new Error(payload.error?.message ?? "Non riesco ad avviare il ripasso. Riprova tra poco.");
      router.push(`/allenamento/${payload.sessionId}`);
    } catch (reason) { starting.current = false; setBusy(false); setError(reason instanceof Error ? reason.message : "Connessione non disponibile. Riprova."); }
  }
  return <div className={styles.app} data-mobile-result>
    <header><Link className={styles.logo} aria-label="ViaLibera · Home" href="/"><Brand /></Link><span className={styles.preview}>RISULTATO</span></header>
    <main className={r.main}>
      <div className={r.summary}><h1>{title}</h1><p>{data.totalQuestions} {data.totalQuestions === 1 ? "domanda" : "domande"} · {Math.floor(data.timeUsedSeconds / 60)} min {data.timeUsedSeconds % 60} s</p>
        <div className={r.totals} aria-label="Riepilogo risultati"><span><b>{data.correctCount}</b> {data.correctCount === 1 ? "corretta" : "corrette"}</span><span><b>{wrongCount}</b> {wrongCount === 1 ? "errata" : "errate"}</span><span><b>{data.unansweredCount}</b> {data.unansweredCount === 1 ? "non risposta" : "non risposte"}</span></div>
        {exam && <p className={r.note}>{data.errorCount} errori totali su {exam.allowedErrors} ammessi, incluse le non risposte.</p>}
        {practice?.continuous && <p className={r.note}>Totali dell’intera sessione. Qui sotto l’ultimo blocco di risposte.</p>}
      </div>
      <div className={r.review}>
        <div className={r.filters} role="group" aria-label="Filtra risposte">{([["all","Tutte"],["errors","Errate"],["correct","Esatte"],["unanswered","Saltate"]] as const).map(([key,label]) => <button key={key} aria-pressed={filter === key} onClick={() => inspect(key)}>{label} <b>{questions.filter(q=>matches(q,key)).length}</b></button>)}</div>
        <div ref={list} className={r.list} role="region" aria-label="Domande e risposte" tabIndex={0}>
          {filtered.length ? <ol>{filtered.map(q => <li key={q.questionId} className={r.question} data-outcome={q.unanswered ? "unanswered" : q.correct ? "correct" : "error"}>
            <div className={r.questionTop}><span>Domanda {q.position}</span><strong>{q.unanswered ? "— Non risposta" : q.correct ? "✓ Esatta" : "✕ Errata"}</strong></div>
            <div className={r.statement}><p>{q.statement}</p>{q.image && <button className={r.thumbnail} aria-label={`Ingrandisci immagine domanda ${q.position}`} onClick={()=>setZoom(q.image!.url)}><QuestionImage {...q.image} src={q.image.url}/></button>}</div>
            <dl className={r.answers}><div><dt>La tua risposta</dt><dd>{q.unanswered ? "Non data" : q.selectedAnswer ? "VERO" : "FALSO"}</dd></div><div><dt>Soluzione</dt><dd>{q.correctAnswer ? "VERO" : "FALSO"}</dd></div></dl>
          </li>)}</ol> : <div className={r.empty} role="status"><strong>{filter === "errors" ? "Nessuna risposta errata." : filter === "unanswered" ? "Nessuna domanda saltata." : "Nessuna risposta in questa categoria."}</strong><button onClick={()=>inspect("all")}>Mostra tutte le risposte</button></div>}
        </div>
      </div>
      <div className={r.actions}>{practice && !practice.continuous && practice.errorCount > 0 ? <button onClick={()=>void mistakes()} disabled={busy} aria-busy={busy}>{busy ? "Prepariamo il ripasso…" : "Ripassa gli errori"}<MobileIcon name="arrow"/></button> : <Link href="/progressi">I tuoi progressi<MobileIcon name="arrow"/></Link>}</div>
    </main>
    <nav aria-label="Navigazione risultati"><Link className={styles.navLink} href="/"><MobileIcon name="home"/><span>Home</span></Link><Link className={styles.navLink} href="/allenamento"><MobileIcon name="training"/><span>Argomenti</span></Link><Link className={styles.navLink} href="/?sezione=esame"><MobileIcon name="exam"/><span>Nuova prova</span></Link></nav>
    <Dialog open={!!zoom} onClose={()=>setZoom(null)} title="Immagine ingrandita" size="image">{zoom && <QuestionImage src={zoom} width={null} height={null} loading="eager" className="quiz-image-zoom"/>}</Dialog>
    <Dialog open={!!error} onClose={()=>setError(null)} title="Ripasso non disponibile"><p>{error}</p><button className="mt-4 min-h-12 w-full border-2 rounded-lg" onClick={()=>setError(null)}>Ho capito</button></Dialog>
  </div>;
}
