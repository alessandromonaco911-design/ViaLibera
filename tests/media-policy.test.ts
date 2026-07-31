import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isMediaUsable,
  allowedMediaStatuses,
  getEnvironment,
  DEFAULT_PRODUCTION_ALLOWED,
} from "../src/lib/media/policy";

const originalProdStatuses = process.env.MEDIA_PRODUCTION_ALLOWED_STATUSES;

afterEach(() => {
  // NODE_ENV is read-only at runtime; only the configurable env var is restored
  if (originalProdStatuses === undefined) delete process.env.MEDIA_PRODUCTION_ALLOWED_STATUSES;
  else process.env.MEDIA_PRODUCTION_ALLOWED_STATUSES = originalProdStatuses;
});

test("policy: development permette tutti gli stati verificati", () => {
  assert.equal(isMediaUsable("structurally_verified", "development"), true);
  assert.equal(isMediaUsable("ai_visually_verified", "development"), true);
  assert.equal(isMediaUsable("visually_verified", "development"), true);
});

test("policy: development rifiuta extracted/ambiguous/missing/rejected", () => {
  assert.equal(isMediaUsable("extracted", "development"), false);
  assert.equal(isMediaUsable("ambiguous", "development"), false);
  assert.equal(isMediaUsable("missing", "development"), false);
  assert.equal(isMediaUsable("rejected", "development"), false);
  assert.equal(isMediaUsable(undefined, "development"), false);
  assert.equal(isMediaUsable(null, "development"), false);
});

test("policy: test come development", () => {
  for (const s of ["structurally_verified", "ai_visually_verified", "visually_verified"]) {
    assert.equal(isMediaUsable(s, "test"), true, s);
  }
  assert.equal(isMediaUsable("ambiguous", "test"), false);
});

test("policy: production default conservativo (solo stati pienamente verificati)", () => {
  assert.equal(isMediaUsable("structurally_verified", "production"), true);
  assert.equal(isMediaUsable("ai_visually_verified", "production"), true);
  assert.equal(isMediaUsable("visually_verified", "production"), true);
  assert.equal(isMediaUsable("ambiguous", "production"), false);
  assert.equal(isMediaUsable("rejected", "production"), false);
  assert.equal(isMediaUsable("missing", "production"), false);
});

test("policy: production configurabile via env, mai rejected/missing", () => {
  process.env.MEDIA_PRODUCTION_ALLOWED_STATUSES = "structurally_verified,rejected,missing,visually_verified";
  assert.equal(isMediaUsable("structurally_verified", "production"), true);
  assert.equal(isMediaUsable("visually_verified", "production"), true);
  assert.equal(isMediaUsable("rejected", "production"), false); // mai riammesso
  assert.equal(isMediaUsable("missing", "production"), false);
});

test("policy: getEnvironment riflette l'ambiente (NODE_ENV read-only a runtime)", () => {
  // eseguito sotto npm test con NODE_ENV non-production -> development
  assert.equal(getEnvironment(), process.env.NODE_ENV === "production" ? "production" : "development");
});

test("policy: default production documentato e stabile", () => {
  assert.deepEqual([...DEFAULT_PRODUCTION_ALLOWED].sort(), [
    "ai_visually_verified",
    "structurally_verified",
    "visually_verified",
  ]);
});

test("policy: allowedMediaStatuses per ambiente", () => {
  assert.deepEqual([...allowedMediaStatuses("development")].sort(), [
    "ai_visually_verified",
    "structurally_verified",
    "visually_verified",
  ]);
  assert.deepEqual([...allowedMediaStatuses("test")].sort(), [...allowedMediaStatuses("development")].sort());
  assert.deepEqual([...allowedMediaStatuses("production")].sort(), [...DEFAULT_PRODUCTION_ALLOWED].sort());
});

test("policy: usata dal generatore (selezione rispetta la policy)", async () => {
  const { selectQuestions } = await import("../src/lib/exam/generator");
  const candidates = [
    { id: "q1", groupCode: "G1", imageRef: "a".repeat(64), mediaStatus: "structurally_verified" },
    { id: "q2", groupCode: "G1", imageRef: "b".repeat(64), mediaStatus: "ambiguous" },
    { id: "q3", groupCode: "G1", imageRef: "c".repeat(64), mediaStatus: "visually_verified" },
  ];
  const { selected } = selectQuestions(candidates, { seed: 1, total: 3, maxPerGroup: 4 });
  const ids = selected.map((c) => c.id);
  assert.ok(ids.includes("q1"));
  assert.ok(ids.includes("q3"));
  assert.ok(!ids.includes("q2"));
});
