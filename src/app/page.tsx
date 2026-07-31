import { siteConfig } from "@/config/site";
import { StartExamButton } from "@/components/home/start-exam-button";
import { ResumeCard } from "@/components/home/resume-card";

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
          Simulazioni compatibili con il formato d’esame, basate sul catalogo ufficiale importato.
          Prova le tue conoscenze prima dell’appuntamento vero.
        </p>

        <div className="mt-8 w-full max-w-md">
          <ResumeCard />
          <StartExamButton />
          <p className="mt-3 text-center text-xs text-muted">Nessuna registrazione richiesta.</p>
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
