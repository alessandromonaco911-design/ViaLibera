import Link from "next/link";

export default function AllenamentoNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-2xl font-semibold tracking-tight">Non trovato</p>
      <p className="mt-2 text-sm text-muted">Questo allenamento non esiste o il link non è più valido.</p>
      <Link href="/allenamento" className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-strong">
        Scegli un altro argomento
      </Link>
    </div>
  );
}
