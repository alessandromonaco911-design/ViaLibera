import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db";
import { questionCatalogVersions } from "../src/lib/db/schema";
import { getImportedCatalogId } from "../src/lib/exam/generator";

test("catalog selection requires the exact imported version and licence, without fallback", async () => {
  const version = randomUUID();
  const rows = await db.insert(questionCatalogVersions).values([
    { licenseCategory: "ZC", versionCode: `${version}-old`, officialName: "Old fixture", status: "imported", importedAt: new Date(0) },
    { licenseCategory: "ZC", versionCode: version, officialName: "Pinned fixture", status: "imported", importedAt: new Date(1) },
    { licenseCategory: "ZD", versionCode: version, officialName: "Other licence", status: "imported", importedAt: new Date() },
    { licenseCategory: "ZC", versionCode: `${version}-pending`, officialName: "Incomplete fixture", status: "importing" },
  ]).returning({ id: questionCatalogVersions.id });
  try {
    assert.equal(await getImportedCatalogId({ licenseCategory: "ZC", versionCode: version }), rows[1].id);
    assert.equal(await getImportedCatalogId({ licenseCategory: "ZC", versionCode: `${version}-old` }), rows[0].id);
    assert.equal(await getImportedCatalogId({ licenseCategory: "ZC", versionCode: `${version}-pending` }), null);
    assert.equal(await getImportedCatalogId({ licenseCategory: "ZC", versionCode: `${version}-missing` }), null);
  } finally {
    await db.delete(questionCatalogVersions).where(inArray(questionCatalogVersions.id, rows.map(row => row.id)));
    await sql.end();
  }
});
