import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowIntro, INTRO_STORAGE_KEY } from "../src/lib/intro";

test("intro: session flag presente + URL normale (dev) -> saltata", () => {
  assert.equal(
    shouldShowIntro({ seen: true, reduce: false, isDev: true, replay: false }),
    false,
  );
});

test("intro: session flag presente + ?intro=1 in development -> mostrata", () => {
  assert.equal(
    shouldShowIntro({ seen: true, reduce: false, isDev: true, replay: true }),
    true,
  );
});

test("intro: prima visita (senza flag) -> mostrata, sia dev sia production", () => {
  assert.equal(shouldShowIntro({ seen: false, reduce: false, isDev: true, replay: false }), true);
  assert.equal(shouldShowIntro({ seen: false, reduce: false, isDev: false, replay: false }), true);
});

test("intro: production ignora ?intro=1 (flag presente -> saltata)", () => {
  assert.equal(
    shouldShowIntro({ seen: true, reduce: false, isDev: false, replay: true }),
    false,
  );
});

test("intro: reduced motion -> saltata, tranne replay dev", () => {
  // production: reduced motion always skips (anche prima visita)
  assert.equal(shouldShowIntro({ seen: false, reduce: true, isDev: false, replay: false }), false);
  assert.equal(shouldShowIntro({ seen: false, reduce: true, isDev: false, replay: true }), false);
  // dev senza replay: reduced motion salta
  assert.equal(shouldShowIntro({ seen: false, reduce: true, isDev: true, replay: false }), false);
  // dev replay (?intro=1): forzata anche con reduced motion
  assert.equal(shouldShowIntro({ seen: false, reduce: true, isDev: true, replay: true }), true);
  assert.equal(shouldShowIntro({ seen: true, reduce: true, isDev: true, replay: true }), true);
});

test("intro: chiave sessionStorage esportata e stabile", () => {
  assert.equal(INTRO_STORAGE_KEY, "vialibera_intro_seen");
});
