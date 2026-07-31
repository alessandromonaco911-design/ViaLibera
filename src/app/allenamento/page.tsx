import Link from "next/link";
import { getImportedCatalogId } from "@/lib/exam/generator";
import { listPracticeTopics } from "@/lib/practice/generator";
import { siteConfig } from "@/config/site";
import { TopicSearch } from "@/components/practice/topic-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AllenamentoPage() {
  const catalogId = await getImportedCatalogId();
  const topics = catalogId ? await listPracticeTopics(catalogId) : [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </Link>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          Allenamento
        </span>
      </header>

      <main className="flex-1 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Allenati per argomento</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          Scegli un argomento, rispondi VERO o FALSO e ricevi subito il risultato di ogni risposta.
          Nessun limite di tempo, nessuna registrazione.
        </p>

        {topics.length === 0 ? (
          <div role="status" className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-muted">Nessun argomento disponibile al momento. Riprova più tardi.</p>
            <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Torna alla home
            </Link>
          </div>
        ) : (
          <TopicSearch topics={topics} />
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        {siteConfig.name} · allenamento senza limite di tempo · {topics.length} argomenti disponibili
      </footer>
    </div>
  );
}
