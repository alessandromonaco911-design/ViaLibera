"use client";
import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "./use-modal-focus";

export function Drawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const ref = useModalFocus(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 isolate z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/60" aria-hidden onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="relative z-10 flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-md border-2 border-foreground bg-surface shadow-pop motion-enter">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-foreground p-4">
          <h2 id={titleId} className="font-mono text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi navigatore"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center border-2 border-foreground text-xl hover:bg-accent-blue">✕</button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>, document.body,
  );
}
