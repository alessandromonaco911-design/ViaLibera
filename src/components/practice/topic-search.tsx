"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PracticeTopicSummary } from "@/lib/practice/types";

/** Client-side text search over the topic list (server provides data). */
export function TopicSearch({ topics }: { topics: PracticeTopicSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q));
  }, [topics, query]);

  return (
    <section aria-label="Elenco argomenti" className="mt-6">
      <label htmlFor="topic-search" className="sr-only">
        Cerca argomento
      </label>
      <input
        id="topic-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca un argomento…"
        className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
      />

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">Nessun argomento corrisponde alla ricerca.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                href={`/allenamento/argomento/${t.id}`}
                className="flex min-h-16 items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
              >
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-lg">
                  {topicIcon(t.code, t.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t.questionCount} domande{t.imageCount > 0 ? ` · ${t.imageCount} con immagini` : ""}
                  </span>
                </span>
                <span aria-hidden className="text-muted">→</span>
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
  if (n.includes("segnali di pericolo")) return "⚠️";
  if (n.includes("segnali di divieto")) return "⛔";
  if (n.includes("segnali di obbligo")) return "➡️";
  if (n.includes("segnali di precedenza")) return "🔺";
  if (n.includes("segnali di indicazione")) return "📋";
  if (n.includes("segnaletica orizzontale")) return "🛣️";
  if (n.includes("semafor")) return "🚦";
  if (n.includes("precedenza")) return "🚦";
  if (n.includes("sorpasso")) return "🏎️";
  if (n.includes("velocità")) return "🚀";
  if (n.includes("distanza di sicurezza")) return "📏";
  if (n.includes("sosta")) return "🅿️";
  if (n.includes("luci")) return "💡";
  if (n.includes("casco") || n.includes("cinture")) return "🪖";
  if (n.includes("patenti")) return "🪪";
  if (n.includes("assicurazione")) return "🛡️";
  if (n.includes("primo soccorso") || n.includes("incidente")) return "🚑";
  if (n.includes("inquinamento") || n.includes("consumi")) return "🌱";
  if (n.includes("motocicli")) return "🏍️";
  if (n.includes("pannelli integrativi")) return "🪧";
  return "📘";
}
