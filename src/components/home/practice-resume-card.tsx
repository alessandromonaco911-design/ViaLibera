"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listInProgressPractice,
  clearPersistedPracticeState,
  unregisterPracticeSession,
  type PersistedPracticeState,
} from "@/lib/practice/local-state";
import { Button } from "@/components/ui/button";

/** Homepage card: resume an in-progress practice session (separate from exam). */
export function PracticeResumeCard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PersistedPracticeState[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setSessions(listInProgressPractice(localStorage));
      } catch {
        setSessions([]);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (sessions === null || sessions.length === 0) return null;

  return (
    <section aria-label="Allenamento in corso" className="w-full max-w-md">
      {sessions.map((s) => {
        const verifiedEntries = Object.values(s.verified ?? {});
        const correct = verifiedEntries.filter((v) => v.isCorrect).length;
        const errors = verifiedEntries.filter((v) => !v.isCorrect).length;
        return (
          <div key={s.sessionId} className="mb-4 border-2 border-foreground bg-accent-yellow p-5 shadow-pop">
            <div className="flex items-center justify-between gap-2 border-b-2 border-foreground pb-2">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wide">
                {s.mode === "mistakes" ? "Ripasso errori in corso" : "Allenamento in corso"}
              </h2>
              <span className="font-mono text-xs uppercase text-muted">senza tempo</span>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted">
              {s.topicName || (s.mode === "mistakes" ? "Ripasso errori" : "Allenamento")}
            </p>
            <div className="mt-3 flex gap-6 text-sm">
              <span>
                <span className="block font-mono text-xs uppercase text-muted">Verificate</span>
                <b className="font-mono tabular-nums">
                  {verifiedEntries.length} / {s.totalQuestions}
                </b>
              </span>
              <span>
                <span className="block font-mono text-xs uppercase text-muted">Corrette</span>
                <b className="font-mono tabular-nums text-success">{correct}</b>
              </span>
              <span>
                <span className="block font-mono text-xs uppercase text-muted">Errate</span>
                <b className="font-mono tabular-nums text-danger">{errors}</b>
              </span>
            </div>
            <div className="mt-4 flex gap-3">
              <Button
                variant="primary"
                fullWidth
                onClick={() => router.push(`/allenamento/${s.sessionId}`)}
              >
                Continua
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm("Abbandonare l'allenamento? Le risposte locali verranno rimosse.")) {
                    clearPersistedPracticeState(localStorage, s.sessionId);
                    unregisterPracticeSession(localStorage, s.sessionId);
                    setSessions(listInProgressPractice(localStorage));
                  }
                }}
              >
                Abbandona
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
