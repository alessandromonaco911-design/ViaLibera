export default function AllenamentoLoading() {
  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div role="status" aria-label="Caricamento" className="flex items-center gap-3 font-mono text-sm text-foreground">
        <span className="h-5 w-5 animate-spin rounded-sm border-2 border-foreground border-t-transparent" aria-hidden />
        Caricamento…
      </div>
    </div>
  );
}
