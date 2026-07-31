"use client";

import { useEffect, useRef, useState } from "react";
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Robust failure detection: some aborted/failed loads (e.g. network drop or
  // request aborted by the browser) never fire the `error` event on the <img>;
  // `loadend` always fires once loading ends, so we fall back when the image
  // ended without a usable size (naturalWidth 0).
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth === 0) {
      setFailed(true);
      return;
    }
    const onLoadEnd = () => {
      if (el.naturalWidth === 0) setFailed(true);
    };
    el.addEventListener("loadend", onLoadEnd);
    return () => el.removeEventListener("loadend", onLoadEnd);
  }, [src]);

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
      ref={imgRef}
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
