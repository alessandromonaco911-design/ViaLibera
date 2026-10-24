import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";
import { PracticeSetup } from "@/components/practice/practice-setup";
import { SiteHeader } from "@/components/ui/site-header";
import { SectionLabel } from "@/components/ui/editorial";
import { cn } from "@/lib/utils/cn";
import { pageShellClass } from "@/components/ui/page-shell";
import { siteConfig } from "@/config/site";
import { MobileEntry } from "@/components/mobile/mobile-entry";
import { topicTitle as shortTopicTitle } from "@/lib/practice/topic-navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AllenamentoTopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const catalogId = await getImportedCatalogId();
  const topics = catalogId ? await listPracticeTopics(catalogId) : [];
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) notFound();
  const topicTitle = shortTopicTitle(topic);

  return (
    <MobileEntry initialSection="training" topics={topics} initialTopicId={topicId}>
    <div className="flex min-h-viewport w-full flex-col">
      <SiteHeader mode="Allenamento" />
      <main className={cn(pageShellClass, "flex-1 pb-16 pt-8")}>
        <Link href="/allenamento" className="inline-flex min-h-12 items-center gap-2 text-base font-medium text-muted hover:text-foreground">
          <span aria-hidden>←</span> Argomenti
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0 border-2 border-foreground bg-surface p-5 shadow-pop motion-enter sm:p-8">
            <SectionLabel>Argomento</SectionLabel>
            <h1 className="mt-2 break-words text-[clamp(1.5rem,3vw,2.5rem)] font-semibold leading-snug tracking-tight">
              {topicTitle}
            </h1>
            {topicTitle !== topic.name && (
              <details className="mt-4 text-base leading-relaxed text-muted">
                <summary className="cursor-pointer py-2 font-medium">Descrizione completa dell’argomento</summary>
                <p className="mt-2">{topic.name}</p>
              </details>
            )}
            <p className="mt-4 font-mono text-sm uppercase tracking-wide text-muted">
              {topic.questionCount} quesiti disponibili
              {topic.imageCount > 0 ? ` · ${topic.imageCount} con immagini` : ""}
            </p>
          </div>

          <PracticeSetup topic={topic} />
        </div>
      </main>

      <footer className="border-t-2 border-foreground bg-surface py-6 text-center font-mono text-xs uppercase tracking-wide text-muted">
        {siteConfig.name} · allenamento senza limite di tempo
      </footer>
    </div>
    </MobileEntry>
  );
}
