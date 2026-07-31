"use client";

import Link from "next/link";

export default function AllenamentoError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-2xl font-semibold tracking-tight">Qualcosa non ha funzionato</p>
      <p className="mt-2 text-sm text-muted">Il servizio non è raggiungibile in questo momento. Riprova tra poco.</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-strong"
        >
          Riprova
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-border bg-surface px-5 text-sm font-medium hover:bg-black/5">
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
