"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Editorial accordion row with hover-intent expansion on desktop.
 *
 * - Click/tap toggles immediately (keyboard/mobile friendly).
 * - Hover (pointer:fine only) opens after a small intentional delay
 *   (300ms) and closes when the pointer leaves; quick sweeps across
 *   many rows never open anything.
 * - aria-expanded stays correct; the trigger remains a real <button>.
 * - Content animates with a light expand (grid-template-rows) +
 *   opacity, ~180ms, consistent with the design system easing.
 */
export function EditorialAccordion({
  trigger,
  open,
  onToggle,
  children,
  className,
}: {
  trigger: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouch = useRef(false);
  const contentId = useId();

  useEffect(() => {
    // detect coarse pointers once; never enable hover-intent on touch
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      isTouch.current = true;
    }
  }, []);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const onRowEnter = () => {
    if (isTouch.current) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverOpen(true), 300);
  };

  const onRowLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHoverOpen(false);
  };

  const expanded = open || hoverOpen;

  return (
    <div
      className={cn(className)}
      onMouseEnter={onRowEnter}
      onMouseLeave={onRowLeave}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        {trigger}
      </button>
      <div
        id={contentId}
        aria-hidden={!expanded}
        inert={!expanded}
        className={cn(
          "grid transition-[grid-template-rows,opacity] motion-safe:duration-[180ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t-2 border-foreground px-4 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
