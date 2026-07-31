/**
 * Official sources registry — verified on 2026-07-31 by direct inspection
 * of the pages and downloads. Only public, official (MIT / Portale dell'Automobilista)
 * resources. No invented URLs.
 */
export interface OfficialSource {
  id: string;
  title: string;
  pageUrl: string;
  downloadUrl: string;
  /** original filename as exposed by the portal */
  originalFilename: string;
  /** safe local filename */
  localFilename: string;
  /** category of the quiz list */
  licenseCategory: string;
  /** publication/update date if known from the source */
  publishedAt: string | null;
  sourceVersion: string | null;
  notes: string;
}

export const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    id: "pda-2025-ab-it",
    title: "Quiz per le patenti AM, B, superiori e CQC — Patente AB (italiano)",
    pageUrl:
      "https://www.ilportaledellautomobilista.it/web/portale-automobilista/-/quiz-per-le-patenti-am-b-superiori-e-cqc",
    downloadUrl:
      "https://www.ilportaledellautomobilista.it/documents/56611/57321/domande+AB+italiano+23+04+2025/95e60cf5-8e20-444a-87d3-7b51e979e851",
    originalFilename: "domande AB italiano 23 04 2025.pdf",
    localFilename: "domande-AB-italiano-23-04-2025.pdf",
    licenseCategory: "AB",
    publishedAt: "2025-04-23",
    sourceVersion: "2025-04-23",
    notes:
      "Banca quesiti esame teoria patenti A1/A2/A/B1/B. Lista ufficiale corrente della pagina 'QUIZ PER LE PATENTI AM, B, SUPERIORI E CQC'. Le immagini dei segnali sono incorporate nel PDF, una per riga-domanda. Pagina aggiornata al 25-11-2025 ma il file AB risulta datato 23-04-2025.",
  },
  {
    id: "pda-b-historical",
    title: "Foglio rosa e prove d'esame — Domande Patente B (archivio storico)",
    pageUrl: "https://www.ilportaledellautomobilista.it/web/portale-automobilista/foglio-rosa-e-prove-new",
    downloadUrl:
      "https://www.ilportaledellautomobilista.it/documents/56611/85457073/DomandeB.pdf/a49693dd-5652-4eb9-aedf-d45423467ccd",
    originalFilename: "DomandeB.pdf",
    localFilename: "DomandeB.pdf",
    licenseCategory: "B",
    publishedAt: null,
    sourceVersion: null,
    notes:
      "Versione archivistica del listato Patente B, stessa struttura del file AB corrente (594 pagine). Conservata per confronto/evoluzione della banca quesiti.",
  },
];
