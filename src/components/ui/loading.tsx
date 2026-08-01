export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div role="status" aria-label="Caricamento" className="flex items-center gap-3 font-mono text-sm text-foreground">
        <span className="h-5 w-5 animate-spin rounded-sm border-2 border-foreground border-t-transparent" aria-hidden />
        Caricamento…
      </div>
    </div>
  );
}

/** Inline loading block used by page-level loading fallbacks. */
export function LoadingCard({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex w-full items-center justify-center gap-3 border-2 border-foreground bg-surface p-8 font-mono text-sm">
      <span className="h-5 w-5 animate-spin rounded-sm border-2 border-foreground border-t-transparent" aria-hidden />
      {label}
    </div>
  );
}

/** Page-level error fallback with retry. */
export function ErrorCard({ reset, message }: { reset: () => void; message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-surface p-8 shadow-pop motion-scale-in">
        <p className="font-mono text-xs uppercase tracking-[0.2em]">Errore</p>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <button
          type="button"
          onClick={reset}
          className="editorial-press mt-6 inline-flex h-11 items-center justify-center rounded-md border-2 border-foreground bg-foreground px-5 font-mono text-sm font-medium uppercase tracking-wide text-white hover:bg-black"
        >
          Riprova
        </button>
      </div>
    </div>
  );
}
