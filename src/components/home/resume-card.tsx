"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listInProgressSessions,
  clearPersistedState,
  unregisterSession,
  type PersistedExamState,
} from "@/lib/exam/local-state";
import { remainingMs, formatClock } from "@/lib/exam/timer";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";

/** Homepage card: resume an in-progress anonymous session. */
export function ResumeCard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PersistedExamState[] | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setSessions(listInProgressSessions(localStorage, Date.now()));
      } catch {
        setSessions([]);
      }
      setNowMs(Date.now());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (sessions === null || sessions.length === 0) return null;

  return (
    <section aria-label="Simulazione in corso" className="w-full max-w-md">
      {sessions.map((s) => {
        const remaining = nowMs > 0 ? remainingMs(s.expiresAt, nowMs) : 0;
        const answered = Object.keys(s.answers ?? {}).length;
        return (
          <div key={s.sessionId} className="mb-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Simulazione in corso</h2>
              <span className="text-xs text-muted">patente {siteConfig.licenseCategory}</span>
            </div>
            <div className="mt-3 flex gap-6 text-sm">
              <span>
                <span className="block text-xs text-muted">Tempo residuo</span>
                <b className="tabular-nums">{formatClock(remaining)}</b>
              </span>
              <span>
                <span className="block text-xs text-muted">Risposte date</span>
                <b>{answered} / {siteConfig.exam.totalQuestions}</b>
              </span>
            </div>
            <div className="mt-4 flex gap-3">
              <Button
                variant="primary"
                fullWidth
                onClick={() => router.push(`/simulazione/${s.sessionId}`)}
              >
                Continua
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm("Abbandonare la simulazione? Le risposte locali verranno rimosse.")) {
                    clearPersistedState(localStorage, s.sessionId);
                    unregisterSession(localStorage, s.sessionId);
                    setSessions(listInProgressSessions(localStorage, Date.now()));
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
