"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PracticeExplanation, PublicPracticeQuestion } from "@/lib/practice/types";
import { ExplanationSheet } from "./explanation-sheet";
import {
  loadPersistedPracticeState,
  savePersistedPracticeState,
  clearPersistedPracticeState,
  registerPracticeSession,
  unregisterPracticeSession,
  type PersistedPracticeState,
  type VerifiedPracticeResult,
} from "@/lib/practice/local-state";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils/cn";
import { QuestionImage } from "@/components/exam/question-image";
import { QuizQuestion } from "@/components/exam/quiz-question";
import { QuizProgress } from "@/components/exam/quiz-progress";

export interface PracticeInitialState {
  questionId: string;
  position: number;
  selectedAnswer: boolean | null;
  verified: boolean;
  isCorrect: boolean | null;
  explanation?: PracticeExplanation | null;
}

interface PracticeRunnerProps {
  sessionId: string;
  version: number;
  mode: "practice" | "mistakes";
  topicName: string;
  totalQuestions: number;
  startedAt: string;
  seed: number;
  sourceSessionId: string | null;
  questions: PublicPracticeQuestion[];
  initialStates: PracticeInitialState[];
}

type CheckPhase = "idle" | "checking" | "error";

export function PracticeRunner({
  sessionId,
  version,
  mode,
  topicName,
  totalQuestions,
  startedAt,
  questions,
  initialStates,
}: PracticeRunnerProps) {
  const router = useRouter();
  const [position, setPosition] = useState(1);
  /** selected answers (not yet verified) */
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  /** verified answers: questionId -> result */
  const [verified, setVerified] = useState<Record<string, VerifiedPracticeResult>>({});
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [phase, setPhase] = useState<CheckPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [explanationQuestionId, setExplanationQuestionId] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const checkingRef = useRef(false);
  const completingRef = useRef(false);
  /** set once the client state has been restored (keyboard active); used as a hydration signal */
  const [hydrated, setHydrated] = useState(false);

  const byPosition = useMemo(() => new Map(questions.map((q) => [q.position, q])), [questions]);
  const stageRef = useRef<HTMLElement>(null);
  useEffect(() => { stageRef.current?.scrollTo({ top: 0 }); }, [position]);

  const current = byPosition.get(position);
  const answeredCount = questions.filter((q) => verified[q.id] !== undefined).length;
  const uncheckedCount = totalQuestions - answeredCount;

  // ---- restore from localStorage + server state (deferred one macrotask) ----
  useEffect(() => {
    const t = setTimeout(() => {
      const stored = loadPersistedPracticeState(localStorage, sessionId);
      if (stored && stored.payloadVersion === version) {
        if (stored.currentPosition >= 1 && stored.currentPosition <= totalQuestions) {
          setPosition(stored.currentPosition);
        }
        // selected answers only for questions that are NOT verified (server state is authoritative)
        const serverVerified = new Map(initialStates.filter((s) => s.verified).map((s) => [s.questionId, s]));
        const sel: Record<string, boolean> = {};
        for (const [qid, val] of Object.entries(stored.selected ?? {})) {
          if (!serverVerified.has(qid)) sel[qid] = val;
        }
        setSelected(sel);
        // merge verified: prefer server truth; fall back to local only when server lacks it
        const ver: Record<string, VerifiedPracticeResult> = {};
        for (const s of initialStates) {
          if (s.verified && s.selectedAnswer !== null && s.isCorrect !== null) {
            ver[s.questionId] = { selectedAnswer: s.selectedAnswer, isCorrect: s.isCorrect, explanation: s.explanation ?? null };
          }
        }
        for (const [qid, v] of Object.entries(stored.verified ?? {})) {
          if (!ver[qid] && v && typeof v.selectedAnswer === "boolean" && typeof v.isCorrect === "boolean") {
            ver[qid] = v;
          }
        }
        setVerified(ver);
      } else {
        // no usable local state: restore whatever the server knows
        const ver: Record<string, VerifiedPracticeResult> = {};
        for (const s of initialStates) {
          if (s.verified && s.selectedAnswer !== null && s.isCorrect !== null) {
            ver[s.questionId] = { selectedAnswer: s.selectedAnswer, isCorrect: s.isCorrect, explanation: s.explanation ?? null };
          }
        }
        setVerified(ver);
      }
      mountedRef.current = true;
      setHydrated(true);
      registerPracticeSession(localStorage, sessionId);
    }, 0);
    return () => clearTimeout(t);
  }, [sessionId, version, totalQuestions, initialStates]);

  // ---- persist (only after mount) ----
  useEffect(() => {
    if (!mountedRef.current) return;
    const state: PersistedPracticeState = {
      sessionId,
      mode,
      topicId: "",
      topicName,
      currentPosition: position,
      selected,
      verified,
      requestedQuestionCount: totalQuestions,
      totalQuestions,
      startedAt,
      lastSavedAt: new Date().toISOString(),
      payloadVersion: version,
    };
    savePersistedPracticeState(localStorage, state);
  }, [position, selected, verified, sessionId, mode, topicName, totalQuestions, startedAt, version]);

  // ---- interactions ----
  const selectAnswer = (qid: string, value: boolean) => {
    if (phase === "checking" || verified[qid] !== undefined) return; // locked after verify
    setSelected((prev) => ({ ...prev, [qid]: value }));
    setErrorMsg(null);
  };

  const verifyCurrent = async () => {
    if (!current) return;
    const value = selected[current.id];
    if (value === undefined || verified[current.id] !== undefined) return; // nothing selected or already verified
    if (checkingRef.current) return;
    checkingRef.current = true;
    setPhase("checking");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/practice/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, selectedAnswer: value }),
      });
      const data = (await res.json().catch(() => null)) as {
        isCorrect?: boolean;
        selectedAnswer?: boolean;
        explanation?: PracticeExplanation | null;
        error?: { message?: string; code?: string };
      } | null;
      if (res.ok && data && typeof data.isCorrect === "boolean") {
        const result: VerifiedPracticeResult = {
          selectedAnswer: typeof data.selectedAnswer === "boolean" ? data.selectedAnswer : value,
          isCorrect: data.isCorrect,
          explanation: data.explanation ?? null,
        };
        setVerified((prev) => ({ ...prev, [current.id]: result }));
        setExplanationQuestionId(current.id);
        setSelected((prev) => {
          const next = { ...prev };
          delete next[current.id];
          return next;
        });
        setPhase("idle");
        return;
      }
      setErrorMsg(data?.error?.message ?? "Verifica non riuscita. Riprova.");
      setPhase("error");
    } catch {
      // network failure: keep the selection, allow retry
      setErrorMsg("Errore di rete durante la verifica. La risposta è conservata: riprova.");
      setPhase("error");
    } finally {
      checkingRef.current = false;
    }
  };

  const goTo = (pos: number) => {
    if (pos >= 1 && pos <= totalQuestions) {
      setPosition(pos);
      setNavigatorOpen(false);
      setErrorMsg(null);
    }
  };

  const navNext = () => {
    if (!current) return;
    if (verified[current.id] === undefined) return; // must verify before advancing
    if (position < totalQuestions) {
      setPosition(position + 1);
      setErrorMsg(null);
    }
  };

  const navPrev = () => {
    if (position > 1) {
      setPosition(position - 1);
      setErrorMsg(null);
    }
  };

  const complete = async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/practice/${sessionId}/complete`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setErrorMsg(data?.error?.message ?? "Impossibile completare l'allenamento. Riprova.");
        completingRef.current = false;
        return;
      }
      clearPersistedPracticeState(localStorage, sessionId);
      unregisterPracticeSession(localStorage, sessionId);
      router.push(`/allenamento/${sessionId}/risultato`);
    } catch {
      setErrorMsg("Errore di rete. Riprova.");
      completingRef.current = false;
    }
  };

  // ---- keyboard shortcuts (V/F/Enter/arrows/G/Esc) ----
  const modalOpen = navigatorOpen || completeOpen || zoomImage !== null || explanationQuestionId !== null;
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
          if (explanationQuestionId) setExplanationQuestionId(null);
          else if (navigatorOpen) setNavigatorOpen(false);
          else if (zoomImage) setZoomImage(null);
          else if (completeOpen) setCompleteOpen(false);
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
        case "Enter":
          // verify only when a NEW answer is selected (Enter never advances)
          if (selected[current.id] !== undefined && verified[current.id] === undefined) {
            e.preventDefault();
            void verifyCurrent();
          }
          break;
        case "ArrowRight":
          if (verified[current.id] !== undefined && position < totalQuestions) {
            e.preventDefault();
            navNext();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          navPrev();
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

  if (!current) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center font-mono text-muted">
        Posizione domanda non valida.
      </div>
    );
  }

  const currentVerified = verified[current.id];
  const isLast = position >= totalQuestions;
  const canAdvance = currentVerified !== undefined && !isLast;
  const checkReady = selected[current.id] !== undefined && currentVerified === undefined;

  return (
    <div
      className="quiz-shell"
      data-hydrated={hydrated ? "true" : "false"}
    >
      {/* header — stable row 1 */}
      <header className="sticky top-0 z-20 border-b-2 border-foreground bg-accent-yellow">
        <div className="quiz-header-row flex w-full items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <Link href="/" className="flex shrink-0 flex-col items-start gap-0.5 font-mono text-sm font-semibold leading-none tracking-tight sm:flex-row sm:items-baseline">
            <span>VIA</span>
            <span className="bg-foreground px-0.5 text-accent-yellow">LIBERA</span>
          </Link>
          <span className="hidden truncate font-mono text-xs uppercase tracking-wide text-foreground sm:block lg:hidden">
            {mode === "mistakes" ? "Ripasso errori" : "Allenamento"} · {position} di {totalQuestions}
          </span>
          <span className="hidden font-mono text-base uppercase tracking-wide lg:block">{mode === "mistakes" ? "Ripasso errori" : "Allenamento"}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNavigatorOpen(true)} aria-label="Apri navigatore domande" className="quiz-hdr-btn w-12 px-0 lg:w-auto lg:px-5">
              <span className="lg:hidden" aria-hidden>☰</span><span className="hidden lg:inline">Quesiti</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCompleteOpen(true)} className="quiz-hdr-btn">
              Completa
            </Button>
          </div>
        </div>
        <QuizProgress position={position} answered={questions.map((q) => verified[q.id] !== undefined)} />
      </header>

      {/* question body — scrollable stage (stable geometry, action bar row fixed) */}
      <main ref={stageRef} className="quiz-stage">
        <div className="quiz-stage-inner mx-auto w-full">
          <div key={position} className="quiz-frame motion-scale-in">
            <QuizQuestion question={current} position={position} total={totalQuestions} onZoom={setZoomImage} emphasize>

            {/* answers — green/red ONLY after verification */}
            <div className="quiz-answer-options mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-4" role="group" aria-label="Risposta">
              {[true, false].map((val) => {
                const label = val ? "VERO" : "FALSO";
                const isSelected = currentVerified !== undefined ? currentVerified.selectedAnswer === val : selected[current.id] === val;
                const locked = currentVerified !== undefined;
                const correct = currentVerified !== undefined && currentVerified.isCorrect;
                const isRightAnswer = currentVerified !== undefined && currentVerified.selectedAnswer === val && correct;
                const isWrongPick = currentVerified !== undefined && currentVerified.selectedAnswer === val && !correct;
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => !locked && selectAnswer(current.id, val)}
                    disabled={locked}
                    aria-pressed={isSelected}
                    className={cn(
                      "h-14 rounded-md border-2 border-foreground font-mono text-lg font-semibold uppercase tracking-widest transition-colors sm:h-[88px] sm:text-2xl",
                      locked
                        ? isRightAnswer
                          ? "bg-success-soft text-success"
                          : isWrongPick
                            ? "bg-danger-soft text-danger"
                            : "bg-surface text-muted"
                        : isSelected
                          ? "bg-foreground text-white"
                          : "bg-surface text-foreground hover:bg-accent-blue",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* feedback */}
            <div aria-live="polite" className="mt-3 sm:mt-4">
              {currentVerified && (
                <div
                  className={cn(
                    "motion-feedback border-2 border-foreground p-3 sm:p-4",
                    currentVerified.isCorrect ? "bg-success-soft" : "bg-danger-soft",
                  )}
                >
                  <p
                    className={cn(
                      "text-base font-semibold leading-relaxed",
                      currentVerified.isCorrect ? "text-success" : "text-danger",
                    )}
                  >
                    {currentVerified.isCorrect
                      ? "Corretta"
                      : `Errata — risposta corretta: ${currentVerified.selectedAnswer ? "FALSO" : "VERO"}`}
                  </p>
                  <button type="button" className="practice-explanation-trigger" onClick={() => setExplanationQuestionId(current.id)}>Leggi la spiegazione ↑</button>
                </div>
              )}
              {!currentVerified && checkReady && (
                <p className="text-base leading-relaxed text-muted">Seleziona Verifica risposta per controllare.</p>
              )}
              {!currentVerified && !checkReady && (
                <p className="text-base leading-relaxed text-muted">Seleziona VERO o FALSO per rispondere.</p>
              )}
            </div>

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
        <div className="quiz-actions quiz-actions--practice">
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
          {!currentVerified && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => void verifyCurrent()}
              disabled={!checkReady || phase === "checking"}
              aria-busy={phase === "checking"}
              className="action-bar-btn"
            >
              {phase === "checking" ? "Verifica…" : "Verifica risposta"}
            </Button>
          )}
          {currentVerified && (
            <Button
              variant="primary"
              size="lg"
              onClick={isLast ? () => setCompleteOpen(true) : navNext}
              disabled={isLast ? false : !canAdvance}
              className="action-bar-btn"
              aria-label={isLast ? "Completa allenamento" : "Avanti"}
            >
              {isLast ? "Completa allenamento" : <><span className="lg:hidden">Avanti →</span><span className="hidden lg:inline">Successiva →</span></>}
            </Button>
          )}
        </div>
      </div>

      {currentVerified && <ExplanationSheet key={current.id} open={explanationQuestionId === current.id}
        onClose={() => setExplanationQuestionId(null)}
        onContinue={() => { setExplanationQuestionId(null); if (isLast) setCompleteOpen(true); else navNext(); }}
        selectedAnswer={currentVerified.selectedAnswer} isCorrect={currentVerified.isCorrect}
        explanation={currentVerified.explanation ?? null} position={position} total={totalQuestions} isLast={isLast} />}

      {/* navigator drawer */}
      <Drawer open={navigatorOpen} onClose={() => setNavigatorOpen(false)} title={`Domande (${totalQuestions})`}>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6" role="group" aria-label="Navigatore domande">
          {questions.map((q) => {
            const isCurrent = q.position === position;
            const v = verified[q.id];
            const hasSelection = v !== undefined ? true : selected[q.id] !== undefined;
            const status =
              v !== undefined ? (v.isCorrect ? "corretta" : "errata") : hasSelection ? "risposta selezionata, non verificata" : "senza risposta";
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => goTo(q.position)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Domanda ${q.position}, ${status}`}
                className={cn(
                  "flex min-h-12 items-center justify-center border-2 border-foreground font-mono text-sm font-medium tabular-nums",
                  isCurrent
                    ? "bg-foreground text-white"
                    : v !== undefined
                      ? v.isCorrect
                        ? "bg-success-soft text-success"
                        : "bg-danger-soft text-danger"
                      : hasSelection
                        ? "bg-accent-blue text-foreground"
                        : "bg-surface text-foreground",
                )}
              >
                {q.position}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-wide text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-foreground" /> corrente</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-surface" /> senza risposta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-accent-blue" /> selezionata</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-success-soft" /> corretta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-foreground bg-danger-soft" /> errata</span>
        </div>
      </Drawer>

      {/* completion confirmation */}
      <Dialog open={completeOpen} onClose={() => setCompleteOpen(false)} title="Completare l’allenamento?" busy={phase === "checking"}>
        <p className="font-mono text-sm text-muted">
          {uncheckedCount === 1
            ? "1 domanda non verificata sarà considerata senza risposta."
            : `${uncheckedCount} domande non verificate saranno considerate senza risposta.`}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button variant="outline" fullWidth onClick={() => setCompleteOpen(false)}>
            Torna alla prova
          </Button>
          <Button variant="danger" fullWidth onClick={() => void complete()}>
            Completa
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
