"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { siteConfig } from "@/config/site";
import { activeCatalog } from "@/config/catalog";
import type { PracticeTopicSummary } from "@/lib/practice/types";
import { groupPracticeTopics, topicTitle } from "@/lib/practice/topic-navigation";
import { MobileIcon } from "./mobile-icon";
import { createMobileMotion } from "./mobile-motion";
import { mobileViewUrl, readMobileView, sections, type MobileSection, type MobileView } from "./mobile-view-state";
import { useResumeSessions, type ResumeSession } from "./use-resume-sessions";
import styles from "./mobile-hub.module.css";

const labels = { home: "Home", training: "Allenamento", exam: "Prova d’esame" };
const subscribeHeight = () => window.innerHeight < 700 ? 4 : 6;

export function MobileHub({ initialSection, initialTopics, initialTopicId }: {
  initialSection: MobileSection; initialTopics?: PracticeTopicSummary[]; initialTopicId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(() => readMobileView(initialSection, initialTopicId));
  const viewRef = useRef(view);
  const [topics, setTopics] = useState(initialTopics ?? []);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(initialTopics ? "ready" : "loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [pageSize, setPageSize] = useState(subscribeHeight);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [discarding, setDiscarding] = useState<ResumeSession | null>(null);
  const { sessions, discard } = useResumeSessions();
  const viewportRef = useRef<HTMLElement>(null), trackRef = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof createMobileMotion> | null>(null);
  const groups = useMemo(() => groupPracticeTopics(topics), [topics]);
  const topic = topics.find(item => item.id === view.topicId);
  const group = (topic ? groups.find(item => item.topics.some(t => t.id === topic.id)) : undefined) ?? groups.find(item => item.id === view.group);

  useEffect(() => {
    if (initialTopics && reloadKey === 0) return;
    const controller = new AbortController();
    void fetch("/api/practice/topics", { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("topics unavailable"); return response.json() as Promise<{ topics: PracticeTopicSummary[] }>; })
      .then(data => { if (!Array.isArray(data.topics)) throw new Error("invalid topics"); setTopics(data.topics); setLoadStatus("ready"); })
      .catch(() => { if (!controller.signal.aborted) setLoadStatus("error"); });
    return () => controller.abort();
  }, [initialTopics, reloadKey]);

  useLayoutEffect(() => {
    const controller = createMobileMotion({ viewport: viewportRef.current!, track: trackRef.current!, snapshotClass: styles.snapshot,
      view: () => viewRef.current, busy: () => startingRef.current,
      commit: next => flushSync(() => {
        viewRef.current = next; setView(next); setError(null);
        const href = mobileViewUrl(next);
        if (window.location.pathname + window.location.search + window.location.hash !== href) window.history.pushState(null, "", href);
      }),
    });
    motion.current = controller;
    const pop = () => {
      controller.reset(); const next = readMobileView(initialSection, initialTopicId);
      viewRef.current = next; setView(next); setError(null);
    };
    const resize = () => setPageSize(subscribeHeight());
    window.addEventListener("popstate", pop); window.addEventListener("resize", resize);
    return () => { controller.destroy(); motion.current = null; window.removeEventListener("popstate", pop); window.removeEventListener("resize", resize); };
  }, [initialSection, initialTopicId]);

  const go = (changes: Partial<MobileView>) => motion.current?.go({ ...viewRef.current, ...changes });
  const retry = () => { setLoadStatus("loading"); setReloadKey(key => key + 1); };
  async function start(mode: "exam" | "practice") {
    if (startingRef.current || mode === "practice" && (!topic || topic.questionCount < view.count)) return;
    motion.current?.reset(); startingRef.current = true; setStarting(true); setError(null);
    try {
      const response = await fetch(mode === "exam" ? "/api/exams" : "/api/practice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "exam" ? {} : { topicId: topic!.id, questionCount: view.count }),
      });
      const data = await response.json() as { sessionId?: string; error?: { code?: string; message?: string } };
      if (!response.ok || !data.sessionId) {
        setError(data.error?.code === "RATE_LIMITED" ? data.error.message ?? "Troppi nuovi quiz. Riprova tra qualche minuto." : data.error?.code === "INSUFFICIENT_QUESTIONS" ? "Non ci sono abbastanza domande. Scegli un numero inferiore." : "Non riesco ad avviare il quiz. Riprova tra poco.");
        startingRef.current = false; setStarting(false); return;
      }
      router.push(`/${mode === "exam" ? "simulazione" : "allenamento"}/${data.sessionId}`);
    } catch { setError("Connessione non disponibile. Riprova: le tue sessioni restano salvate."); startingRef.current = false; setStarting(false); }
  }
  const back = (label: string, changes: Partial<MobileView>) => <button className={styles.back} onClick={() => go(changes)} disabled={starting}><MobileIcon name="back"/>{label}</button>;
  const pager = (page: number, pages: number) => <div className={styles.pager}>
    <button aria-label="Pagina precedente" disabled={page === 0} onClick={() => go({ page: page - 1 })}><MobileIcon name="back"/></button>
    <span aria-live="polite">{page + 1} / {pages}</span>
    <button aria-label="Pagina successiva" disabled={page >= pages - 1} onClick={() => go({ page: page + 1 })}><MobileIcon name="arrow"/></button>
  </div>;
  const modeCard = (section: "training" | "exam", title: string, description: string, action: string) => <button className={styles.modeCard} style={{ background: section === "training" ? "var(--yellow)" : "var(--blue)" }} onClick={() => go({ section })}>
    <MobileIcon name={section}/><div><strong>{title}</strong><p className={styles.muted}>{description}</p></div><span className={styles.modeFoot}>{action}<MobileIcon name="arrow"/></span>
  </button>;
  function home(): ReactNode {
    if (view.sessions) {
      const pages = Math.max(1, Math.ceil(sessions.length / 4)), page = Math.min(view.page, pages - 1);
      return <>{back("Home", { sessions: false, page: 0 })}<div className={styles.heading}><h1>Riprendi da qui</h1></div>
        {sessions.length ? <div className={styles.categoryList} style={{ "--rows": Math.min(4, sessions.length - page * 4) } as CSSProperties}>
          {sessions.slice(page * 4, page * 4 + 4).map(session => <div className={styles.resumeRow} key={session.id}>
            <Link href={session.href} prefetch={false}><strong>{session.title}</strong><span>{session.progress} · Continua →</span></Link>
            <button className={styles.deleteButton} aria-label={`Abbandona ${session.title}`} onClick={() => setDiscarding(session)}><MobileIcon name="delete"/></button>
          </div>)}
        </div> : <div className={styles.status}><p>Nessuna sessione da riprendere.</p><button className={styles.primary} onClick={() => go({ sessions: false, section: "training" })}>Scegli un argomento</button></div>}
        {sessions.length > 0 && pager(page, pages)}</>;
    }
    return <><div className={styles.heading}><p className={styles.eyebrow}>Patente B</p><h1>Da dove iniziamo?</h1></div>
      <div className={styles.homeModes}>{modeCard("training", "Allenamento", "Correzione dopo ogni risposta.", "Scegli un argomento")}{modeCard("exam", "Prova d’esame", "30 domande · 20 minuti", "Preparati alla prova")}</div>
      {sessions.length > 0 && <button className={styles.resumeButton} onClick={() => go({ sessions: true, page: 0 })}><span><strong>Riprendi una sessione</strong> · {sessions.length}</span><MobileIcon name="chevron"/></button>}
      <p className={styles.hint}>Scorri a destra o a sinistra per cambiare sezione</p></>;
  }
  function training(): ReactNode {
    if (loadStatus !== "ready" || !topics.length) return <div className={styles.status} role="status"><h1>Allenamento</h1><p>{loadStatus === "loading" ? "Caricamento categorie…" : loadStatus === "error" ? "Le categorie non sono disponibili." : "Nessuna categoria disponibile al momento."}</p>{loadStatus !== "loading" && <button className={styles.primary} onClick={retry}>Ricarica categorie</button>}</div>;
    if (view.topicId && !topic) return <div className={styles.status}><h1>Categoria non disponibile</h1><button className={styles.primary} onClick={() => go({ topicId: null, group: null, page: 0 })}>Torna agli argomenti</button></div>;
    if (topic) return <>{back(group?.title ?? "Categorie", { topicId: null, group: group?.id ?? null, page: view.page })}
      <section className={`${styles.panel} ${styles.grow}`} aria-label="Configurazione allenamento">
        <div className={styles.setupIcon} style={{ background: `var(--${group?.tone ?? "yellow"})` }}><MobileIcon name={group?.icon ?? "training"} topicCode={topic.code}/></div>
        <div className={styles.titleRow}><h1>{topicTitle(topic)}</h1><button aria-label="Descrizione completa dell’argomento" className={styles.infoButton} onClick={() => setDescriptionOpen(true)}><MobileIcon name="info"/></button></div>
        <div className={styles.summaryLine}><span>Quesiti disponibili</span><span>{topic.questionCount}</span></div>
        <p className={styles.countLabel}>Quante domande?</p>
        <div className={styles.counts} role="group" aria-label="Numero di domande">{siteConfig.practice.questionCounts.map(n => <button key={n} aria-label={`${n} domande`} aria-pressed={view.count === n} disabled={starting || topic.questionCount < n} onClick={() => go({ count: n })}>{n}</button>)}</div>
        <p className={styles.muted}>Correzione dopo ogni risposta.</p>
        {error && <p className={styles.errorBox} role="alert">{error}</p>}
        {topic.questionCount < 10 && <p className={styles.errorBox}>Servono almeno 10 quesiti per iniziare.</p>}
        <div className={styles.bottomAction}><button className={styles.primary} onClick={() => void start("practice")} disabled={starting || topic.questionCount < view.count} aria-busy={starting}>{starting ? "Preparazione…" : "Inizia allenamento"}<MobileIcon name="arrow"/></button></div>
      </section></>;
    if (group) {
      const pages = Math.ceil(group.topics.length / pageSize), page = Math.min(view.page, pages - 1), shown = group.topics.slice(page * pageSize, (page + 1) * pageSize);
      return <>{back("Macroargomenti", { group: null, page: 0 })}<div className={styles.heading}><h1>{group.title}</h1><p className={styles.muted}>Scegli una categoria</p></div>
        <div className={styles.categoryList} style={{ "--rows": shown.length } as CSSProperties}>{shown.map(item => <button key={item.id} className={styles.category} onClick={() => go({ topicId: item.id, group: group.id, count: 10 })}>
          <span className={styles.macroIcon} style={{ background: `var(--${group.tone})` }}><MobileIcon name={group.icon} topicCode={item.code}/></span>
          <span className={styles.text}><strong>{topicTitle(item)}</strong><small>{item.questionCount} domande</small></span><MobileIcon name="chevron"/>
        </button>)}</div>{pager(page, pages)}</>;
    }
    return <><div className={styles.heading}><h1>Allenamento</h1><p className={styles.muted}>Da quale argomento partiamo?</p></div>
      <div className={styles.macroGrid}>{groups.map(item => <button key={item.id} className={styles.macro} style={{ background: `var(--${item.tone})` }} onClick={() => go({ group: item.id, page: 0 })}>
        <span className={styles.macroIcon}><MobileIcon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.topics.length} categorie</small></span>{item.id === "licence" && <span className={styles.next}><MobileIcon name="chevron"/></span>}
      </button>)}</div><p className={styles.hint}>Scegli un macroargomento per vedere le categorie</p></>;
  }
  function exam(): ReactNode {
    return <><div className={styles.heading}><h1>Prova d’esame</h1></div><div className={styles.examBody}>
      <div className={styles.setupIcon}><MobileIcon name="exam"/></div><h2>Mettiti alla prova.</h2><p className={styles.muted}>Risultato e correzioni alla fine.</p>
      <div className={styles.examMetrics}><div className={styles.metric}><b>{siteConfig.exam.totalQuestions}</b><span>domande</span></div><div className={styles.metric}><b>{siteConfig.exam.durationSeconds / 60}</b><span>minuti</span></div><div className={styles.metric}><b>{siteConfig.exam.allowedErrors}</b><span>errori ammessi</span></div></div>
      {error && <p className={styles.errorBox} role="alert">{error}</p>}
      <div className={styles.bottomAction}><button className={styles.primary} onClick={() => void start("exam")} disabled={starting} aria-busy={starting}>{starting ? "Preparazione…" : "Inizia prova"}<MobileIcon name="arrow"/></button></div>
    </div></>;
  }
  return <div className={styles.app} data-mobile-hub style={{ "--section-index": sections.indexOf(view.section) } as CSSProperties}>
    <header><Link className={styles.logo} href="/" onClick={event => { event.preventDefault(); go({ section: "home", sessions: false }); }}>VIA<span>LIBERA</span></Link><button className={`${styles.preview} min-h-11`} aria-label="Fonte e versione dei quesiti" onClick={() => setSourceOpen(true)}>PATENTE B ⓘ</button></header>
    <main ref={viewportRef} className={styles.viewport} aria-label="Contenuto"><div ref={trackRef} className={styles.track}>
      {sections.map(section => <section key={section} className={styles.slide} inert={view.section !== section} aria-hidden={view.section !== section} aria-label={labels[section]}>
        <div className={styles.screen} data-active={view.section === section} data-section={section}>{section === "home" ? home() : section === "training" ? training() : exam()}</div>
      </section>)}
    </div></main>
    <nav aria-label="Sezioni" style={{ "--tab-index": sections.indexOf(view.section) } as CSSProperties}>{sections.map(section => <button key={section} aria-current={view.section === section ? "page" : undefined} disabled={starting} onClick={() => go({ section })}><MobileIcon name={section}/><span>{labels[section]}</span></button>)}</nav>
    <Dialog open={descriptionOpen} onClose={() => setDescriptionOpen(false)} title="Descrizione completa">{topic && <p className="text-base leading-relaxed">{topic.name}</p>}</Dialog>
    <Dialog open={sourceOpen} onClose={() => setSourceOpen(false)} title="Fonte dei quesiti">
      <p className="text-base leading-relaxed">{activeCatalog.questionCount.toLocaleString("it-IT")} quesiti dal listato AB del Portale dell’Automobilista, verificato il {activeCatalog.verifiedAt}.</p>
      <a href={activeCatalog.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center underline">Consulta la fonte ufficiale ↗</a>
    </Dialog>
    <Dialog open={discarding !== null} onClose={() => setDiscarding(null)} title="Abbandonare la sessione?">
      <p className="text-base leading-relaxed">Le risposte salvate su questo dispositivo verranno rimosse.</p>
      <div className="mt-4 grid gap-3"><button className="min-h-12 border-2 p-3" onClick={() => setDiscarding(null)}>Mantieni sessione</button><button className="min-h-12 border-2 bg-danger-soft p-3" onClick={() => { if (discarding) discard(discarding); setDiscarding(null); }}>Abbandona sessione</button></div>
    </Dialog>
  </div>;
}
