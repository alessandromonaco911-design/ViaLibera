import Link from "next/link";
import { notFound } from "next/navigation";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";
import { PracticeSetup } from "@/components/practice/practice-setup";
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
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </Link>
        <Link href="/allenamento" className="text-sm font-medium text-primary hover:underline">
          ← Argomenti
        </Link>
      </header>

      <main className="flex-1 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">Allenamento</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{topic.name}</p>
        <p className="mt-1 text-xs text-muted">
          {topic.questionCount} domande disponibili{topic.imageCount > 0 ? ` · ${topic.imageCount} con immagini` : ""}
        </p>
        <PracticeSetup topic={topic} />
      </main>
    </div>
  );
}
