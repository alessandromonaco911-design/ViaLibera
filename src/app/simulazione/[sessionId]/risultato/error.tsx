"use client";

import { ErrorCard } from "@/components/ui/loading";

export default function RisultatoError({ reset }: { reset: () => void }) {
  return <ErrorCard reset={reset} message="Non è stato possibile caricare il risultato. Riprova tra poco." />;
}
