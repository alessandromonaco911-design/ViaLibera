import { join } from "node:path";
import { activeCatalog } from "../../src/config/catalog";

/** Explicit identities prevent importing a new snapshot into an old version by accident. */
export function catalogInput(catalogId: string) {
  const sourceId = catalogId === activeCatalog.id ? activeCatalog.sourceId : catalogId === "ab-2025-04-23" ? "pda-2025-ab-it" : null;
  if (!sourceId) throw new Error(`Catalogo non configurato: ${catalogId}`);
  return {
    catalogId,
    licenseCategory: "AB",
    versionCode: catalogId === activeCatalog.id ? activeCatalog.versionCode : "2025-04-23",
    manifestPath: join(process.cwd(), "data", "manifests", `${sourceId}.json`),
    pdfPath: join(process.cwd(), "data", "official", catalogId === activeCatalog.id ? "ab-portale-verificato-2026-10-22.pdf" : "domande-AB-italiano-23-04-2025.pdf"),
    registerSource: true,
  };
}
