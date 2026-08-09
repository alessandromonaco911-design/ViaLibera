import Link from "next/link";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";
import { siteConfig } from "@/config/site";
import { SiteHeader } from "@/components/ui/site-header";
import { TopicSearch } from "@/components/practice/topic-search";
import { SectionLabel } from "@/components/ui/editorial";
import { cn } from "@/lib/utils/cn";
import { pageShellClass } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AllenamentoPage() {
  const catalogId = await getImportedCatalogId();
  const topics = catalogId ? await listPracticeTopics(catalogId) : [];

  return (
    <div className="flex min-h-viewport w-full flex-col">
      <SiteHeader mode="Allenamento" />

      <main className={cn(pageShellClass, "flex-1 pb-16 pt-8")}>
        <SectionLabel>Allenati per argomento</SectionLabel>
        <h1 className="mt-2 font-mono text-[clamp(2rem,4vw,4rem)] font-semibold leading-[0.95] tracking-tight">
          Scegli un argomento,
          <br />
          rispondi subito.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          Feedback immediato su ogni risposta, nessun limite di tempo, nessuna registrazione.
          {topics.length > 0 && ` ${topics.length} argomenti disponibili.`}
        </p>

        <ul className="mt-6 flex flex-wrap gap-3" aria-label="Caratteristiche dell'allenamento">
          {[
            ["Feedback immediato", "bg-accent-blue"],
            ["Nessun limite di tempo", "bg-accent-green"],
            ["Nessuna registrazione", "bg-accent-pink"],
          ].map(([label, bg]) => (
            <li
              key={label as string}
              className={cn("border-2 border-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em]", bg as string)}
            >
              {label}
            </li>
          ))}
        </ul>

        {topics.length === 0 ? (
          <div role="status" className="mt-10 border-2 border-foreground bg-surface p-8 text-center shadow-pop">
            <p className="font-mono text-sm text-muted">Nessun argomento disponibile al momento. Riprova più tardi.</p>
            <Link href="/" className="mt-4 inline-block font-mono text-sm font-medium text-foreground underline">
              Torna alla home
            </Link>
          </div>
        ) : (
          <TopicSearch topics={topics} />
        )}
      </main>

      <footer className="border-t-2 border-foreground bg-surface py-6 text-center font-mono text-xs uppercase tracking-wide text-muted">
        {siteConfig.name} · allenamento senza limite di tempo · {topics.length} argomenti disponibili
      </footer>
    </div>
  );
}
