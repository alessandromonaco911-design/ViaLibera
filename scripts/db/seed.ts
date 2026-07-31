import { eq } from "drizzle-orm";
import { db } from "../../src/lib/db";
import { questionCatalogVersions, questions, topics } from "../../src/lib/db/schema";

/**
 * Minimal, idempotent seed.
 * - NO fake topics are created anymore (TEST-1/TEST-2 were phase-1 placeholders
 *   and are removed here if present and unreferenced).
 * - A placeholder catalog row (B/unknown) is created ONLY when no catalog
 *   exists at all; the real importer replaces this state.
 * - NO official questions are inserted (the importer does that).
 */
async function main() {
  console.log("Seeding minimal reference data...");

  // remove phase-1 fake topics if unreferenced
  for (const code of ["TEST-1", "TEST-2"]) {
    const fake = (await db.select({ id: topics.id }).from(topics).where(eq(topics.code, code)).limit(1))[0];
    if (fake) {
      const qref = (await db.select({ id: questions.id }).from(questions).where(eq(questions.topicId, fake.id)).limit(1))[0];
      if (!qref) {
        await db.delete(topics).where(eq(topics.id, fake.id));
        console.log(`[seed] rimosso topic fittizio ${code} (non referenziato)`);
      } else {
        console.log(`[seed] topic fittizio ${code} ancora referenziato: non rimosso`);
      }
    }
  }

  // placeholder catalog only if none exists
  const anyCatalog = await db.select({ id: questionCatalogVersions.id }).from(questionCatalogVersions).limit(1);
  if (anyCatalog.length === 0) {
    await db
      .insert(questionCatalogVersions)
      .values({
        licenseCategory: "B",
        officialName: "Catalogo quiz patente B (segnaposto: verrà sostituito dall'import ufficiale)",
        versionCode: "unknown",
        status: "discovered",
        metadata: { note: "Segnaposto iniziale; l'importatore crea il catalogo ufficiale." },
      })
      .onConflictDoNothing({
        target: [questionCatalogVersions.licenseCategory, questionCatalogVersions.versionCode],
      });
  }

  console.log("Seed done.");
  await (db.$client as { end: () => Promise<void> }).end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
