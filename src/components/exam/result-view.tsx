"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { QuestionImage } from "@/components/exam/question-image";
import { StatBlock, SectionLabel } from "@/components/ui/editorial";
import { EditorialAccordion } from "@/components/ui/editorial-accordion";
import { cn } from "@/lib/utils/cn";
import { pageShellClass } from "@/components/ui/page-shell";

type Filter = "all" | "errors" | "unanswered";

const FILTER_PARAM: Record<Filter, string> = { all: "all", errors: "errors", unanswered: "unanswered" };

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

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Exam result: statistical poster + editorial accordion list. */
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
    window.history.replaceState(null, "", `/simulazione/${data.sessionId}/risultato?filter=${FILTER_PARAM[f]}`);
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
    <main className={cn(pageShellClass, "pb-16")}>
      {/* verdict + poster stats */}
      <section className="mt-6 border-2 border-foreground bg-surface shadow-pop motion-enter" aria-live="polite">
        <div
          className={cn(
            "border-b-2 border-foreground p-6 text-center",
            data.passed ? "bg-success-soft" : "bg-danger-soft",
          )}
        >
          <SectionLabel>Esito</SectionLabel>
          <p
            className={cn(
              "mt-1 font-mono text-[clamp(2rem,6vw,4.5rem)] font-bold leading-none tracking-tight",
              data.passed ? "text-success" : "text-danger",
            )}
          >
            {data.passed ? "SUPERATO" : "NON SUPERATO"}
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-muted">
            Soglia: massimo {data.allowedErrors} errori · {data.totalQuestions} domande · {Math.round(siteConfig.exam.durationSeconds / 60)} minuti
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <StatBlock label="Corrette" value={String(data.correctCount).padStart(2, "0")} tone="green" />
          <StatBlock label="Errori" value={String(data.errorCount).padStart(2, "0")} tone="pink" />
          <StatBlock label="Non risposte" value={String(data.unansweredCount).padStart(2, "0")} tone="yellow" />
          <StatBlock label="Tempo" value={formatClock(data.timeUsedSeconds * 1000)} tone="blue" />
        </div>

        <div className="flex flex-col gap-2 border-t-2 border-foreground p-4 sm:flex-row">
          <Button fullWidth onClick={() => router.push("/")}>Nuova simulazione</Button>
          {data.errorCount > 0 && (
            <Button variant="outline" fullWidth onClick={scrollToFirstError}>
              Vai al primo errore
            </Button>
          )}
        </div>
      </section>

      {/* sticky compact summary bar with filters */}
      <div className="result-filters mt-6 border-y-2 border-foreground bg-surface py-3">
        <div className="result-filter-options">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => changeFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "min-h-12 min-w-0 border-2 border-foreground px-2 py-2 text-center font-mono text-sm font-medium leading-snug transition-colors",
                filter === f.key ? "bg-foreground text-white" : "bg-surface text-foreground hover:bg-accent-blue",
              )}
            >
              {f.label} ({f.count})
            </button>
          ))}
          <span className="ml-auto hidden shrink-0 font-mono text-xs uppercase text-muted sm:block">
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
                "scroll-mt-20 border-2 border-foreground bg-surface",
                !q.correct && "border-l-8 border-l-danger",
              )}
            >
              <EditorialAccordion
                open={open.has(q.position)}
                onToggle={() => toggle(q.position)}
                trigger={
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center border-2 border-foreground font-mono text-xs font-semibold tabular-nums",
                        q.correct ? "bg-success-soft" : q.unanswered ? "bg-surface" : "bg-danger-soft",
                      )}
                    >
                      {q.position}
                    </span>
                    <span className="min-w-0 flex-1 text-base leading-relaxed">{q.statement}</span>
                    <span
                      className="font-mono text-xs font-medium uppercase"
                      aria-label={q.correct ? "Corretta" : q.unanswered ? "Non risposta" : "Errata"}
                    >
                      {q.correct ? "✓" : q.unanswered ? "—" : "✗"}
                    </span>
                    <span aria-hidden className={cn("font-mono text-muted transition-transform", open.has(q.position) && "rotate-45")}>
                      +
                    </span>
                  </>
                }
              >
                {q.topic && <span className="font-mono text-xs uppercase tracking-wide text-primary">{q.topic}</span>}
                {q.imageUrl && (
                  <div className="mt-3">
                    <QuestionImage src={q.imageUrl} width={null} height={null} className="result-image border border-foreground/30" />
                  </div>
                )}
                <p className="mt-4 text-base leading-relaxed">{q.statement}</p>
                <dl className="result-details mt-4">
                  <div className="min-w-0">
                    <dt className="font-mono text-sm text-muted">Risposta data</dt>
                    <dd>
                      {q.selectedAnswer === null ? (
                        <span className="font-medium text-danger">Non risposta</span>
                      ) : (
                        <span className="font-medium">{q.selectedAnswer ? "VERO" : "FALSO"}</span>
                      )}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-sm text-muted">Risposta corretta</dt>
                    <dd className="font-medium">{q.correctAnswer ? "VERO" : "FALSO"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-sm text-muted">Codice</dt>
                    <dd className="tabular-nums">{q.officialQuestionCode ?? "—"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-sm text-muted">Gruppo</dt>
                    <dd>{q.groupCode ?? "—"}</dd>
                  </div>
                </dl>
              </EditorialAccordion>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
