import { Button } from "@/components/ui/button";

/** Lightweight skeleton used by route loading.tsx files (no giant spinners). */
export function LoadingCard({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16" role="status" aria-label={label}>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="mx-auto h-6 w-40 animate-pulse rounded bg-black/10" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg bg-black/5 p-2.5">
              <div className="h-3 w-16 animate-pulse rounded bg-black/10" />
              <div className="mt-2 h-6 w-10 animate-pulse rounded bg-black/10" />
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-black/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Client error boundary content (no technical details). */
export function ErrorCard({ reset, message }: { reset?: () => void; message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full rounded-2xl border border-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold">Qualcosa è andato storto</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {reset && (
          <div className="mt-6">
            <Button fullWidth onClick={reset}>Riprova</Button>
          </div>
        )}
      </div>
    </div>
  );
}
