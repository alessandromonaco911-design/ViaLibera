import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Editorial grid section with hard top/bottom borders. */
export function EditorialSection({
  className,
  children,
  border = true,
}: {
  className?: string;
  children: ReactNode;
  border?: boolean;
}) {
  return (
    <section
      className={cn(
        border && "border-y-2 border-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Small mono uppercase label (section marker). */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-xs uppercase tracking-[0.18em] text-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Poster-like statistic block: mono label + very large value + pastel fill. */
export function StatBlock({
  label,
  value,
  tone = "white",
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  tone?: "white" | "blue" | "yellow" | "pink" | "green" | "orange";
  className?: string;
  valueClassName?: string;
}) {
  const fills: Record<string, string> = {
    white: "bg-surface",
    blue: "bg-accent-blue",
    yellow: "bg-accent-yellow",
    pink: "bg-accent-pink",
    green: "bg-accent-green",
    orange: "bg-accent-orange",
  };
  return (
    <div className={cn("border-2 border-foreground p-4", fills[tone], className)}>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-3xl font-semibold leading-none tabular-nums sm:text-4xl", valueClassName)}>{value}</p>
    </div>
  );
}

/**
 * Horizontal marquee strip (homepage only). Duplicates children for a
 * continuous loop; stops under prefers-reduced-motion (handled in CSS).
 */
export function MarqueeStrip({ items }: { items: string[] }) {
  const row = items.map((it, i) => (
    <span key={i} className="mx-6 shrink-0 font-mono text-sm uppercase tracking-[0.2em]">
      {it}
    </span>
  ));
  return (
    <div aria-hidden className="overflow-hidden border-y-2 border-foreground bg-accent-yellow py-2">
      <div className="marquee-track">
        <div className="flex shrink-0 items-center">{row}</div>
        <div className="flex shrink-0 items-center">{row}</div>
      </div>
    </div>
  );
}
