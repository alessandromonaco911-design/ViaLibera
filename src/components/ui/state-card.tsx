import { Button } from "@/components/ui/button";

/** Coherent empty/error state (no stack traces to the user). */
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
      <div className="w-full rounded-2xl border border-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold">{title}</h1>
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
      <div className="w-full rounded-2xl border border-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {action && (
          <div className="mt-6">
            <a
              href={action.href}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-strong"
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
  void code;
  return <StateCardLink title="Qualcosa è andato storto" message={message} action={{ label: "Torna alla home", href: "/" }} />;
}
