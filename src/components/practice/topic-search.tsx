"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { cn } from "@/lib/utils/cn";
import { TopicGlyph } from "./topic-glyph";

/** Client-side text search over the topic list (server provides data). */
export function TopicSearch({ topics }: { topics: PracticeTopicSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q));
  }, [topics, query]);

  return (
    <section aria-label="Elenco argomenti" className="mt-8">
      <label htmlFor="topic-search" className="sr-only">
        Cerca argomento
      </label>
      <div className="relative max-w-md">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-foreground"
        >
          <span className="h-1 w-1 rounded-full border border-foreground" />
        </span>
        <input
          id="topic-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un argomento…"
          className="editorial-input h-12 w-full border-2 border-foreground bg-surface pl-10 pr-4 font-mono text-sm outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center font-mono text-sm text-muted">Nessun argomento corrisponde alla ricerca.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t, i) => (
            <li key={t.id} className={cn("motion-enter", i < 6 && `editorial-delay-${(i % 3) + 1}`)}>
              <Link
                href={`/allenamento/argomento/${t.id}`}
                className={cn(
                  "group editorial-hover flex h-full min-h-44 flex-col justify-between border-2 border-foreground p-5",
                  i % 3 === 0
                    ? "bg-surface"
                    : i % 3 === 1
                      ? "bg-accent-blue"
                      : "bg-accent-yellow",
                )}
              >
              <TopicGlyph code={t.code} name={t.name} />
              <span className="mt-4">
                  <span className="block text-base font-semibold leading-snug text-foreground">{t.name}</span>
                  <span className="mt-2 block font-mono text-xs uppercase tracking-wide text-muted">
                    {t.questionCount} domande · {t.imageCount} con immagini
                  </span>
                </span>
                <span className="mt-4 flex items-center justify-between border-t border-foreground/40 pt-3">
                  <span className="font-mono text-xs uppercase tracking-wide">Allenati</span>
                  <span aria-hidden className="arrow-nudge font-mono text-sm">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

