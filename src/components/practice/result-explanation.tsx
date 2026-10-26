import type { PracticeExplanation } from "@/lib/practice/types";
import styles from "./result-explanation.module.css";

export function ResultExplanation({ explanation }: { explanation?: PracticeExplanation | null }) {
  return <aside className={styles.panel} aria-label="Spiegazione della risposta">
    <strong>Perché questa risposta</strong>
    <p>{explanation?.text ?? "La soluzione è quella del catalogo della sessione. Per questa versione del quesito non è disponibile una spiegazione verificata."}</p>
    {explanation?.remember && <p className={styles.remember}><b>Da ricordare:</b> {explanation.remember}</p>}
    {explanation && <a href={explanation.sourceUrl} target="_blank" rel="noreferrer">{explanation.sourceLabel} ↗</a>}
  </aside>;
}
