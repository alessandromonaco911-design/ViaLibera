"use client";

import { useEffect, useState } from "react";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { topicTitle } from "@/lib/practice/topic-navigation";
import { activeCatalog } from "@/config/catalog";
import { adviceAngles, weakTopics, localDay, type ProgressData } from "@/lib/progress/model";
import { loadProgress, progressChanged } from "@/lib/progress/storage";
import { MobileIcon } from "@/components/mobile/mobile-icon";
import styles from "./progress-panel.module.css";
import { Dialog } from "@/components/ui/dialog";

export type ProgressDetail = "overview" | "weak" | "achievements";
function ProgressContent({ active = true, topics, detail = "overview", onDetail, onTrain }: {
  active?: boolean; topics: PracticeTopicSummary[]; detail?: ProgressDetail;
  onDetail: (detail: ProgressDetail) => void; onTrain: (topicId?: string) => void;
}) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const refresh = () => void loadProgress().then(value => { if (!cancelled) { setData(value); setUnavailable(false); } }).catch(() => { if (!cancelled) setUnavailable(true); });
    refresh();
    const visible = () => { if (!document.hidden) refresh(); };
    // Advice changes at local midnight, with no cron, network request or background job.
    let day = localDay();
    const timer = setInterval(() => { const today = localDay(); if (today !== day) { day = today; refresh(); } }, 60_000);
    window.addEventListener(progressChanged, refresh); document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener(progressChanged, refresh); document.removeEventListener("visibilitychange", visible); };
  }, [active, retry]);
  const resolve = (name: string) => topics.find(topic => topic.name === name);
  const label = (name: string) => { const topic = resolve(name); return topic ? topicTitle(topic) : name.split(";")[0]; };
  const train = (name?: string) => onTrain(name ? resolve(name)?.id : undefined);
  if (unavailable) return <div className={styles.root}><h1>I tuoi progressi</h1><div className={styles.empty}><h2>Qui non riesco a salvare i progressi.</h2><p>Controlla che il browser consenta i dati del sito. Puoi comunque continuare i quiz.</p><button className={styles.primary} onClick={() => setRetry(value => value + 1)}>Riprova</button><button className={styles.row} onClick={() => onTrain()}>Vai all’allenamento →</button></div></div>;
  if (!data) return <div className={styles.root} role="status"><h1>I tuoi progressi</h1><p>Caricamento progressi…</p></div>;
  const unique = Object.keys(data.questions).length;
  if (!data.answered) return <div className={styles.root} data-progress-empty><h1>I tuoi progressi</h1><div className={styles.empty}><MobileIcon name="training"/><h2>Il tuo percorso parte da qui.</h2><p>Rispondi a 10 domande: inizieremo a conoscere i tuoi punti forti.</p><button className={styles.primary} onClick={() => onTrain()}>Inizia allenamento <MobileIcon name="arrow"/></button></div><p className={styles.local}>Salvati su questo dispositivo. Nessun account.</p></div>;
  const weak = weakTopics(data).filter(item => resolve(item.topic));
  const advice = data.advice;
  const suggested = advice?.topic && resolve(advice.topic) ? advice.topic : null;
  const correct = data.recent.filter(answer => answer.correct).length;
  const accuracy = Math.round(correct / data.recent.length * 100);
  const exams = data.exams.slice(-5);
  let streak = 0; for (const exam of [...data.exams].reverse()) { if (!exam.passed) break; streak++; }
  const back = <button className={styles.back} onClick={() => onDetail("overview")}><MobileIcon name="back"/>Progressi</button>;
  if (detail === "achievements") return <div className={styles.root} data-progress-detail="achievements"><div className={styles.detailHeading}>{back}<h1>Traguardi</h1></div><p className={styles.lead}>Ogni passo conta.</p><div className={styles.achievements}>{[
    ["first100", "Prime 100 domande", unique, 100], ["recovered10", "10 errori recuperati", data.recovered, 10],
    ["exams3", "3 prove superate di fila", streak, 3], ["unique500", "500 domande diverse", unique, 500],
  ].map(([key, title, value, goal]) => {
    const reached = data.achievements.includes(String(key));
    return <div className={styles.achievement} data-reached={reached} key={key}><span aria-hidden="true">{reached ? "✓" : "○"}</span><div><strong>{title}</strong><p>{reached ? "Raggiunto" : `${Math.min(Number(value), Number(goal))} / ${goal}`}</p></div></div>;
  })}</div><p className={styles.local}>Un errore è recuperato dopo due nuove risposte corrette.</p></div>;
  if (detail === "weak") return <div className={styles.root} data-progress-detail="weak"><div className={styles.detailHeading}>{back}<h1>Da ripassare</h1></div><p className={styles.lead}>Parti dagli errori più frequenti.</p><div className={styles.weakList}>{weak.slice(0,3).map(item => <button className={styles.topic} onClick={() => train(item.topic)} key={item.topic}><MobileIcon name="signals" topicCode={resolve(item.topic)?.code}/><div><strong>{label(item.topic)}</strong><p>{item.errors} {item.errors === 1 ? "errore" : "errori"} su {item.answered} risposte recenti</p><span className={styles.bar}><span style={{ width: `${item.errors / item.answered * 100}%` }}/></span></div><MobileIcon name="chevron"/></button>)}</div><div className={styles.advice}><strong>{weak.length ? "Rivedi le spiegazioni, poi riprova." : "Nessun errore recente. Continua così."}</strong><button className={styles.primary} onClick={() => train(weak[0]?.topic)}>{weak.length ? "Inizia ripasso mirato" : "Continua allenamento"}<MobileIcon name="arrow"/></button></div></div>;
  return <div className={`${styles.root} ${styles.overview}`} data-progress-overview><h1>I tuoi progressi</h1>
    <div className={styles.metrics}><section className={styles.accuracy} aria-label="Precisione e copertura"><p className={styles.metricLabel}>{data.recent.length === 1 ? "Ultima risposta" : `Ultime ${data.recent.length} risposte`}</p><div><b>{data.recent.length < 10 ? `${correct} / ${data.recent.length}` : `${accuracy}%`}</b><strong>corrette</strong></div><span className={`${styles.bar} ${styles.correctBar}`}><span style={{width:`${accuracy}%`}}/></span><p className={styles.coverage}><strong>{unique.toLocaleString("it-IT")}</strong> / {activeCatalog.questionCount.toLocaleString("it-IT")}<small>domande diverse</small></p></section>
    <section className={styles.examCard} aria-label="Andamento esami"><strong>{exams.length ? exams.length === 1 ? "Ultima prova" : `Ultime ${exams.length} prove` : "La tua prima prova"}</strong><p>{exams.length ? `${exams.filter(exam=>exam.passed).length} superate · ${exams.filter(exam=>!exam.passed).length} da migliorare` : "Quando vuoi, mettiti alla prova."}</p><div className={styles.outcomes}>{exams.map(exam=><span key={exam.id} data-passed={exam.passed} aria-label={exam.passed ? "Superata" : "Da migliorare"}/>)}</div></section></div>
    <section className={styles.advice} aria-label="Consiglio di oggi"><strong>{suggested ? `Oggi: ${label(suggested)}` : data.answered < 10 ? "Un passo alla volta." : "Oggi: consolida le tue risposte"}</strong><p>{suggested ? `${advice!.errors} ${advice!.errors === 1 ? "errore" : "errori"} su ${advice!.answered} risposte recenti.` : data.answered < 10 ? "Continua: i consigli mirati arriveranno con più risposte." : "Nessun punto debole con abbastanza risposte: continua ad allenarti."}</p>{data.answered >= 10 && <p className={styles.adviceText}>{adviceAngles[advice?.angle ?? 0]}</p>}<button className={styles.primary} onClick={() => train(suggested ?? undefined)}>{suggested ? "Ripassa 10 domande" : "Continua allenamento"}<MobileIcon name="arrow"/></button></section>
    <div className={styles.links}><button className={styles.row} onClick={() => onDetail("weak")}><MobileIcon name="signals"/><span><strong>Da ripassare</strong><small>I tuoi punti deboli</small></span><MobileIcon name="chevron"/></button><button className={styles.row} onClick={() => onDetail("achievements")}><MobileIcon name="target"/><span><strong>Traguardi</strong><small>{data.achievements.length} obiettivi raggiunti</small></span><MobileIcon name="chevron"/></button></div>
  </div>;
}

export function ProgressPanel({ busy = false, error, onErrorClear, ...props }: Parameters<typeof ProgressContent>[0] & { busy?: boolean; error?: string | null; onErrorClear?: () => void }) {
  return <fieldset className={styles.frame} disabled={busy} aria-busy={busy}>
    <ProgressContent {...props}/>
    <Dialog open={!!error} onClose={() => onErrorClear?.()} title="Ripasso non disponibile">
      <p className="text-base leading-relaxed">{error}</p>
      <button className="mt-5 min-h-12 w-full rounded-lg border-2 bg-foreground px-4 text-white" onClick={() => onErrorClear?.()}>Ho capito</button>
    </Dialog>
  </fieldset>;
}
