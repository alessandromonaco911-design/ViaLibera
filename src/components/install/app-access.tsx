"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand/brand";
import { AppIntro } from "@/components/brand/app-intro";
import styles from "./install.module.css";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function openedAsApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function environment() {
  if (openedAsApp()) return "app";
  if (/iPhone|iPod/i.test(navigator.userAgent)) return "iphone";
  if (/Android.*Mobile/i.test(navigator.userAgent) ||
    (window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 767px)").matches)) return "phone";
  return "desktop";
}

function subscribe(update: () => void) {
  const queries = ["(display-mode: standalone)", "(display-mode: fullscreen)", "(pointer: coarse)", "(max-width: 767px)"].map(q => window.matchMedia(q));
  queries.forEach(q => q.addEventListener("change", update));
  window.addEventListener("pageshow", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    queries.forEach(q => q.removeEventListener("change", update));
    window.removeEventListener("pageshow", update);
    document.removeEventListener("visibilitychange", update);
  };
}
const serverEnvironment = () => "loading";

/** A presentation rule, not authentication: mobile routes open from the Home icon. */
export function AppAccess({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, environment, serverEnvironment);
  useEffect(() => {
    if (mode !== "app") return;
    const update = () => document.documentElement.style.setProperty("--app-height", `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("pageshow", update);
      document.documentElement.style.removeProperty("--app-height");
    };
  }, [mode]);
  if (mode === "loading") return <div className={styles.loading} role="status">Caricamento ViaLibera…</div>;
  if (mode === "iphone" || mode === "phone") return <InstallGuide />;
  return <div className="app-viewport" data-home-screen-app={mode === "app" ? "true" : undefined}>{mode === "app" ? <AppIntro>{children}</AppIntro> : children}</div>;
}

export function InstallGuide() {
  const mode = useSyncExternalStore(subscribe, environment, serverEnvironment);
  const [platform, setPlatform] = useState<"iphone" | "android" | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const iphone = platform ? platform === "iphone" : mode === "iphone";

  useEffect(() => {
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => {
      setPrompt(null);
      setMessage("Aggiunta completata. Chiudi questa scheda e apri ViaLibera dall’icona sulla Home.");
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setMessage("Per entrare, apri ViaLibera dall’icona sulla Home del telefono.");
      return;
    }
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(choice.outcome === "accepted"
        ? "Ora apri ViaLibera dall’icona sulla Home del telefono."
        : "Puoi riprovare dal menu del browser seguendo i passaggi qui sopra.");
    } catch {
      setMessage("Usa il menu del browser e segui i passaggi qui sopra.");
    } finally { setPrompt(null); setBusy(false); }
  }

  return <main className={styles.page} data-install-guide>
    <header className={styles.header}><Brand /><span>LA TUA PATENTE, IN TASCA</span></header>
    <div className={styles.content}>
      <div className={styles.intro}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static app icon, no optimizer required */}
        <img className={styles.icon} src="/icons/app-192.png" width="80" height="80" alt="" />
        <h1>ViaLibera sulla tua Home.</h1>
        <p>Da smartphone, allenamento e simulazione si aprono dall’app. Aggiungila alla Home per iniziare.</p>
      </div>
      <section className={styles.instructions} aria-label="Guida all’installazione">
        <div className={styles.platforms} aria-label="Tipo di telefono">
          <button type="button" aria-pressed={iphone} onClick={() => { setPlatform("iphone"); setMessage(""); }}>iPhone</button>
          <button type="button" aria-pressed={!iphone} onClick={() => { setPlatform("android"); setMessage(""); }}>Android</button>
        </div>
        <ol>
          <li><span>1</span><div>Apri questo sito in <strong>{iphone ? "Safari" : "Chrome"}</strong>.</div></li>
          <li><span>2</span><div>{iphone ? <>Tocca <strong>Condividi</strong> e scegli <strong>Aggiungi alla schermata Home</strong>.</> : <>Apri il menu <strong>⋮</strong> e scegli <strong>Installa app</strong> o <strong>Aggiungi a schermata Home</strong>.</>}</div></li>
          <li><span>3</span><div>{iphone ? <>Attiva <strong>Apri come app web</strong>, se presente, e conferma. Poi apri l’icona <strong>ViaLibera</strong>.</> : <>Conferma l’installazione. Poi apri l’icona <strong>ViaLibera</strong> dalla Home.</>}</div></li>
        </ol>
      </section>
      <div className={styles.actions}>
        {mode === "app" || mode === "desktop" ? <Link className={styles.primary} href="/">{mode === "app" ? "Apri ViaLibera →" : "Torna al sito →"}</Link> :
          <button className={styles.primary} disabled={busy} onClick={install}>{busy ? "Apertura…" : prompt && !iphone ? "Installa ViaLibera ↓" : "Ho aggiunto l’app →"}</button>}
        <p className={styles.message} role="status">{message || "Nessun account. Serve una connessione Internet."}</p>
      </div>
    </div>
  </main>;
}
