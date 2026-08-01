"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { cn } from "@/lib/utils/cn";

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
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-lg">
          ⌕
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
                <span aria-hidden className="text-2xl">
                  {topicIcon(t.code, t.name)}
                </span>
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

/** Simple, coherent icon derived from the official topic code (stable, no fakes). */
function topicIcon(code: string, name: string): string {
  const n = `${code} ${name}`.toLowerCase();
  if (n.includes("segnali di pericolo")) return "⚠";
  if (n.includes("segnali di divieto")) return "⛔";
  if (n.includes("segnali di obbligo")) return "→";
  if (n.includes("segnali di precedenza")) return "▲";
  if (n.includes("segnali di indicazione")) return "▤";
  if (n.includes("segnaletica orizzontale")) return "═";
  if (n.includes("semafor")) return "●";
  if (n.includes("precedenza")) return "✦";
  if (n.includes("sorpasso")) return "⇢";
  if (n.includes("velocità")) return "⇧";
  if (n.includes("distanza di sicurezza")) return "─";
  if (n.includes("sosta")) return "P";
  if (n.includes("luci")) return "◐";
  if (n.includes("casco") || n.includes("cinture")) return "◉";
  if (n.includes("patenti")) return "▣";
  if (n.includes("assicurazione")) return "◈";
  if (n.includes("primo soccorso") || n.includes("incidente")) return "+";
  if (n.includes("inquinamento") || n.includes("consumi")) return "♻";
  if (n.includes("motocicli")) return "≈";
  if (n.includes("pannelli integrativi")) return "▭";
  return "▣";
}
