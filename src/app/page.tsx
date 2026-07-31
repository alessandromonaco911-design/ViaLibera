import Link from "next/link";
import { siteConfig } from "@/config/site";
import { StartExamButton } from "@/components/home/start-exam-button";
import { ResumeCard } from "@/components/home/resume-card";
import { PracticeResumeCard } from "@/components/home/practice-resume-card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">{siteConfig.name}</span>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          Patente {siteConfig.licenseCategory}
        </span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {siteConfig.tagline}
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Simulazioni compatibili con il formato d’esame e allenamenti per argomento, basati sul
          catalogo ufficiale importato. Prova le tue conoscenze prima dell’appuntamento vero.
        </p>

        <div className="mt-8 w-full max-w-md">
          <ResumeCard />
          <PracticeResumeCard />
          <StartExamButton />
          <div className="mt-3">
            <Link href="/allenamento" passHref legacyBehavior>
              <Button variant="secondary" size="lg" fullWidth>
                Allenati per argomento
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Nessuna registrazione richiesta.</p>
        </div>

        <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
            <h2 className="text-sm font-semibold">Simulazione</h2>
            <p className="mt-1 text-xs text-muted">30 domande · 20 minuti · risultato alla fine</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
            <h2 className="text-sm font-semibold">Allenamento</h2>
            <p className="mt-1 text-xs text-muted">scegli argomento · feedback immediato · nessun limite di tempo</p>
          </div>
        </div>

        <dl className="mt-8 grid w-full max-w-md grid-cols-3 gap-3">
          {[
            { dt: "Domande", dd: `${siteConfig.exam.totalQuestions}` },
            { dt: "Durata", dd: `${Math.round(siteConfig.exam.durationSeconds / 60)} minuti` },
            { dt: "Errori max", dd: `${siteConfig.exam.allowedErrors}` },
          ].map((x) => (
            <div key={x.dt} className="rounded-xl border border-border bg-surface px-3 py-3 text-center shadow-card">
              <dt className="text-xs text-muted">{x.dt}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{x.dd}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        {siteConfig.name} · quesiti dal catalogo ufficiale importato · simulazione compatibile con il formato d’esame
      </footer>
    </div>
  );
}
