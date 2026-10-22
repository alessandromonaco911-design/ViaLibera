"use client";

import { useCallback, useEffect, useState } from "react";
import { listInProgressSessions, clearPersistedState, unregisterSession } from "@/lib/exam/local-state";
import { listInProgressPractice, clearPersistedPracticeState, unregisterPracticeSession } from "@/lib/practice/local-state";

export interface ResumeSession { id: string; title: string; progress: string; href: string; type: "exam" | "practice"; saved: string }
export function useResumeSessions() {
  const [sessions, setSessions] = useState<ResumeSession[]>([]);
  const reload = useCallback(() => {
    try {
      const exams: ResumeSession[] = listInProgressSessions(localStorage, Date.now()).map(s => ({ id: s.sessionId, title: "Prova d’esame", progress: `${Object.keys(s.answers ?? {}).length} / 30 risposte`, href: `/simulazione/${s.sessionId}`, type: "exam", saved: s.lastSavedAt }));
      const practices: ResumeSession[] = listInProgressPractice(localStorage).map(s => ({ id: s.sessionId, title: s.mode === "mistakes" ? "Ripasso errori" : "Allenamento", progress: `${Object.keys(s.verified ?? {}).length} / ${s.totalQuestions} verificate`, href: `/allenamento/${s.sessionId}`, type: "practice", saved: s.lastSavedAt }));
      setSessions([...exams, ...practices].sort((a, b) => b.saved.localeCompare(a.saved)));
    } catch { setSessions([]); }
  }, []);
  useEffect(() => {
    const first = setTimeout(reload, 0), timer = setInterval(reload, 30000);
    window.addEventListener("storage", reload); window.addEventListener("focus", reload);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("storage", reload); window.removeEventListener("focus", reload); };
  }, [reload]);
  const discard = (session: ResumeSession) => {
    if (session.type === "exam") { clearPersistedState(localStorage, session.id); unregisterSession(localStorage, session.id); }
    else { clearPersistedPracticeState(localStorage, session.id); unregisterPracticeSession(localStorage, session.id); }
    reload();
  };
  return { sessions, discard };
}
