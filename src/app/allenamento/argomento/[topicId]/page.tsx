import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";
import { PracticeSetup } from "@/components/practice/practice-setup";
import { SiteHeader } from "@/components/ui/site-header";
import { SectionLabel } from "@/components/ui/editorial";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AllenamentoTopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const catalogId = await getImportedCatalogId();
  const topics = catalogId ? await listPracticeTopics(catalogId) : [];
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) notFound();

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <SiteHeader mode="Allenamento" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        <Link href="/allenamento" className="inline-flex items-center gap-1 font-mono text-sm uppercase tracking-wide text-muted hover:text-foreground">
          <span aria-hidden>←</span> Argomenti
        </Link>

        <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="border-2 border-foreground bg-surface p-6 shadow-pop motion-enter sm:p-8">
            <SectionLabel>Argomento</SectionLabel>
            <h1 className="mt-2 font-mono text-[clamp(1.6rem,3vw,2.6rem)] font-semibold leading-tight tracking-tight">
              {topic.name}
            </h1>
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
  );
}
