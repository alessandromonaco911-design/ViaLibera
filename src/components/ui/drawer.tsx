"use client";

import { useEffect, type ReactNode } from "react";

/** Bottom-sheet drawer (mobile navigator). Editorial flat style. */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0 bg-foreground/60" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[82dvh] w-full flex-col rounded-t-md border-t-2 border-foreground bg-surface shadow-pop motion-enter"
      >
        <div className="flex items-center justify-between border-b-2 border-foreground px-5 pt-4 pb-2">
          <h2 className="font-mono text-base font-semibold uppercase tracking-wide">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi navigatore"
            className="inline-flex h-11 w-11 items-center justify-center rounded-sm border-2 border-foreground font-mono hover:bg-accent-blue"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
