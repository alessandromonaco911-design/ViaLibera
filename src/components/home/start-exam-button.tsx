"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTaskTransition } from "@/components/ui/task-transition";

export function StartExamButton() {
  const router = useRouter();
  const task = useTaskTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    task.begin("exam");
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as { sessionId?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.sessionId) {
        setError(data?.error?.message ?? "Impossibile avviare la simulazione. Riprova.");
        setBusy(false);
        task.finish();
        return;
      }
      router.push(`/simulazione/${data.sessionId}`);
    } catch {
      task.finish();
      setError("Errore di rete. Verifica la connessione e riprova.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <Button size="lg" fullWidth onClick={start} disabled={busy} aria-busy={busy}>
        {busy ? "Preparazione…" : "Inizia simulazione"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 border-2 border-foreground bg-danger-soft p-3 font-mono text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
