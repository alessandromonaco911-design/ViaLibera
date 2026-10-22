"use client";
import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "./use-modal-focus";
import { cn } from "@/lib/utils/cn";

export function Dialog({ open, onClose, title, children, busy = false, size = "default" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  busy?: boolean; size?: "default" | "image";
}) {
  const ref = useModalFocus(open, onClose, busy);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className={cn("dialog-overlay fixed inset-0 isolate z-50 flex justify-center p-3 sm:p-6", size === "image" ? "items-center" : "items-end sm:items-center")}>
      <div className="absolute inset-0 bg-foreground/60" aria-hidden onClick={busy ? undefined : onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cn("dialog-panel relative z-10 w-full overflow-y-auto rounded-md border-2 border-foreground bg-surface p-4 shadow-pop motion-scale-in sm:p-6", size === "image" ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 py-2 font-mono text-lg font-semibold leading-snug">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Chiudi"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center border-2 border-foreground text-xl hover:bg-accent-blue disabled:opacity-50">✕</button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>, document.body,
  );
}
