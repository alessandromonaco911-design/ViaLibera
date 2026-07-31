export default function AllenamentoLoading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 text-center">
      <div role="status" aria-label="Caricamento" className="flex items-center gap-3 text-sm text-muted">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
        Caricamento…
      </div>
    </div>
  );
}
