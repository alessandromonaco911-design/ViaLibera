"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand/brand";
import { useModalFocus } from "./use-modal-focus";
import styles from "./task-transition.module.css";

type Kind = "practice" | "exam" | "result" | "next" | "review";
type Journey = { id: number; origin: string; kind: Kind; leaving: boolean };
const copy: Record<Kind, [string, string]> = {
  practice: ["Si parte.", "Prepariamo il tuo allenamento."],
  exam: ["Pronto a metterti alla prova?", "Prepariamo le domande d’esame."],
  result: ["Facciamo il punto.", "Prepariamo risposte e spiegazioni."],
  next: ["Continuiamo.", "Arrivano le prossime domande."],
  review: ["Ripartiamo dagli errori.", "Prepariamo il tuo ripasso."],
};
const noop = () => {};
const fallback: { begin: (kind: Kind) => void; finish: () => void; arrive: (path: string) => void } = { begin: noop, finish: noop, arrive: noop };
const Context = createContext(fallback);
export const useTaskTransition = () => useContext(Context);

/** Called by the destination's real content, never by a loading fallback. */
export function useTaskArrival() {
  const { arrive } = useTaskTransition();
  const path = usePathname();
  useEffect(() => { arrive(path); }, [arrive, path]);
}

export function TaskTransitionProvider({ children }: { children: ReactNode }) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const live = useRef<Journey | null>(null), sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback(() => {
    if (!live.current || live.current.leaving) return;
    live.current = { ...live.current, leaving: true }; setJourney(live.current);
    timer.current = setTimeout(() => { live.current = null; setJourney(null); }, 150);
  }, []);
  const begin = useCallback((kind: Kind) => {
    if (timer.current) clearTimeout(timer.current);
    live.current = { id: ++sequence.current, origin: window.location.pathname, kind, leaving: false };
    setJourney(live.current);
  }, []);
  const arrive = useCallback((path: string) => {
    const pending = live.current;
    if (!pending || pending.origin === path) return;
    // Let the destination and its safe-area sizing commit before uncovering it.
    requestAnimationFrame(() => requestAnimationFrame(() => { if (live.current?.id === pending.id) finish(); }));
  }, [finish]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ begin, finish, arrive }), [begin, finish, arrive]);
  return <Context.Provider value={value}>
    <div inert={!!journey && !journey.leaving} data-task-content>{children}</div>
    {journey && <TaskCurtain kind={journey.kind} leaving={journey.leaving} onDismiss={finish}/>}
  </Context.Provider>;
}

function TaskCurtain({ kind, leaving, onDismiss }: { kind: Kind; leaving: boolean; onDismiss: () => void }) {
  const ref = useModalFocus(!leaving, onDismiss);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const visibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  return <div className={styles.curtain} data-task-transition data-leaving={leaving} data-paused={paused} ref={ref} role="dialog" aria-modal="true" aria-label="Passaggio in corso" tabIndex={-1} onKeyDown={event=>event.stopPropagation()}>
    <header><Brand/></header>
    <div className={styles.content}>
      <div className={styles.scene} aria-hidden="true">
        <svg viewBox="0 0 260 110" fill="none">
          <path d="M0 82H260V110H0Z" fill="var(--foreground)"/>
          <g className={styles.road}><path d="M-60 97H-28M0 97H32M60 97H92M120 97H152M180 97H212M240 97H272M300 97H332" stroke="var(--background)" strokeWidth="3"/></g>
          <g className={styles.car}><path d="M77 58L89 32Q92 26 101 26H133Q141 26 147 34L166 57L180 62V78H70V66Z" fill="var(--accent-blue)" stroke="var(--foreground)" strokeWidth="3" strokeLinejoin="round"/><path d="M88 52L98 34H115V52ZM122 34H133L147 52H122Z" fill="var(--accent-yellow)" stroke="var(--foreground)" strokeWidth="2"/><circle cx="94" cy="78" r="11" fill="var(--foreground)"/><circle cx="158" cy="78" r="11" fill="var(--foreground)"/><circle cx="94" cy="78" r="4" fill="var(--surface)"/><circle cx="158" cy="78" r="4" fill="var(--surface)"/></g>
        </svg>
      </div>
      <h2>{copy[kind][0]}</h2>
      <p role="status" aria-live="polite">{leaving ? "Tutto pronto." : copy[kind][1]}</p>
      <div className={styles.activity} aria-hidden="true"><span/></div>
    </div>
    <button className={styles.dismiss} onClick={onDismiss}>Mostra la pagina</button>
  </div>;
}
