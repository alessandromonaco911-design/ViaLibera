"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/editorial";
import { cn } from "@/lib/utils/cn";
import type { PracticeTopicSummary } from "@/lib/practice/types";

/**
 * Session configuration for a topic: pick 10/20/30 and start.
 * Editorial card with a three-cell rectangular selector.
 * Options exceeding the topic's questions are disabled (no duplication).
 */
export function PracticeSetup({ topic }: { topic: PracticeTopicSummary }) {
  const router = useRouter();
  const [count, setCount] = useState<number>(siteConfig.practice.defaultQuestionCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = siteConfig.practice.questionCounts;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, questionCount: count }),
      });
      const data = (await res.json().catch(() => null)) as { sessionId?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.sessionId) {
        setError(data?.error?.message ?? "Impossibile avviare l'allenamento. Riprova.");
        setBusy(false);
        return;
      }
      router.push(`/allenamento/${data.sessionId}`);
    } catch {
      setError("Errore di rete. Verifica la connessione e riprova.");
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Configurazione allenamento"
      className="min-w-0 border-2 border-foreground bg-accent-yellow p-4 shadow-pop motion-enter editorial-delay-1 sm:p-8"
    >
      <SectionLabel>Allenamento per argomento</SectionLabel>
      <h2 className="mt-1 font-mono text-xl font-semibold uppercase tracking-tight">Numero di domande</h2>

      <div className="mt-4 grid grid-cols-3 border-2 border-foreground" role="group" aria-label="Numero di domande">
        {options.map((n) => {
          const disabled = topic.questionCount < n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => !disabled && setCount(n)}
              disabled={disabled}
              aria-pressed={count === n}
              aria-disabled={disabled}
              aria-label={`${n} domande${disabled ? " (non disponibile)" : ""}`}
              className={cn(
                "flex h-16 flex-col items-center justify-center border-r-2 border-foreground transition-colors last:border-r-0",
                disabled
                  ? "cursor-not-allowed bg-black/10 text-muted opacity-60"
                  : count === n
                    ? "bg-foreground text-white"
                    : "bg-surface text-foreground hover:bg-accent-blue",
              )}
            >
              <span className="font-mono text-2xl font-semibold leading-none">{n}</span>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]">Domande</span>
            </button>
          );
        })}
      </div>

      {options.some((n) => topic.questionCount < n) && (
        <p className="mt-2 font-mono text-xs uppercase tracking-wide text-muted">
          Argomento con {topic.questionCount} domande: opzioni non disponibili disattivate.
        </p>
      )}

      <dl className="mt-5 space-y-3 border-2 border-foreground bg-surface p-3 text-base">
        <div className="flex justify-between gap-3">
          <dt className="uppercase text-muted">Quesiti disponibili</dt>
          <dd className="tabular-nums">{topic.questionCount}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-foreground/30 pt-2">
          <dt className="uppercase text-muted">Domande scelte</dt>
          <dd className="tabular-nums">{count}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-foreground/30 pt-2">
          <dt className="uppercase text-muted">Modalità</dt>
          <dd>
            <span className="inline-flex items-center border border-foreground bg-accent-blue px-2 py-0.5 font-mono text-xs uppercase tracking-wide">
              Feedback immediato
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-foreground/30 pt-2">
          <dt className="uppercase text-muted">Tempo</dt>
          <dd>Nessun limite</dd>
        </div>
      </dl>

      <p className="mt-4 text-base leading-relaxed text-muted">
        Puoi cambiare risposta finché non premi Verifica.
      </p>

      <div className="mt-4">
        <Button size="lg" fullWidth onClick={start} disabled={busy} aria-busy={busy}>
          {busy ? "Preparazione…" : "Inizia allenamento"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 border-2 border-foreground bg-danger-soft p-3 font-mono text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
