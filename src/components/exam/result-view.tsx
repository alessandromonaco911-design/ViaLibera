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

type Filter = "all" | "errors" | "unanswered";

const FILTER_PARAM: Record<Filter, string> = { all: "all", errors: "errors", unanswered: "unanswered" };

export function ResultView({ data }: { data: ResultViewData }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("filter") as Filter | null) ?? "all";
  const [filter, setFilter] = useState<Filter>(initial === "unanswered" || initial === "errors" ? initial : "all");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    if (filter === "errors") return data.questions.filter((q) => !q.correct);
    if (filter === "unanswered") return data.questions.filter((q) => q.unanswered);
    return data.questions;
  }, [data.questions, filter]);

  const toggle = (pos: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setOpen(new Set());
    router.replace(`/simulazione/${data.sessionId}/risultato?filter=${FILTER_PARAM[f]}`);
  };

  const scrollToFirstError = () => {
    const firstBad = data.questions.find((q) => !q.correct);
    if (!firstBad) return;
    document.getElementById(`q-${firstBad.position}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Tutte", count: data.questions.length },
    { key: "errors", label: "Errori", count: data.questions.filter((q) => !q.correct).length },
    { key: "unanswered", label: "Non risposte", count: data.questions.filter((q) => q.unanswered).length },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      {/* verdict */}
      <section
        className={cn(
          "mt-6 rounded-2xl border bg-surface p-5 text-center shadow-card",
          data.passed ? "border-success/30" : "border-danger/30",
        )}
        aria-live="polite"
      >
        <p className={cn("text-2xl font-bold tracking-tight", data.passed ? "text-success" : "text-danger")}>
          {data.passed ? "SUPERATO" : "NON SUPERATO"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Corrette</span>
            <b className="text-lg tabular-nums">{data.correctCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Errori</span>
            <b className={cn("text-lg tabular-nums", data.errorCount > data.allowedErrors ? "text-danger" : "")}>{data.errorCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Non risposte</span>
            <b className="text-lg tabular-nums">{data.unansweredCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Tempo</span>
            <b className="text-lg tabular-nums">{formatClock(data.timeUsedSeconds * 1000)}</b>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Soglia: massimo {data.allowedErrors} errori · {data.totalQuestions} domande · {Math.round(siteConfig.exam.durationSeconds / 60)} minuti
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button fullWidth onClick={() => router.push("/")}>Nuova simulazione</Button>
          {data.errorCount > 0 && (
            <Button variant="outline" fullWidth onClick={scrollToFirstError}>
              Vai al primo errore
            </Button>
          )}
        </div>
      </section>

      {/* sticky compact summary bar with filters */}
      <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => changeFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.key ? "bg-primary text-white" : "bg-surface text-muted ring-1 ring-border hover:bg-black/5",
              )}
            >
              {f.label} ({f.count})
            </button>
          ))}
          <span className="ml-auto hidden text-xs text-muted sm:block">
            {filtered.length} domande
          </span>
        </div>
      </div>

      {/* question list */}
      <section className="mt-4" aria-label="Dettaglio domande">
        <ul className="space-y-2">
          {filtered.map((q) => (
            <li
              key={q.questionId}
              id={`q-${q.position}`}
              className={cn(
                "scroll-mt-16 overflow-hidden rounded-xl border bg-surface shadow-card",
                !q.correct ? "border-danger/40" : "border-border",
              )}
            >
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
                <span
                  className="text-xs font-medium"
                  aria-label={q.correct ? "Corretta" : q.unanswered ? "Non risposta" : "Errata"}
                >
                  {q.correct ? "✓" : q.unanswered ? "—" : "✗"}
                </span>
              </button>
              {open.has(q.position) && (
                <div className="border-t border-border px-4 py-3">
                  {q.topic && <span className="text-xs font-medium text-primary">{q.topic}</span>}
                  {q.imageUrl && (
                    <div className="mt-2 max-w-[220px]">
                      <QuestionImage src={q.imageUrl} width={null} height={null} className="w-full rounded-lg border border-border object-contain" />
                    </div>
                  )}
                  <p className="mt-2 text-sm leading-relaxed">{q.statement}</p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Risposta data</dt>
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
                      <dt className="w-32 shrink-0 text-muted">Risposta corretta</dt>
                      <dd className="font-medium">{q.correctAnswer ? "VERO" : "FALSO"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Codice</dt>
                      <dd className="tabular-nums">{q.officialQuestionCode ?? "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Gruppo</dt>
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
