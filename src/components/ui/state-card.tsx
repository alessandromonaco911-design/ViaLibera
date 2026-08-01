import { Button } from "@/components/ui/button";

/** Coherent empty/error state (no stack traces to the user). Editorial flat card. */
export function StateCard({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-surface p-8 shadow-pop motion-scale-in">
        <h1 className="font-mono text-lg font-semibold uppercase tracking-wide">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {action && (
          <div className="mt-6">
            <Button onClick={() => { window.location.href = action.href; }} fullWidth>
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function StateCardLink({ title, message, action }: { title: string; message: string; action?: { label: string; href: string } }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-surface p-8 shadow-pop motion-scale-in">
        <h1 className="font-mono text-lg font-semibold uppercase tracking-wide">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {action && (
          <div className="mt-6">
            <a
              href={action.href}
              className="editorial-press inline-flex h-11 w-full items-center justify-center rounded-md border-2 border-foreground bg-foreground px-5 font-mono text-sm font-medium uppercase tracking-wide text-white hover:bg-black"
            >
              {action.label}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorState({ code, message }: { code: string; message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="w-full border-2 border-foreground bg-danger-soft p-8 shadow-pop motion-scale-in">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-danger">{code}</p>
        <p className="mt-2 text-sm text-foreground">{message}</p>
      </div>
    </div>
  );
}
