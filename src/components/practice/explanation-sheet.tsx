"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import type { PracticeExplanation } from "@/lib/practice/types";
import { questionEmphasis } from "@/lib/practice/question-emphasis";
import styles from "./explanation-sheet.module.css";

/** Short reading pages keep all controls visible even on a compact phone. */
export function explanationPages(text: string, limit = 175): string[] {
  const words = text.trim().split(/\s+/);
  const pages: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > limit) { pages.push(current); current = ""; }
    current += (current ? " " : "") + word;
  }
  if (current) pages.push(current);
  return pages;
}

function Emphasis({ text }: { text: string }) {
  return text.split(/(abbaglianti|proiettori di profondità|blu|mezzi indicati|servizio pubblico|\b3,6\b)/gi).map((part, i) =>
    /^(abbaglianti|proiettori di profondità|blu|mezzi indicati|servizio pubblico|3,6)$/i.test(part)
      ? <strong key={i}>{part}</strong>
      : questionEmphasis(part).map((segment, j) => segment.emphasized ? <strong key={`${i}-${j}`}>{segment.text}</strong> : segment.text));
}

const subscribeSize = (update: () => void) => { window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); };
const readingLimit = () => window.innerHeight < 700 && window.innerWidth < 560 ? 96 : 175;

export function ExplanationSheet({ open, onClose, onContinue, isCorrect, selectedAnswer, explanation, position, total, isLast }: {
  open: boolean; onClose: () => void; onContinue: () => void;
  isCorrect: boolean; selectedAnswer: boolean; explanation: PracticeExplanation | null;
  position: number; total: number; isLast: boolean;
}) {
  const title = useId();
  const ref = useModalFocus(open, onClose);
  const [page, setPage] = useState(0);
  const limit = useSyncExternalStore(subscribeSize, readingLimit, () => 175);
  const pages = explanationPages(explanation?.text ?? "La soluzione è verificata nel catalogo della sessione. Per questa versione del quesito non è disponibile una spiegazione.", limit);
  const index = Math.min(page, pages.length - 1);
  const solution = isCorrect ? selectedAnswer : !selectedAnswer;
  return createPortal(<div className={styles.overlay} data-open={open} aria-hidden={!open} inert={!open}>
    <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
    <section className={styles.panel} ref={ref} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} data-explanation-sheet>
      <header className={styles.heading}>
        <span className={styles.resultIcon} data-correct={isCorrect} aria-hidden="true">{isCorrect ? "✓" : "×"}</span>
        <div><h2 id={title}>{isCorrect ? "Risposta corretta" : "Risposta errata"}</h2>
          <p className={styles.solution}>Hai risposto {selectedAnswer ? "VERO" : "FALSO"} · Soluzione {solution ? "VERO" : "FALSO"}</p></div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Rivedi la domanda">×</button>
      </header>
      <div className={styles.reading}>
        <p className={styles.explanation} aria-live="polite"><Emphasis text={pages[index]} /></p>
        {pages.length > 1 && <div className={styles.pagination} aria-label="Pagine della spiegazione">
          <button type="button" onClick={() => setPage(index - 1)} disabled={index === 0} aria-label="Parte precedente">←</button>
          <span>{index + 1} / {pages.length}</span>
          <button type="button" onClick={() => setPage(index + 1)} disabled={index === pages.length - 1} aria-label="Parte successiva">→</button>
        </div>}
      </div>
      {explanation?.remember && <div className={styles.remember}><span>Da ricordare</span><p><Emphasis text={explanation.remember} /></p></div>}
      <div className={styles.actions}>
        <div className={styles.actionRow}><button type="button" className={styles.primary} onClick={onContinue}>{isLast ? "Ho capito, completa →" : "Ho capito, avanti →"}</button>
          {explanation && <a className={styles.source} href={explanation.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Apri fonte: ${explanation.sourceLabel}`} title={explanation.sourceLabel}>↗</a>}</div>
        <div className={styles.meta}><span>Allenamento · {position}{total ? ` / ${total}` : " · senza limite"}</span>{explanation && <span>Fonte: {explanation.sourceLabel}</span>}</div>
      </div>
    </section>
  </div>, document.body);
}
