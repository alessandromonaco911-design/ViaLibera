"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Question image with an elegant fallback when the file is missing:
 * a neutral placeholder keeps the layout stable (fixed aspect area).
 */
export function QuestionImage({
  src,
  width,
  height,
  className,
  alt = "Immagine del quesito",
}: {
  src: string;
  width: number | null;
  height: number | null;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn("flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface", className)}
        role="img"
        aria-label="Immagine non disponibile"
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeOpacity="0.35" />
          <circle cx="9" cy="9" r="2" stroke="currentColor" strokeOpacity="0.35" />
          <path d="M4 18 L10 12 L13 15 L16 12 L20 16" stroke="currentColor" strokeOpacity="0.35" />
        </svg>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      onError={() => setFailed(true)}
      loading="lazy"
      className={className}
    />
  );
}
