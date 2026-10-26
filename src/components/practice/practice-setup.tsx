"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { useTaskTransition } from "@/components/ui/task-transition";

/** Continuous by default; a short fixed series remains an explicit alternative. */
export function PracticeSetup({ topic }: { topic: PracticeTopicSummary }) {
  const router = useRouter();
  const task = useTaskTransition();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function start() {
    if (busy) return; setBusy(true); setError(null);
    task.begin("practice");
    try {
      const response = await fetch("/api/practice", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({topicId:topic.id,questionCount:count || 10,continuous:count === 0}) });
      const result = await response.json();
      if (!response.ok || !result.sessionId) throw new Error(result.error?.message ?? "Impossibile avviare il quiz.");
      router.push(`/allenamento/${result.sessionId}`);
    } catch(reason) { task.finish(); setError(reason instanceof Error ? reason.message : "Connessione non disponibile. Riprova."); setBusy(false); }
  }
  return <section aria-label="Configurazione allenamento" className="min-w-0 border-2 border-foreground bg-surface p-5 sm:p-8">
    <h2 className="text-2xl font-bold">Come vuoi allenarti?</h2>
    <p className="mt-3 text-base text-muted">Tocca Vero o Falso: la risposta si corregge subito e si apre la spiegazione.</p>
    <button type="button" disabled={busy} aria-pressed={count===0} onClick={()=>setCount(0)} className={cn("mt-6 flex min-h-24 w-full items-center gap-4 rounded-lg border-2 p-4 text-left",count===0 ? "bg-accent-yellow ring-1 ring-foreground" : "bg-surface")}>
      <span className="text-4xl" aria-hidden="true">∞</span><span className="flex-1"><strong className="block text-xl">Senza limite</strong><span className="mt-1 block text-base">Ti fermi quando vuoi.</span></span><span aria-hidden="true">{count===0 ? "✓" : "○"}</span>
    </button>
    <p className="mb-2 mt-5 text-base font-medium">Oppure scegli una serie breve</p>
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Numero di domande">{siteConfig.practice.questionCounts.map(number=><button key={number} disabled={busy || topic.questionCount<number} aria-label={`${number} domande`} aria-pressed={count===number} onClick={()=>setCount(number)} className={cn("min-h-16 rounded-lg border-2 text-base font-semibold disabled:opacity-40",count===number ? "bg-foreground text-white" : "bg-surface")}>{number} domande</button>)}</div>
    <div className="mt-6"><Button size="lg" fullWidth onClick={()=>void start()} disabled={busy} aria-busy={busy}>{busy ? "Preparazione…" : "Inizia allenamento"}</Button></div>
    {error && <p role="alert" className="mt-3 border-2 bg-danger-soft p-3 text-base">{error}</p>}
  </section>;
}
