import Link from "next/link";

export default function AllenamentoNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-surface p-8 shadow-pop motion-scale-in">
        <p className="font-mono text-xs uppercase tracking-[0.2em]">404</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold uppercase tracking-tight">Non trovato</h1>
        <p className="mt-2 text-sm text-muted">Questo allenamento non esiste o il link non è più valido.</p>
        <Link
          href="/allenamento"
          className="editorial-press mt-6 inline-flex h-11 items-center justify-center rounded-md border-2 border-foreground bg-foreground px-5 font-mono text-sm font-medium uppercase tracking-wide text-white hover:bg-black"
        >
          Scegli un altro argomento
        </Link>
      </div>
    </div>
  );
}
