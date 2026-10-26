import { Brand } from "@/components/brand/brand";
import styles from "./page-skeleton.module.css";

/** Structural placeholders contain no invented question, score or answer. */
export function PageSkeleton({ kind = "hub" }: { kind?: "hub" | "quiz" | "result" }) {
  const label = kind === "quiz" ? "Preparazione delle domande" : kind === "result" ? "Preparazione del risultato" : "Apertura di ViaLibera";
  return <div className={styles.shell} data-page-skeleton={kind} role="status" aria-label={label} aria-busy="true">
    <header><Brand/><span className={styles.bar}/></header>
    <main><span className={styles.title}/>{kind === "quiz" ? <div className={styles.quiz}><div className={styles.lines}><i/><i/><i/></div><span className={styles.figure}/></div> : <div className={styles.card}>{[0,1,2].map(n=><div className={styles.row} key={n}><i/><i/><i/></div>)}</div>}</main>
    <footer><i/><i/><i/></footer>
    <span className="sr-only">{label}…</span>
  </div>;
}
