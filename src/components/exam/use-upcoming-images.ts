"use client";
import { useEffect } from "react";

/** Warm only the next two figures; no answer data and no catalogue-wide download. */
export function useUpcomingImages(questions: readonly { position: number; image: { url: string } | null }[], position: number) {
  useEffect(() => {
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const upcoming = questions.filter(question => question.position > position && question.image).slice(0, 2);
    for (const question of upcoming) {
      const image = new Image(); image.decoding = "async"; image.fetchPriority = "low";
      image.src = question.image!.url;
      void image.decode().catch(() => {});
    }
  }, [questions, position]);
}
