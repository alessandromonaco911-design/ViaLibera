import styles from "./brand.module.css";

/** Shared mark: the same SVG is used to generate Home icons and the share cover. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={styles.brand} data-brand data-compact={compact || undefined}>
    {/* eslint-disable-next-line @next/next/no-img-element -- tiny, shared vector mark */}
    <img src="/brand/traffic-light.svg" width="16" height="36" alt="" />
    <span className={styles.wordmark}>ViaLibera</span>
  </span>;
}
