"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { QuestionImage } from "@/components/exam/question-image";
import { cn } from "@/lib/utils/cn";
import type { PracticeResult } from "@/lib/practice/types";

type Filter = "all" | "correct" | "errors" | "unanswered";

const FILTER_PARAM: Record<Filter, string> = { all: "all", correct: "correct", errors: "errors", unanswered: "unanswered" };

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Final practice summary: no "SUPERATO/NON SUPERATO" (it's not an exam). */
export function PracticeResultView({ result, topicName }: { result: PracticeResult; topicName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("filter") as Filter | null) ?? "all";
  const [filter, setFilter] = useState<Filter>(initial === "correct" || initial === "errors" || initial === "unanswered" ? initial : "all");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [mistakesBusy, setMistakesBusy] = useState(false);
  const [mistakesError, setMistakesError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "correct") return result.answers.filter((a) => a.isCorrect);
    if (filter === "errors") return result.answers.filter((a) => !a.isCorrect && !a.unanswered);
    if (filter === "unanswered") return result.answers.filter((a) => a.unanswered);
    return result.answers;
  }, [result.answers, filter]);

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
    router.replace(`/allenamento/${result.sessionId}/risultato?filter=${FILTER_PARAM[f]}`);
  };

  const hasErrors = result.errorCount > 0;

  async function ripassaErrori() {
    if (mistakesBusy) return;
    setMistakesBusy(true);
    setMistakesError(null);
    try {
      const res = await fetch("/api/practice/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSessionId: result.sessionId }),
      });
      const data = (await res.json().catch(() => null)) as { sessionId?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.sessionId) {
        setMistakesError(data?.error?.message ?? "Impossibile avviare il ripasso degli errori.");
        setMistakesBusy(false);
        return;
      }
      router.push(`/allenamento/${data.sessionId}`);
    } catch {
      setMistakesError("Errore di rete. Riprova.");
      setMistakesBusy(false);
    }
  }

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Tutte", count: result.answers.length },
    { key: "correct", label: "Corrette", count: result.correctCount },
    { key: "errors", label: "Errori", count: result.errorCount },
    { key: "unanswered", label: "Non risposte", count: result.unansweredCount },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      {/* summary */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5 text-center shadow-card" aria-live="polite">
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {result.mode === "mistakes" ? "Ripasso completato" : "Allenamento completato"}
        </p>
        <p className="mt-1 text-sm text-muted">{topicName}</p>
        <p className="mt-3 text-base font-medium">
          Hai risposto correttamente a {result.correctCount} domande su {result.totalQuestions}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Corrette</span>
            <b className="text-lg tabular-nums text-success">{result.correctCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Errori</span>
            <b className="text-lg tabular-nums text-danger">{result.errorCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Non risposte</span>
            <b className="text-lg tabular-nums">{result.unansweredCount}</b>
          </div>
          <div className="rounded-lg bg-black/5 p-2.5">
            <span className="block text-xs text-muted">Tempo</span>
            <b className="text-lg tabular-nums">{formatClock(result.timeUsedSeconds * 1000)}</b>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Percentuale di corrette sulle domande verificate: {result.percentage}%</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button fullWidth onClick={() => router.push(`/allenamento/argomento/${result.topic.id}`)}>
            Ripeti argomento
          </Button>
          {hasErrors && (
            <Button variant="primary" fullWidth onClick={() => void ripassaErrori()} disabled={mistakesBusy} aria-busy={mistakesBusy}>
              {mistakesBusy ? "Preparazione…" : "Ripassa gli errori"}
            </Button>
          )}
          <Button variant="outline" fullWidth onClick={() => router.push("/allenamento")}>
            Cambia argomento
          </Button>
        </div>
        <div className="mt-2">
          <Button variant="ghost" fullWidth onClick={() => router.push("/")}>
            Torna alla home
          </Button>
        </div>
        {mistakesError && (
          <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {mistakesError}
          </p>
        )}
      </section>

      {/* filters */}
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
        </div>
      </div>

      {/* question list */}
      <section className="mt-4" aria-label="Dettaglio domande">
        <ul className="space-y-2">
          {filtered.map((a) => (
            <li key={a.questionId} className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <button
                type="button"
                onClick={() => toggle(a.position)}
                aria-expanded={open.has(a.position)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                    a.isCorrect
                      ? "bg-success-soft text-success"
                      : a.unanswered
                        ? "bg-black/5 text-muted"
                        : "bg-danger-soft text-danger",
                  )}
                >
                  {a.position}
                </span>
                <span className="flex-1 truncate text-sm">{a.statement}</span>
                <span
                  className="text-xs font-medium"
                  aria-label={a.isCorrect ? "Corretta" : a.unanswered ? "Non risposta" : "Errata"}
                >
                  {a.isCorrect ? "✓" : a.unanswered ? "—" : "✗"}
                </span>
              </button>
              {open.has(a.position) && (
                <div className="border-t border-border px-4 py-3">
                  {a.image && (
                    <div className="mt-2 max-w-[220px]">
                      <QuestionImage
                        src={a.image.url}
                        width={a.image.width}
                        height={a.image.height}
                        className="w-full rounded-lg border border-border object-contain"
                      />
                    </div>
                  )}
                  <p className="mt-2 text-sm leading-relaxed">{a.statement}</p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Risposta data</dt>
                      <dd>
                        {a.unanswered ? (
                          <span className="font-medium text-danger">Non risposta</span>
                        ) : (
                          <span className="font-medium">{a.selectedAnswer ? "VERO" : "FALSO"}</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Risposta corretta</dt>
                      <dd className="font-medium">{a.correctAnswer ? "VERO" : "FALSO"}</dd>
                    </div>
                    {a.topic && (
                      <div className="flex gap-2">
                        <dt className="w-32 shrink-0 text-muted">Argomento</dt>
                        <dd>{a.topic}</dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Codice</dt>
                      <dd className="tabular-nums">{a.officialQuestionCode ?? "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 text-muted">Gruppo</dt>
                      <dd>{a.groupCode ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t border-border py-6 text-center text-xs text-muted">
        {siteConfig.name} · allenamento senza limite di tempo
      </footer>
    </div>
  );
}
