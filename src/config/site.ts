/**
 * ViaLibera — product configuration (single source of truth).
 *
 * Provisional product name and exam-format parameters. Change values here
 * and they propagate to the homepage, API, generator and UI.
 *
 * NOTE: the question selection is an INTERNAL distribution compatible with
 * the official exam format (30 questions, 20 minutes, max 3 errors). It is
 * NOT a replica of the ministerial algorithm.
 */

export const siteConfig = {
  /** provisional product name */
  name: "ViaLibera",
  tagline: "Preparati all’esame senza perdere tempo.",
  description:
    "Simulazioni compatibili con il formato dell’esame ufficiale per la patente B, basate sul catalogo ufficiale importato. Nessuna registrazione richiesta.",
  licenseCategory: "B",
  /** version of the local exam format (bump on breaking payload/schema changes) */
  examFormatVersion: "1.0.0",
  /** public payload version — part of every payload/submit */
  payloadVersion: 1,

  exam: {
    totalQuestions: 30,
    durationSeconds: 1200, // 20 minuti
    allowedErrors: 3,
    mode: "simulation",
  },

  /** internal selection policy (NOT the ministerial algorithm) */
  selection: {
    /** hard cap of questions per official group in one simulation */
    maxPerGroup: 4,
    seedMin: 1,
    seedMax: 2147483647,
  },

  /** local storage key prefix for exam sessions */
  storageKeyPrefix: "vialibera:exam:v1",
} as const;

export type SiteConfig = typeof siteConfig;
