import Link from "next/link";

export default function SimulationNotFound() {
  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-surface p-8 shadow-pop motion-scale-in">
        <p className="font-mono text-xs uppercase tracking-[0.2em]">404</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold uppercase tracking-tight">Sessione inesistente</h1>
        <p className="mt-2 text-sm text-muted">Questa simulazione non esiste o il link non è più valido.</p>
        <div className="mt-6">
          <Link
            href="/"
            className="editorial-press inline-flex h-11 w-full items-center justify-center rounded-md border-2 border-foreground bg-foreground px-5 font-mono text-sm font-medium uppercase tracking-wide text-white hover:bg-black"
          >
            Inizia una nuova simulazione
          </Link>
        </div>
      </div>
    </div>
  );
}
