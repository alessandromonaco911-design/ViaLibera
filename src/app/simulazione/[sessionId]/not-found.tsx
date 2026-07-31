import Link from "next/link";

export default function SimulationNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full rounded-2xl border border-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold">Sessione inesistente</h1>
        <p className="mt-2 text-sm text-muted">
          Questa simulazione non esiste o il link non è più valido.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-strong"
          >
            Inizia una nuova simulazione
          </Link>
        </div>
      </div>
    </div>
  );
}
