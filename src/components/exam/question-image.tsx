"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Question image with an elegant fallback when the file is missing:
 * a neutral placeholder keeps the layout stable (fixed aspect area).
 */
export function QuestionImage(props: {
  src: string;
  width: number | null;
  height: number | null;
  className?: string;
  alt?: string;
  loading?: "eager" | "lazy";
}) {
  return <QuestionImageContent key={props.src} {...props} />;
}

function QuestionImageContent({
  src,
  width,
  height,
  className,
  alt = "Immagine del quesito",
  loading = "lazy",
}: {
  src: string;
  width: number | null;
  height: number | null;
  className?: string;
  alt?: string;
  loading?: "eager" | "lazy";
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // A cached failure may already be complete when the component mounts.
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  if (failed) {
    return (
      <div
        className={cn("flex aspect-[4/3] w-full items-center justify-center border-2 border-dashed border-foreground bg-surface", className)}
        role="img"
        aria-label="Immagine non disponibile"
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeOpacity="0.35" />
          <circle cx="9" cy="9" r="2" stroke="currentColor" strokeOpacity="0.35" />
          <path d="M4 18 L10 12 L13 15 L16 12 L20 16" stroke="currentColor" strokeOpacity="0.35" />
        </svg>
        <span className="text-base text-muted">Immagine non disponibile</span>
        </div>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      onError={() => setFailed(true)}
      loading={loading}
      className={className}
    />
  );
}
