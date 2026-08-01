"use client";

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
    <div className="shell-wide flex min-h-dvh flex-col px-4 sm:px-6">
      {/* header */}
      <header className="sticky top-0 z-20 -mx-4 border-b-2 border-foreground bg-accent-blue sm:-mx-6">
        <div className="shell-wide flex items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex shrink-0 items-baseline gap-0.5 font-mono text-sm font-semibold tracking-tight">
            <span>VIA</span>
            <span className="bg-foreground px-0.5 text-accent-blue">LIBERA</span>
          </Link>
          <span className="font-mono text-xs uppercase tracking-wide text-foreground">
            Domanda {position} di {totalQuestions}
          </span>
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
            <Button variant="secondary" size="sm" onClick={() => setNavigatorOpen(true)} aria-label="Apri navigatore domande">
              ☰
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSubmitOpen(true)}>
              Termina
            </Button>
          </div>
        </div>
      </header>

      {/* question body */}
      <main className="py-6 pb-28 sm:pb-0">
        <div className="mx-auto w-full">
          <div key={position} className="motion-scale-in">
            {current.topic && (
              <span className="mb-3 inline-block border border-foreground bg-accent-blue px-2 py-0.5 font-mono text-xs uppercase tracking-wide">
                {current.topic}
              </span>
            )}

            <div className="border-2 border-foreground bg-surface p-6 shadow-pop sm:p-9">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">
                Domanda {String(position).padStart(2, "0")}
                {current.officialQuestionCode && <> · Codice {current.officialQuestionCode}</>}
                {current.groupCode && <> · Gruppo {current.groupCode}</>}
              </p>
              <h1 className="mx-auto mt-4 max-w-[74ch] text-[1.35rem] leading-[1.55] text-foreground sm:text-[1.6rem] 2xl:text-[1.75rem]">{current.statement}</h1>

              {current.image && (
                <div className="mt-6 border-t-2 border-foreground pt-6">
                  <button
                    type="button"
                    onClick={() => setZoomImage(current.image!.url)}
                    className="block w-full border border-foreground bg-surface"
                    aria-label="Ingrandisci immagine"
                  >
                    <QuestionImage
                      src={current.image.url}
                      width={current.image.width}
                      height={current.image.height}
                      className="mx-auto max-h-80 w-auto object-contain sm:max-h-[480px] 2xl:max-h-[520px]"
                    />
                  </button>
                  <p className="mt-1 text-center font-mono text-xs uppercase tracking-wide text-muted">
                    Tocca l’immagine per ingrandirla
                  </p>
                </div>
              )}
            </div>

            {/* answers — never green/red in simulation */}
            <div className="mt-5 grid grid-cols-2 gap-4" role="group" aria-label="Risposta">
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
                      "h-16 rounded-md border-2 border-foreground font-mono text-xl font-semibold uppercase tracking-widest transition-colors sm:h-[88px] sm:text-2xl",
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
            <p className="mt-2 hidden text-center font-mono text-xs uppercase tracking-wide text-muted sm:block">
              V / F · ← → · M contrassegna · G navigatore
            </p>

            {errorMsg && (
              <div role="alert" className="mt-4 border-2 border-foreground bg-danger-soft p-3 font-mono text-sm text-danger">
                {errorMsg}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* action bar — in normal flow on desktop, sticky bottom on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-foreground bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mt-6 sm:border-y-2 sm:bg-surface sm:px-0 sm:py-3">
        <div className="mx-auto flex w-full items-stretch justify-center gap-3 sm:grid sm:grid-cols-[repeat(3,minmax(200px,260px))] sm:justify-center sm:gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={navPrev}
            disabled={position <= 1}
            className="flex-1 sm:flex-none sm:h-16 sm:min-w-[200px] sm:px-10 sm:text-lg"
          >
            ← Indietro
          </Button>
          <Button
            variant="pastel"
            size="lg"
            onClick={() => toggleFlag(current.id)}
            aria-pressed={isFlagged}
            className="flex-1 sm:flex-none sm:h-16 sm:min-w-[220px] sm:px-10 sm:text-lg"
          >
            {isFlagged ? "★ Contrassegnata" : "☆ Contrassegna"}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={navNext}
            disabled={position >= totalQuestions}
            className="flex-1 sm:flex-none sm:h-16 sm:min-w-[200px] sm:px-10 sm:text-lg"
            aria-label={position >= totalQuestions ? "Ultima domanda" : "Avanti"}
          >
            Avanti →
          </Button>
        </div>
      </div>

      {/* navigator drawer */}
      <Drawer open={navigatorOpen} onClose={() => setNavigatorOpen(false)} title={`Domande (${totalQuestions})`}>
        <div className="grid grid-cols-6 gap-2" role="list" aria-label="Navigatore domande">
          {questions.map((q) => {
            const isCurrent = q.position === position;
            const answered = answers[q.id] !== undefined;
            const isFlag = flagged.includes(q.id);
            return (
              <button
                key={q.id}
                type="button"
                role="listitem"
                onClick={() => goTo(q.position)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Domanda ${q.position}${answered ? ", risposta data" : ", senza risposta"}${isFlag ? ", contrassegnata" : ""}`}
                className={cn(
                  "relative flex h-11 items-center justify-center border-2 border-foreground font-mono text-sm font-medium tabular-nums",
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
        <div className="mt-5 flex gap-3">
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
        <Dialog open={!!zoomImage} onClose={() => setZoomImage(null)} title="Immagine ingrandita">
          <QuestionImage src={zoomImage} width={null} height={null} className="mx-auto max-h-[70dvh] w-auto rounded-md object-contain" />
        </Dialog>
      )}
    </div>
  );
}
