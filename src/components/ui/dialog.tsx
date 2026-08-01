"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Accessible modal dialog: role=dialog, aria-modal, Esc to close, backdrop
 * click to close (except while busy), focus moved on open, focus trap.
 * Editorial style: flat white surface, black 2px border, hard shadow.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el) {
      const focusables = el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      (focusables[0] ?? el).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && el) {
        const focusables = el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocused.current?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/60" aria-hidden onClick={busy ? undefined : onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-md rounded-md border-2 border-foreground bg-surface p-5 shadow-pop motion-scale-in sm:rounded-md"
      >
        <h2 className="font-mono text-lg font-semibold uppercase tracking-wide">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
