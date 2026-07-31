"use client";

import { ErrorCard } from "@/components/ui/loading";

export default function SimulationError({ reset }: { reset: () => void }) {
  return <ErrorCard reset={reset} message="Non è stato possibile caricare la simulazione. Riprova tra poco." />;
}
