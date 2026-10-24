"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { groupPracticeTopics, topicTitle, topicGroupHints } from "@/lib/practice/topic-navigation";
import { MobileIcon } from "@/components/mobile/mobile-icon";

/** Short, recognisable topic labels replace the full ministerial paragraph in each card. */
export function TopicSearch({ topics }: { topics: PracticeTopicSummary[] }) {
  const [query, setQuery] = useState(""), [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const groups = useMemo(()=>groupPracticeTopics(topics),[topics]);
  const group = groups.find(item=>item.id===selectedGroup);
  const filtered = topics.filter(topic => query.trim() ? `${topicTitle(topic)} ${topic.name}`.toLowerCase().includes(query.trim().toLowerCase()) : group?.topics.some(item=>item.id===topic.id));
  return <section aria-label="Elenco argomenti" className="mt-8">
    <label htmlFor="topic-search" className="mb-2 block text-base font-medium">Cerca un argomento</label>
    <input id="topic-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Es. precedenze, segnali, luci…" className="editorial-input h-14 w-full max-w-lg border-2 bg-surface px-4 text-base"/>
    {!query.trim() && !group ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{groups.map(item=><button key={item.id} onClick={()=>setSelectedGroup(item.id)} className="flex min-h-40 flex-col items-start justify-between gap-4 rounded-lg border-2 bg-surface p-6 text-left hover:bg-accent-yellow"><MobileIcon name={item.icon}/><span><strong className="block text-xl">{item.title}</strong><span className="mt-2 block text-base text-muted">{topicGroupHints[item.id] ?? "Scegli una categoria"}</span></span><span className="font-medium">Scegli un argomento →</span></button>)}</div> : <>
      {group && !query.trim() && <div className="mt-5"><button className="min-h-12 text-base font-medium" onClick={()=>setSelectedGroup(null)}>← Tutti gli argomenti</button><h2 className="mt-2 text-2xl font-bold">{group.title}</h2></div>}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(topic=><li key={topic.id}><Link href={`/allenamento/argomento/${topic.id}`} className="flex min-h-28 items-center gap-4 rounded-lg border-2 bg-surface p-5 hover:bg-accent-blue"><MobileIcon name="training" topicCode={topic.code}/><span className="flex-1"><strong className="block text-lg leading-snug">{topicTitle(topic)}</strong><span className="mt-2 block text-sm text-muted">{topic.questionCount} domande · risposta immediata</span></span><span aria-hidden="true">→</span></Link></li>)}</ul>
      {!filtered.length && <p className="mt-6 text-base">Nessun argomento trovato. Prova con un’altra parola.</p>}
    </>}
  </section>;
}
