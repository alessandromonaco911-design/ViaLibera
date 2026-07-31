"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/config/site";
import { formatClock } from "@/lib/exam/timer";
import { Button } from "@/components/ui/button";
import { QuestionImage } from "./question-image";
import { cn } from "@/lib/utils/cn";

export interface ResultQuestionDetail {
  position: number;
  questionId: string;
  officialQuestionCode: string | null;
  statement: string;
  topic: string | null;
  groupCode: string | null;
  imageUrl: string | null;
  selectedAnswer: boolean | null;
  correctAnswer: boolean;
  correct: boolean;
  unanswered: boolean;
}

export interface ResultViewData {
  sessionId: string;
  passed: boolean;
  correctCount: number;
  errorCount: number;
  unansweredCount: number;
  totalQuestions: number;
  allowedErrors: number;
  timeUsedSeconds: number;
  questions: ResultQuestionDetail[];
}

export function ResultView({ data }: { data: ResultViewData }) {
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState<"all" | "errors">(params.get("filter") === "errors" ? "errors" : "all");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const filtered = useMemo(
    () => (filter === "errors" ? data.questions.filter((q) => !q.correct) : data.questions),
    [data.questions, filter],
  );

  const toggle = (pos: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      {/* verdict */}
      <section
        className={cn(
          "mt-6 rounded-2xl border bg-surface p-6 text-center shadow-card",
          data.passed ? "border-success/30" : "border-danger/30",
        )}
        aria-live="polite"
      >
        <p
          className={cn(
            "text-2xl font-bold tracking-tight",
            data.passed ? "text-success" : "text-danger",
          )}
        >
          {data.passed ? "SUPERATO" : "NON SUPERATO"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-black/5 p-3">
            <span className="block text-xs text-muted">Corrette</span>
            <b className="text-lg tabular-nums">{data.correctCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-3">
            <span className="block text-xs text-muted">Errori</span>
            <b className={cn("text-lg tabular-nums", data.errorCount > data.allowedErrors ? "text-danger" : "")}>{data.errorCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-3">
            <span className="block text-xs text-muted">Non risposte</span>
            <b className="text-lg tabular-nums">{data.unansweredCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-3">
            <span className="block text-xs text-muted">Tempo impiegato</span>
            <b className="text-lg tabular-nums">{formatClock(data.timeUsedSeconds * 1000)}</b>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Soglia: massimo {data.allowedErrors} errori · {data.totalQuestions} domande · {Math.round(siteConfig.exam.durationSeconds / 60)} minuti
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button fullWidth onClick={() => router.push("/")}>Nuova simulazione</Button>
          <Button
            variant={filter === "errors" ? "primary" : "outline"}
            fullWidth
            onClick={() => {
              const next = filter === "errors" ? "all" : "errors";
              setFilter(next);
              router.replace(`/simulazione/${data.sessionId}/risultato?filter=${next}`);
            }}
          >
            {filter === "errors" ? "Mostra tutte le domande" : "Rivedi errori"}
          </Button>
        </div>
      </section>

      {/* question list */}
      <section className="mt-6" aria-label="Dettaglio domande">
        <h2 className="text-sm font-semibold text-muted">
          {filter === "errors" ? `Domande con errore (${filtered.length})` : `Tutte le domande (${filtered.length})`}
        </h2>
        <ul className="mt-3 space-y-2">
          {filtered.map((q) => (
            <li key={q.questionId} className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <button
                type="button"
                onClick={() => toggle(q.position)}
                aria-expanded={open.has(q.position)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                    q.correct ? "bg-success" : "bg-danger",
                  )}
                  aria-label={q.correct ? "Corretta" : "Errata o non risposta"}
                >
                  {q.position}
                </span>
                <span className="flex-1 truncate text-sm">{q.statement}</span>
                <span className="text-xs text-muted">{q.correct ? "✓" : "✗"}</span>
              </button>
              {open.has(q.position) && (
                <div className="border-t border-border px-4 py-3">
                  {q.topic && <span className="text-xs font-medium text-primary">{q.topic}</span>}
                  {q.imageUrl && (
                    <div className="mt-2 max-w-xs">
                      <QuestionImage src={q.imageUrl} width={null} height={null} className="w-full rounded-lg border border-border object-contain" />
                    </div>
                  )}
                  <p className="mt-2 text-sm leading-relaxed">{q.statement}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">Risposta data</dt>
                      <dd>
                        {q.selectedAnswer === null ? (
                          <span className="font-medium text-danger">Non risposta</span>
                        ) : (
                          <span className={cn("font-medium", q.correct ? "text-success" : "text-danger")}>
                            {q.selectedAnswer ? "VERO" : "FALSO"}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">Risposta corretta</dt>
                      <dd className="font-medium">{q.correctAnswer ? "VERO" : "FALSO"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">Codice</dt>
                      <dd className="tabular-nums">{q.officialQuestionCode ?? "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">Gruppo</dt>
                      <dd>{q.groupCode ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
