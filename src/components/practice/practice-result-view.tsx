"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { QuestionImage } from "@/components/exam/question-image";
import { StatBlock, SectionLabel } from "@/components/ui/editorial";
import { EditorialAccordion } from "@/components/ui/editorial-accordion";
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
    <div className="shell-wide px-4 pb-16 sm:px-6">
      {/* summary poster */}
      <section className="mt-6 border-2 border-foreground bg-surface shadow-pop motion-enter" aria-live="polite">
        <div className="border-b-2 border-foreground bg-accent-yellow p-6 text-center">
          <SectionLabel>{result.mode === "mistakes" ? "Ripasso errori" : "Allenamento"}</SectionLabel>
          <p className="mt-1 font-mono text-[clamp(1.8rem,5vw,3.5rem)] font-bold leading-none tracking-tight">
            {result.mode === "mistakes" ? "Ripasso completato" : "Allenamento completato"}
          </p>
          <p className="mt-2 font-mono text-sm uppercase tracking-wide text-muted">{topicName}</p>
          <p className="mt-2 text-base font-medium">
            Hai risposto correttamente a {result.correctCount} domande su {result.totalQuestions}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <StatBlock label="Corrette" value={String(result.correctCount).padStart(2, "0")} tone="green" />
          <StatBlock label="Errori" value={String(result.errorCount).padStart(2, "0")} tone="pink" />
          <StatBlock label="Non risposte" value={String(result.unansweredCount).padStart(2, "0")} tone="white" />
          <StatBlock label="Precisione" value={`${result.percentage}%`} tone="blue" />
        </div>

        <p className="px-4 pb-2 font-mono text-xs uppercase tracking-wide text-muted">
          Tempo impiegato: {formatClock(result.timeUsedSeconds * 1000)}
        </p>

        <div className="flex flex-col gap-2 border-t-2 border-foreground p-4 sm:flex-row">
          <Button fullWidth onClick={() => router.push(`/allenamento/argomento/${result.topic.id}`)}>
            Ripeti argomento
          </Button>
          {hasErrors && (
            <Button variant="secondary" fullWidth onClick={() => void ripassaErrori()} disabled={mistakesBusy} aria-busy={mistakesBusy}>
              {mistakesBusy ? "Preparazione…" : "Ripassa gli errori"}
            </Button>
          )}
          <Button variant="outline" fullWidth onClick={() => router.push("/allenamento")}>
            Cambia argomento
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.push("/")}>
            Torna alla home
          </Button>
        </div>
        {mistakesError && (
          <p role="alert" className="mx-4 mb-4 border-2 border-foreground bg-danger-soft p-3 font-mono text-sm text-danger">
            {mistakesError}
          </p>
        )}
      </section>

      {/* filters */}
      <div className="sticky top-0 z-20 -mx-4 mt-6 border-y-2 border-foreground bg-surface px-4 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => changeFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "shrink-0 border-2 border-foreground px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wide transition-colors",
                filter === f.key ? "bg-foreground text-white" : "bg-surface text-foreground hover:bg-accent-blue",
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
            <li key={a.questionId} className={cn("border-2 border-foreground bg-surface", a.unanswered ? "" : !a.isCorrect && "border-l-8 border-l-danger")}>
              <EditorialAccordion
                open={open.has(a.position)}
                onToggle={() => toggle(a.position)}
                trigger={
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center border-2 border-foreground font-mono text-xs font-semibold tabular-nums",
                        a.isCorrect ? "bg-success-soft" : a.unanswered ? "bg-surface" : "bg-danger-soft",
                      )}
                    >
                      {a.position}
                    </span>
                    <span className="flex-1 truncate text-sm">{a.statement}</span>
                    <span
                      className="font-mono text-xs font-medium uppercase"
                      aria-label={a.isCorrect ? "Corretta" : a.unanswered ? "Non risposta" : "Errata"}
                    >
                      {a.isCorrect ? "✓" : a.unanswered ? "—" : "✗"}
                    </span>
                    <span aria-hidden className={cn("font-mono text-muted transition-transform", open.has(a.position) && "rotate-45")}>
                      +
                    </span>
                  </>
                }
              >
                {a.image && (
                  <div className="mt-2 max-w-[220px]">
                    <QuestionImage
                      src={a.image.url}
                      width={a.image.width}
                      height={a.image.height}
                      className="w-full border border-foreground object-contain"
                    />
                  </div>
                )}
                <p className="mt-2 text-sm leading-relaxed">{a.statement}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-mono text-xs uppercase tracking-wide text-muted">Risposta data</dt>
                    <dd>
                      {a.unanswered ? (
                        <span className="font-medium text-danger">Non risposta</span>
                      ) : (
                        <span className="font-medium">{a.selectedAnswer ? "VERO" : "FALSO"}</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-mono text-xs uppercase tracking-wide text-muted">Risposta corretta</dt>
                    <dd className="font-medium">{a.correctAnswer ? "VERO" : "FALSO"}</dd>
                  </div>
                  {a.topic && (
                    <div className="flex gap-2">
                      <dt className="w-32 shrink-0 font-mono text-xs uppercase tracking-wide text-muted">Argomento</dt>
                      <dd>{a.topic}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-mono text-xs uppercase tracking-wide text-muted">Codice</dt>
                    <dd className="tabular-nums">{a.officialQuestionCode ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-32 shrink-0 font-mono text-xs uppercase tracking-wide text-muted">Gruppo</dt>
                    <dd>{a.groupCode ?? "—"}</dd>
                  </div>
                </dl>
              </EditorialAccordion>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t-2 border-foreground py-6 text-center font-mono text-xs uppercase tracking-wide text-muted">
        {siteConfig.name} · allenamento senza limite di tempo
      </footer>
    </div>
  );
}
