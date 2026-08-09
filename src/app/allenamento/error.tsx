"use client";

import Link from "next/link";

export default function AllenamentoError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-surface p-8 shadow-pop motion-scale-in">
        <p className="font-mono text-xs uppercase tracking-[0.2em]">Errore</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold uppercase tracking-tight">Qualcosa non ha funzionato</h1>
        <p className="mt-2 text-sm text-muted">Il servizio non è raggiungibile in questo momento. Riprova tra poco.</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="editorial-press inline-flex h-11 flex-1 items-center justify-center rounded-md border-2 border-foreground bg-foreground px-5 font-mono text-sm font-medium uppercase tracking-wide text-white hover:bg-black"
          >
            Riprova
          </button>
          <Link
            href="/"
            className="editorial-press inline-flex h-11 flex-1 items-center justify-center rounded-md border-2 border-foreground bg-surface px-5 font-mono text-sm font-medium uppercase tracking-wide hover:bg-accent-blue"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  );
}
