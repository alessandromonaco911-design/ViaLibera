import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Single layout shell for the whole app.
 *
 * HOME IS THE VISUAL SOURCE OF TRUTH: every route (simulazione, allenamento,
 * risultati) must reuse this exact geometry instead of inventing its own
 * container. Replicates the home page: max-w-6xl (1152px) centered on
 * desktop, full width with px-4 (16px) gutters on mobile, px-6 from sm+.
 */
export const pageShellClass = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export function PageShell({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(pageShellClass, className)} {...rest}>
      {children}
    </div>
  );
}
