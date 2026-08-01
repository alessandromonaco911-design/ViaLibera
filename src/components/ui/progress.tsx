"use client";

/** Linear progress bar (timer / answered progress). Flat editorial style. */
export function Progress({
  value,
  max,
  tone = "primary",
  className,
}: {
  value: number;
  max: number;
  tone?: "primary" | "danger" | "warning";
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color =
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-foreground";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`h-2 w-full overflow-hidden border border-foreground bg-surface ${className ?? ""}`}
    >
      <div
        className={`h-full transition-[width] duration-300 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
