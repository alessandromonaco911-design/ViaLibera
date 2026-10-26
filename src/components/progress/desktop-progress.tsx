"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { ProgressPanel, type ProgressDetail } from "./progress-panel";
import { useTaskTransition } from "@/components/ui/task-transition";

export function DesktopProgress({ topics }: { topics: PracticeTopicSummary[] }) {
  const router = useRouter();
  const task = useTaskTransition();
  const [detail, setDetail] = useState<ProgressDetail>("overview");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const pop = () => { const value = new URL(location.href).searchParams.get("vista"); setDetail(value === "ripasso" ? "weak" : value === "traguardi" ? "achievements" : "overview"); };
    const timer = setTimeout(pop, 0); window.addEventListener("popstate", pop);
    return () => { clearTimeout(timer); window.removeEventListener("popstate", pop); };
  }, []);
  return <div style={{height:"min(820px, calc(100dvh - 100px))",minHeight:460,width:"100%",maxWidth:620,margin:"24px auto",padding:"0 16px",display:"flex"}}><ProgressPanel topics={topics} detail={detail} busy={busy} error={error} onErrorClear={()=>setError(null)} onDetail={next => { setDetail(next); history.pushState(null,"",`/progressi${next === "overview" ? "" : `?vista=${next === "weak" ? "ripasso" : "traguardi"}`}`); }} onTrain={topicId => {
    if (!topicId) { router.push("/allenamento"); return; }
    if (busy) return; setBusy(true); setError(null); task.begin("review");
    void fetch("/api/practice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId,questionCount:10})}).then(async response=>{
      const result = await response.json(); if (!response.ok || !result.sessionId) throw new Error(result.error?.message ?? "Impossibile avviare il ripasso."); router.push(`/allenamento/${result.sessionId}`);
    }).catch(reason=>{ task.finish(); setError(reason instanceof Error ? reason.message : "Riprova fra poco.");setBusy(false); });
  }}/></div>;
}
