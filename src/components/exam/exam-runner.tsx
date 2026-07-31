"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicExamQuestion } from "@/lib/exam/types";
import { siteConfig } from "@/config/site";
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

  const submittedRef = useRef(false);
  const submittingRef = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byPosition = useMemo(() => new Map(questions.map((q) => [q.position, q])), [questions]);

  const current = byPosition.get(position);
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;

  // ---- restore from localStorage (post-mount, deferred one macrotask so the rule
  //      on synchronous setState-in-effect is respected and no hydration mismatch occurs) ----
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
    // brief feedback + auto-advance (cancel if the user navigates manually)
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      const next = position + 1;
      if (next <= totalQuestions) setPosition(next);
    }, 150);
  };

  const toggleFlag = (qid: string) => {
    if (phase === "submitting" || submittedRef.current || (remaining !== null && remaining <= 0)) return;
    setFlagged((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));
  };

  const goTo = (pos: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (pos >= 1 && pos <= totalQuestions) {
      setPosition(pos);
      setNavigatorOpen(false);
    }
  };

  const navNext = () => goTo(position + 1);
  const navPrev = () => goTo(position - 1);

  const tone = remaining === null ? "normal" : timerTone(remaining);
  const timerClass =
    tone === "critical" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground";

  if (!current) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-muted">
        Posizione domanda non valida.
      </div>
    );
  }

  const isFlagged = flagged.includes(current.id);
  const selected = answers[current.id];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-none">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
            {siteConfig.name}
          </Link>
          <span className="text-sm text-muted">Domanda {position} di {totalQuestions}</span>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "tabular-nums text-sm font-medium",
                timerClass,
                tone === "critical" && "font-semibold",
              )}
              role="timer"
              aria-label="Tempo rimanente"
            >
              {formatClock(remaining ?? 0)}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setNavigatorOpen(true)} aria-label="Apri navigatore domande">
              <GridIcon />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSubmitOpen(true)}>
              Termina
            </Button>
          </div>
        </div>
      </header>

      {/* question body */}
      <main className="flex-1 px-4 pb-40 pt-5 sm:pb-24">
        <div className="mx-auto max-w-2xl">
          {current.topic && (
            <span className="mb-3 inline-block rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              {current.topic}
            </span>
          )}
          <h1 className="text-lg font-medium leading-relaxed sm:text-xl">{current.statement}</h1>

          {current.image && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setZoomImage(current.image!.url)}
                className="block w-full overflow-hidden rounded-xl border border-border bg-surface"
                aria-label="Ingrandisci immagine"
              >
                <QuestionImage
                  src={current.image.url}
                  width={current.image.width}
                  height={current.image.height}
                  className="mx-auto max-h-72 w-auto object-contain"
                />
              </button>
              <p className="mt-1 text-center text-xs text-muted">Tocca l’immagine per ingrandirla</p>
            </div>
          )}

          {/* answers */}
          <div className="mt-6 grid grid-cols-2 gap-3" role="group" aria-label="Risposta">
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
                    "h-16 rounded-xl border-2 text-base font-semibold transition-colors",
                    isSelected
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-surface text-foreground hover:border-primary/40",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {errorMsg && (
            <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              {errorMsg}
            </div>
          )}
        </div>
      </main>

      {/* mobile bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:pb-6">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Button variant="outline" size="md" onClick={navPrev} disabled={position <= 1} className="flex-1 sm:flex-none sm:w-28">
            ← Indietro
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => toggleFlag(current.id)}
            aria-pressed={isFlagged}
            className="flex-1 sm:flex-none sm:w-32"
          >
            {isFlagged ? "★ Contrassegnata" : "☆ Contrassegna"}
          </Button>
          <Button variant="primary" size="md" onClick={navNext} disabled={position >= totalQuestions} className="flex-1 sm:flex-none sm:w-28">
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
                  "flex h-11 items-center justify-center rounded-lg border text-sm font-medium tabular-nums",
                  isCurrent
                    ? "border-primary bg-primary text-white"
                    : answered
                      ? "border-primary/40 bg-primary-soft text-primary"
                      : "border-border bg-surface text-foreground",
                  isFlag && !isCurrent && "ring-2 ring-amber-400",
                )}
              >
                {q.position}
                {isFlag && <span className="sr-only">contrassegnata</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary" /> corrente</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary-soft ring-1 ring-primary/40" /> risposta data</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-border bg-surface" /> senza risposta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-2 ring-amber-400" /> contrassegnata</span>
        </div>
      </Drawer>

      {/* submit confirmation dialog */}
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} title="Consegnare la simulazione?" busy={phase === "submitting"}>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between"><span className="text-muted">Risposte date</span><b>{answeredCount} / {totalQuestions}</b></li>
          <li className="flex justify-between"><span className="text-muted">Senza risposta</span><b className={totalQuestions - answeredCount > 0 ? "text-danger" : ""}>{totalQuestions - answeredCount}</b></li>
          <li className="flex justify-between"><span className="text-muted">Contrassegnate</span><b>{flagged.length}</b></li>
          <li className="flex justify-between"><span className="text-muted">Tempo residuo</span><b>{formatClock(remaining ?? 0)}</b></li>
        </ul>
        <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          Le domande senza risposta saranno considerate errate.
        </p>
        {errorMsg && phase === "error" && (
          <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
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
          <QuestionImage src={zoomImage} width={null} height={null} className="mx-auto max-h-[70dvh] w-auto rounded-lg object-contain" />
        </Dialog>
      )}
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" />
    </svg>
  );
}
