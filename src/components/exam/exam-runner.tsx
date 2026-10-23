"use client";

import { Brand } from "@/components/brand/brand";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicExamQuestion } from "@/lib/exam/types";
import { remainingMs, formatClock, timerTone } from "@/lib/exam/timer";
import {
  loadPersistedState,
  savePersistedState,
  clearPersistedState,
  registerSession,
  unregisterSession,
} from "@/lib/exam/local-state";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils/cn";
import { QuestionImage } from "./question-image";
import { QuizQuestion } from "@/components/exam/quiz-question";
import { QuizProgress } from "@/components/exam/quiz-progress";

interface ExamRunnerProps {
  sessionId: string;
  version: number;
  startedAt: string;
  expiresAt: string;
  totalQuestions: number;
  allowedErrors: number;
  questions: PublicExamQuestion[];
}

type SubmitPhase = "idle" | "submitting" | "done" | "error";

export function ExamRunner({ sessionId, version, startedAt, expiresAt, totalQuestions, questions }: ExamRunnerProps) {
  const router = useRouter();
  const [position, setPosition] = useState(1);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** aria-live feedback tick ("Risposta registrata") */
  const [feedbackTick, setFeedbackTick] = useState(0);

  const submittedRef = useRef(false);
  const submittingRef = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byPosition = useMemo(() => new Map(questions.map((q) => [q.position, q])), [questions]);

  const stageRef = useRef<HTMLElement>(null);
  useEffect(() => { stageRef.current?.scrollTo({ top: 0 }); }, [position]);

  const current = byPosition.get(position);
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;

  // ---- restore from localStorage (post-mount, deferred one macrotask) ----
  useEffect(() => {
    const t = setTimeout(() => {
      const stored = loadPersistedState(localStorage, sessionId);
      if (stored && stored.status === "in_progress" && stored.sessionId === sessionId) {
        if (stored.version === version) {
          setAnswers(stored.answers ?? {});
          setFlagged(stored.flagged ?? []);
          const pos = Math.min(Math.max(1, stored.currentPosition ?? 1), totalQuestions);
          setPosition(pos);
        }
        // times are authoritative from the server payload
      }
      setNow(Date.now());
    }, 0);
    registerSession(localStorage, sessionId);
    return () => clearTimeout(t);
  }, [sessionId, version, totalQuestions]);

  // ---- persist on changes (debounced via effect) ----
  useEffect(() => {
    if (now === null) return; // not mounted yet
    const state = {
      sessionId,
      version,
      status: submittedRef.current ? ("completed" as const) : ("in_progress" as const),
      currentPosition: position,
      answers,
      flagged,
      startedAt,
      expiresAt,
      lastSavedAt: new Date().toISOString(),
    };
    savePersistedState(localStorage, state);
  }, [position, answers, flagged, now, sessionId, version, startedAt, expiresAt]);

  // ---- timer tick ----
  const mounted = now !== null;
  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [mounted]);

  const doSubmit = useCallback(
    async (payloadAnswers: Record<string, boolean>, payloadFlagged: string[]) => {
      if (submittingRef.current || submittedRef.current) return;
      submittingRef.current = true;
      setPhase("submitting");
      setErrorMsg(null);
      try {
        const body = {
          version,
          answers: questions.map((q) => ({
            questionId: q.id,
            selectedAnswer: payloadAnswers[q.id] ?? null,
          })),
          flagged: payloadFlagged,
        };
        const res = await fetch(`/api/exams/${sessionId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          submittedRef.current = true;
          clearPersistedState(localStorage, sessionId);
          unregisterSession(localStorage, sessionId);
          setPhase("done");
          router.push(`/simulazione/${sessionId}/risultato`);
          return;
        }
        if (res.status === 409) {
          setErrorMsg("La sessione è già stata consegnata con un payload differente.");
          setPhase("error");
          return;
        }
        if (res.status === 404) {
          setErrorMsg("Sessione non trovata sul server.");
          setPhase("error");
          return;
        }
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setErrorMsg(data?.error?.message ?? "Consegna non riuscita. Riprova.");
        setPhase("error");
      } catch {
        // network failure: keep answers, allow retry
        setErrorMsg("Errore di rete durante la consegna. Le risposte sono conservate: riprova.");
        setPhase("error");
      } finally {
        submittingRef.current = false;
      }
    },
    [questions, sessionId, version, router],
  );

  // ---- auto submit on expiry ----
  const remaining = now === null ? null : remainingMs(expiresAt, now);
  useEffect(() => {
    if (now === null) return;
    if (remainingMs(expiresAt, now) <= 0 && !submittedRef.current && !submittingRef.current) {
      doSubmit(answers, flagged);
    }
  }, [now, expiresAt, doSubmit, answers, flagged]);

  // ---- interactions ----
  const selectAnswer = (qid: string, value: boolean) => {
    if (phase === "submitting" || submittedRef.current) return;
    if (remaining !== null && remaining <= 0) return; // expired: locked
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    // feedback only — NO auto-advance, NO navigation
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedbackTick((t) => t + 1);
    feedbackTimer.current = setTimeout(() => setFeedbackTick((t) => (t === 0 ? 0 : t - 1)), 1600);
  };

  const toggleFlag = (qid: string) => {
    if (phase === "submitting" || submittedRef.current || (remaining !== null && remaining <= 0)) return;
    setFlagged((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));
  };

  const goTo = (pos: number) => {
    if (pos >= 1 && pos <= totalQuestions) {
      setPosition(pos);
      setNavigatorOpen(false);
    }
  };

  const navNext = () => goTo(position + 1);
  const navPrev = () => goTo(position - 1);

  // ---- keyboard shortcuts (V/F/arrows/M/G/Esc) ----
  const modalOpen = navigatorOpen || submitOpen || zoomImage !== null;
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (modalOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (navigatorOpen) setNavigatorOpen(false);
          else if (zoomImage) setZoomImage(null);
          else if (submitOpen) setSubmitOpen(false);
        }
        return;
      }
      if (!current) return;
      switch (e.key) {
        case "v":
        case "V":
          e.preventDefault();
          selectAnswer(current.id, true);
          break;
        case "f":
        case "F":
          e.preventDefault();
          selectAnswer(current.id, false);
          break;
        case "ArrowRight":
          e.preventDefault();
          navNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          navPrev();
          break;
        case "m":
        case "M":
          e.preventDefault();
          toggleFlag(current.id);
          break;
        case "g":
        case "G":
          e.preventDefault();
          setNavigatorOpen(true);
          break;
        default:
          break;
      }
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // clean feedback timer on unmount
  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const tone = remaining === null ? "normal" : timerTone(remaining);
  const timerClass =
    tone === "critical" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground";

  if (!current) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center font-mono text-muted">
        Posizione domanda non valida.
      </div>
    );
  }

  const isFlagged = flagged.includes(current.id);
  const selected = answers[current.id];

  return (
    <div className="quiz-shell">
      {/* header — stable row 1 */}
      <header className="sticky top-0 z-20 border-b-2 border-foreground bg-accent-blue">
        <div className="quiz-header-row flex w-full items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <Link href="/" aria-label="ViaLibera · Home" className="flex min-h-11 min-w-11 shrink-0 items-center">
            <Brand compact />
          </Link>
          <span className="hidden font-mono text-xs uppercase tracking-wide text-foreground sm:block lg:hidden">
            Domanda {position} di {totalQuestions}
          </span>
          <span className="hidden font-mono text-base uppercase tracking-wide lg:block">Simulazione esame</span>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "border-2 border-foreground bg-surface px-2 py-1 font-mono text-sm font-semibold tabular-nums",
                timerClass,
                tone === "critical" && "font-bold",
              )}
              role="timer"
              aria-label="Tempo rimanente"
            >
              {formatClock(remaining ?? 0)}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setNavigatorOpen(true)} aria-label="Apri navigatore domande" className="quiz-hdr-btn w-12 px-0 lg:w-auto lg:px-5">
              <span className="lg:hidden" aria-hidden>☰</span><span className="hidden lg:inline">Quesiti</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSubmitOpen(true)} className="quiz-hdr-btn">
              Termina
            </Button>
          </div>
        </div>
        <QuizProgress position={position} answered={questions.map((q) => answers[q.id] !== undefined)} />
      </header>

      {/* question body — scrollable stage (stable geometry, action bar row fixed) */}
      <main ref={stageRef} className="quiz-stage">
        <div className="quiz-stage-inner mx-auto w-full">
          <div key={position} className="quiz-frame motion-scale-in">
            <QuizQuestion question={current} position={position} total={totalQuestions} onZoom={setZoomImage}>

            {/* answers — never green/red in simulation */}
            <div className="quiz-answer-options mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-4" role="group" aria-label="Risposta">
              {[true, false].map((val) => {
                const label = val ? "VERO" : "FALSO";
                const isSelected = selected === val;
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => selectAnswer(current.id, val)}
                    aria-pressed={isSelected}
                    className={cn(
                      "h-14 rounded-md border-2 border-foreground font-mono text-lg font-semibold uppercase tracking-widest transition-colors sm:h-[88px] sm:text-2xl",
                      isSelected
                        ? "bg-foreground text-white"
                        : "bg-surface text-foreground hover:bg-accent-blue",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* fixed-height aria-live feedback (no layout shift) */}
            <div aria-live="polite" className="mt-3 flex h-6 items-center justify-center">
              {feedbackTick > 0 && (
                <span className="border border-foreground bg-accent-yellow px-2 py-0.5 font-mono text-xs uppercase tracking-wide">
                  Risposta registrata
                </span>
              )}
            </div>

            {/* desktop-only shortcut hint */}
            <p className="quiz-shortcuts mt-2 hidden text-center font-mono text-xs uppercase tracking-wide text-muted sm:block">
              V / F · ← → · M contrassegna · G navigatore
            </p>
            <p className="hidden text-base leading-relaxed text-muted lg:block">Seleziona una risposta, poi prosegui.</p>

            {errorMsg && (
              <div role="alert" className="mt-4 border-2 border-foreground bg-danger-soft p-3 font-mono text-sm text-danger">
                {errorMsg}
              </div>
            )}
            </QuizQuestion>
          </div>
        </div>
      </main>

      {/* action bar — fixed bottom row of the grid (same y on every question) */}
      <div className="quiz-action-bar">
        <div className="quiz-actions quiz-actions--exam">
          <Button
            variant="outline"
            size="lg"
            onClick={navPrev}
            disabled={position <= 1}
            aria-label="Domanda precedente"
            className="action-bar-btn quiz-back"
          >
            <span aria-hidden>←</span><span className="hidden sm:inline lg:hidden">Indietro</span><span className="hidden lg:inline">Precedente</span>
          </Button>
          <Button
            variant="pastel"
            size="lg"
            onClick={() => toggleFlag(current.id)}
            aria-pressed={isFlagged}
            aria-label={isFlagged ? "Togli contrassegno" : "Contrassegna domanda"}
            className="action-bar-btn quiz-flag"
          >
            <span aria-hidden className="text-xl leading-none">{isFlagged ? "★" : "☆"}</span>
            <span className="hidden sm:inline lg:hidden">{isFlagged ? "Contrassegnata" : "Contrassegna"}</span>
            <span className="hidden lg:inline">{isFlagged ? "Segnata da rivedere" : "Segna da rivedere"}</span>
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={navNext}
            disabled={position >= totalQuestions}
            aria-label={position >= totalQuestions ? "Ultima domanda" : "Avanti"}
            className="action-bar-btn"
          >
            <span className="lg:hidden">Avanti →</span><span className="hidden lg:inline">Successiva →</span>
          </Button>
        </div>
      </div>

      {/* navigator drawer */}
      <Drawer open={navigatorOpen} onClose={() => setNavigatorOpen(false)} title={`Domande (${totalQuestions})`}>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6" role="group" aria-label="Navigatore domande">
          {questions.map((q) => {
            const isCurrent = q.position === position;
            const answered = answers[q.id] !== undefined;
            const isFlag = flagged.includes(q.id);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => goTo(q.position)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Domanda ${q.position}${answered ? ", risposta data" : ", senza risposta"}${isFlag ? ", contrassegnata" : ""}`}
                className={cn(
                  "relative flex min-h-12 items-center justify-center border-2 border-foreground font-mono text-sm font-medium tabular-nums",
                  isCurrent
                    ? "bg-foreground text-white"
                    : answered
                      ? "bg-accent-blue text-foreground"
                      : "bg-surface text-foreground",
                )}
              >
                {q.position}
                {isFlag && <span aria-hidden className="absolute right-0.5 top-0 text-[10px]">★</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-wide text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-foreground" /> corrente</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-surface" /> senza risposta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-accent-blue" /> risposta data</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-accent-yellow" /> contrassegnata</span>
        </div>
      </Drawer>

      {/* submit confirmation dialog */}
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="Consegnare la simulazione?" busy={phase === "submitting"}>
        <ul className="space-y-2 font-mono text-sm">
          <li className="flex justify-between border-b border-foreground/30 pb-1"><span className="uppercase text-muted">Risposte date</span><b>{answeredCount} / {totalQuestions}</b></li>
          <li className="flex justify-between border-b border-foreground/30 pb-1"><span className="uppercase text-muted">Senza risposta</span><b className={totalQuestions - answeredCount > 0 ? "text-danger" : ""}>{totalQuestions - answeredCount}</b></li>
          <li className="flex justify-between border-b border-foreground/30 pb-1"><span className="uppercase text-muted">Contrassegnate</span><b>{flagged.length}</b></li>
          <li className="flex justify-between"><span className="uppercase text-muted">Tempo residuo</span><b className="tabular-nums">{formatClock(remaining ?? 0)}</b></li>
        </ul>
        <p className="mt-4 border-2 border-foreground bg-warning-soft p-3 font-mono text-sm text-warning">
          Le domande senza risposta saranno considerate errate.
        </p>
        {errorMsg && phase === "error" && (
          <p role="alert" className="mt-3 border-2 border-foreground bg-danger-soft p-3 font-mono text-sm text-danger">
            {errorMsg}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button variant="outline" fullWidth onClick={() => setSubmitOpen(false)} disabled={phase === "submitting"}>
            Torna alla prova
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={phase === "submitting"}
            onClick={() => doSubmit(answers, flagged)}
          >
            {phase === "submitting" ? "Consegna in corso…" : "Consegna"}
          </Button>
        </div>
      </Dialog>

      {/* image zoom */}
      {zoomImage && (
        <Dialog open={!!zoomImage} onClose={() => setZoomImage(null)} title="Immagine ingrandita" size="image">
          <QuestionImage src={zoomImage} width={null} height={null} loading="eager" className="quiz-image-zoom" />
        </Dialog>
      )}
    </div>
  );
}
