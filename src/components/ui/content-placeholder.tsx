import styles from "./page-skeleton.module.css";
export function ContentPlaceholder({ label }: { label: string }) {
  return <div className={styles.content} role="status" aria-label={label} aria-busy="true"><span className="sr-only">{label}</span>{[0,1,2].map(n=><div className={styles.row} key={n}><i/><i/></div>)}</div>;
}
