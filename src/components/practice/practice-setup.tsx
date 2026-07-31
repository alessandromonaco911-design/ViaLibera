"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { PracticeTopicSummary } from "@/lib/practice/types";

/**
 * Session configuration for a topic: pick 10/20/30 questions and start.
 * Options exceeding the topic's available questions are disabled (no
 * duplication to reach the count).
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
    <section aria-label="Configurazione allenamento" className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold">Numero di domande</h2>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Numero di domande">
        {options.map((n) => {
          const disabled = topic.questionCount < n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => !disabled && setCount(n)}
              disabled={disabled}
              aria-pressed={count === n}
              aria-label={`${n} domande${disabled ? " (non disponibile)" : ""}`}
              className={cn(
                "h-14 rounded-xl border-2 text-base font-semibold transition-colors",
                disabled
                  ? "cursor-not-allowed border-border bg-black/5 text-muted opacity-60"
                  : count === n
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-surface text-foreground hover:border-primary/40",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {options.some((n) => topic.questionCount < n) && (
        <p className="mt-2 text-xs text-muted">
          Questo argomento ha {topic.questionCount} domande: le opzioni non disponibili sono disattivate.
        </p>
      )}

      <dl className="mt-5 space-y-2 rounded-xl bg-black/5 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Argomento</dt>
          <dd className="text-right font-medium">{topic.name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Quesiti disponibili</dt>
          <dd className="tabular-nums">{topic.questionCount}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Domande scelte</dt>
          <dd className="tabular-nums">{count}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Modalità</dt>
          <dd>Feedback immediato</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Tempo</dt>
          <dd>Nessun limite</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted">Puoi cambiare risposta finché non premi Verifica.</p>

      <div className="mt-4">
        <Button size="lg" fullWidth onClick={start} disabled={busy} aria-busy={busy}>
          {busy ? "Preparazione…" : "Inizia allenamento"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
