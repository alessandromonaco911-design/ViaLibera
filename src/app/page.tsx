import Link from "next/link";
import { siteConfig } from "@/config/site";
import { StartExamButton } from "@/components/home/start-exam-button";
import { ResumeCard } from "@/components/home/resume-card";
import { PracticeResumeCard } from "@/components/home/practice-resume-card";
import { SiteHeader } from "@/components/ui/site-header";
import { MarqueeStrip, SectionLabel, StatBlock } from "@/components/ui/editorial";

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ============ HERO ============ */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
          <div className="grid border-2 border-foreground bg-surface shadow-pop lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:divide-x-2 lg:divide-foreground">
            {/* left: title + CTAs */}
            <div className="motion-enter min-w-0 p-6 sm:p-10">
              <SectionLabel>Esame patente {siteConfig.licenseCategory} · teorico</SectionLabel>
              <h1 className="mt-4 max-w-full font-mono text-[clamp(2.2rem,5vw,4.5rem)] font-semibold leading-[0.95] tracking-tight">
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
                  className="editorial-press flex h-12 w-full select-none items-center justify-center gap-2 rounded-md border-2 border-foreground bg-accent-yellow px-6 font-mono text-base font-medium uppercase tracking-wide text-foreground hover:bg-accent-pink"
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
                label="Feedback"
                value="Immediato"
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
        <section className="mx-auto mt-10 w-full max-w-6xl px-4 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2">
            <ResumeCard />
            <PracticeResumeCard />
          </div>
        </section>

        {/* ============ MODE CARDS ============ */}
        <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-2">
          {/* SIMULAZIONE */}
          <div className="group editorial-hover motion-enter editorial-delay-1 flex flex-col justify-between border-2 border-foreground bg-accent-blue p-8">
            <div>
              <SectionLabel>Modalità</SectionLabel>
              <h2 className="mt-2 font-mono text-4xl font-semibold uppercase tracking-tight sm:text-5xl">
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
              className="editorial-press mt-8 inline-flex h-12 items-center justify-center gap-2 border-2 border-foreground bg-foreground px-6 font-mono text-base font-medium uppercase tracking-wide text-white hover:bg-black"
            >
              Vai alla simulazione
              <span aria-hidden className="arrow-nudge">→</span>
            </Link>
          </div>

          {/* ALLENAMENTO */}
          <div className="group editorial-hover motion-enter editorial-delay-2 flex flex-col justify-between border-2 border-foreground bg-accent-yellow p-8">
            <div>
              <SectionLabel>Modalità</SectionLabel>
              <h2 className="mt-2 font-mono text-4xl font-semibold uppercase tracking-tight sm:text-5xl">
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
              className="editorial-press mt-8 inline-flex h-12 items-center justify-center gap-2 border-2 border-foreground bg-foreground px-6 font-mono text-base font-medium uppercase tracking-wide text-white hover:bg-black"
            >
              Allenati per argomento
              <span aria-hidden className="arrow-nudge">→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-foreground bg-surface py-6 text-center font-mono text-xs uppercase tracking-wide text-muted">
        {siteConfig.name} · quesiti dal catalogo ufficiale importato · simulazione compatibile con il formato d&apos;esame
      </footer>
    </div>
  );
}
