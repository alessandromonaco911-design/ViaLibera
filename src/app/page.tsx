import Link from "next/link";
import { siteConfig } from "@/config/site";
import { StartExamButton } from "@/components/home/start-exam-button";
import { ResumeCard } from "@/components/home/resume-card";
import { PracticeResumeCard } from "@/components/home/practice-resume-card";
import { SiteHeader } from "@/components/ui/site-header";
import { MarqueeStrip, SectionLabel, StatBlock } from "@/components/ui/editorial";
import { cn } from "@/lib/utils/cn";
import { pageShellClass } from "@/components/ui/page-shell";
import { MobileEntry } from "@/components/mobile/mobile-entry";
import { activeCatalog } from "@/config/catalog";

export default function Home() {
  return (
    <MobileEntry initialSection="home">
    <div className="flex min-h-viewport w-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ============ HERO ============ */}
        <section className={cn(pageShellClass, "pt-10 sm:pt-14")}>
          <div className="grid border-2 border-foreground bg-surface shadow-pop lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:divide-x-2 lg:divide-foreground">
            {/* left: title + CTAs */}
            <div className="motion-enter min-w-0 p-6 sm:p-10">
              <SectionLabel>Esame patente {siteConfig.licenseCategory} · teorico</SectionLabel>
              <h1 className="mt-4 max-w-full break-words font-mono text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[1.05] tracking-tight">
                Preparati
                <br />
                all&apos;esame.
                <br />
                Senza perdere
                <br />
                tempo.
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
                Simulazioni compatibili con il formato d&apos;esame e allenamenti per argomento,
                basati sul catalogo ufficiale importato.
              </p>
              <div id="inizia" className="mt-8 w-full max-w-md space-y-3">
                <StartExamButton />
                <Link
                  href="/allenamento"
                  className="editorial-press flex min-h-14 w-full select-none items-center justify-center gap-2 rounded-md border-2 border-foreground bg-accent-yellow px-4 py-3 text-center font-mono text-base font-medium uppercase leading-snug tracking-wide text-foreground hover:bg-accent-pink"
                >
                  Allenati per argomento
                  <span aria-hidden className="arrow-nudge">→</span>
                </Link>
                <p className="pt-1 text-center font-mono text-xs uppercase tracking-wide text-muted">
                  Nessuna registrazione richiesta
                </p>
              </div>
            </div>

            {/* right: abstract info panel */}
            <div className="motion-enter editorial-delay-1 grid grid-cols-2 gap-4 bg-accent-blue p-6 sm:p-10">
              <StatBlock label="Domande" value="30" tone="white" className="col-span-2" />
              <StatBlock label="Minuti" value="20" tone="yellow" />
              <StatBlock label="Errori massimi" value="3" tone="pink" />
              <StatBlock label="Patente" value="B" tone="white" />
              <StatBlock
                label="In allenamento"
                value="Subito"
                tone="green"
                valueClassName="text-lg sm:text-xl xl:text-2xl"
              />
            </div>
          </div>
        </section>

        {/* ============ MARQUEE ============ */}
        <div className="mt-12">
          <MarqueeStrip
            items={[
              `PATENTE ${siteConfig.licenseCategory}`,
              "30 DOMANDE",
              "20 MINUTI",
              "ALLENAMENTO PER ARGOMENTO",
              "FEEDBACK IMMEDIATO",
              "NESSUNA REGISTRAZIONE",
            ]}
          />
        </div>

        {/* ============ RESUME CARDS ============ */}
        <section className={cn(pageShellClass, "mt-10")}>
          <div className="grid gap-4 md:grid-cols-2">
            <ResumeCard />
            <PracticeResumeCard />
          </div>
        </section>

        {/* ============ MODE CARDS ============ */}
        <section className={cn(pageShellClass, "grid gap-4 py-12 lg:grid-cols-2")}>
          {/* SIMULAZIONE */}
          <div className="group editorial-hover motion-enter editorial-delay-1 flex min-w-0 flex-col justify-between border-2 border-foreground bg-accent-blue p-6 sm:p-8">
            <div>
              <SectionLabel>Modalità</SectionLabel>
              <h2 className="mt-2 break-words font-mono text-[clamp(2rem,4vw,3rem)] font-semibold uppercase tracking-tight">
                Simulazione
              </h2>
              <dl className="mt-6 space-y-2 font-mono text-sm uppercase tracking-wide">
                <div className="flex justify-between border-b border-foreground/40 pb-1"><dt>Domande</dt><dd>30</dd></div>
                <div className="flex justify-between border-b border-foreground/40 pb-1"><dt>Durata</dt><dd>20 minuti</dd></div>
                <div className="flex justify-between border-b border-foreground/40 pb-1"><dt>Esito</dt><dd>alla fine</dd></div>
              </dl>
            </div>
            <Link
              href="/#inizia"
              className="editorial-press mt-8 inline-flex min-h-14 items-center justify-center gap-2 border-2 border-foreground bg-foreground px-4 py-3 text-center font-mono text-base font-medium uppercase leading-snug tracking-wide text-white hover:bg-black"
            >
              Vai alla simulazione
              <span aria-hidden className="arrow-nudge">→</span>
            </Link>
          </div>

          {/* ALLENAMENTO */}
          <div className="group editorial-hover motion-enter editorial-delay-2 flex min-w-0 flex-col justify-between border-2 border-foreground bg-accent-yellow p-6 sm:p-8">
            <div>
              <SectionLabel>Modalità</SectionLabel>
              <h2 className="mt-2 break-words font-mono text-[clamp(2rem,4vw,3rem)] font-semibold uppercase tracking-tight">
                Allenamento
              </h2>
              <dl className="mt-6 space-y-2 font-mono text-sm uppercase tracking-wide">
                <div className="flex justify-between border-b border-foreground/40 pb-1"><dt>Argomento</dt><dd>a scelta</dd></div>
                <div className="flex justify-between border-b border-foreground/40 pb-1"><dt>Feedback</dt><dd>immediato</dd></div>
                <div className="flex justify-between border-b border-foreground/40 pb-1"><dt>Tempo</dt><dd>nessun limite</dd></div>
              </dl>
            </div>
            <Link
              href="/allenamento"
              className="editorial-press mt-8 inline-flex min-h-14 items-center justify-center gap-2 border-2 border-foreground bg-foreground px-4 py-3 text-center font-mono text-base font-medium uppercase leading-snug tracking-wide text-white hover:bg-black"
            >
              Allenati per argomento
              <span aria-hidden className="arrow-nudge">→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-foreground bg-surface py-6 text-center font-mono text-xs uppercase tracking-wide text-muted">
        {siteConfig.name} · listato AB del Portale dell&apos;Automobilista · verificato il {activeCatalog.verifiedAt} · simulazione compatibile con il formato d&apos;esame
      </footer>
    </div>
    </MobileEntry>
  );
}
