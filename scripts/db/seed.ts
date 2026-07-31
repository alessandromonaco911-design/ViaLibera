import { db, sql } from "../../src/lib/db";
import { questionCatalogVersions, topics } from "../../src/lib/db/schema";

/**
 * Minimal seed: patente B catalog placeholder + clearly fake test topics.
 * NO official questions are inserted until the import pipeline is verified.
 */
async function main() {
  console.log("Seeding minimal reference data...");

  await db
    .insert(questionCatalogVersions)
    .values({
      licenseCategory: "B",
      officialName: "Catalogo quiz patente B (segnalibro, da popolare via pipeline)",
      versionCode: "unknown",
      status: "discovered",
      metadata: { note: "Seed iniziale; versione ufficiale da determinare con l'audit delle fonti." },
    })
    .onConflictDoNothing({
      target: [questionCatalogVersions.licenseCategory, questionCatalogVersions.versionCode],
    });

  const fakeTopics = [
    { code: "TEST-1", name: "Argomento di prova 1 (SEED-FITTIZIO - dati non ufficiali)" },
    { code: "TEST-2", name: "Argomento di prova 2 (SEED-FITTIZIO - dati non ufficiali)" },
  ];
  for (const t of fakeTopics) {
    await db.insert(topics).values(t).onConflictDoNothing({ target: [topics.code] });
  }

  console.log("Seed done.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
