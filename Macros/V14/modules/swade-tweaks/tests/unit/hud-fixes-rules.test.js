import { test } from "node:test";
import assert from "node:assert/strict";
import { HUD_FIXES, isFixAvailable, activeFixClasses, MLD_ID } from "../../scripts/rules/hud-fixes.js";

const byKey = (k) => HUD_FIXES.find((f) => f.key === k);
const allOn = () => true;

test("catalogue : clés uniques, libellés et aide renseignés", () => {
  const keys = HUD_FIXES.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const f of HUD_FIXES) {
    assert.ok(f.name && f.hint, `libellé ou aide manquant : ${f.key}`);
  }
});

test("catalogue : classes CSS préfixées par le module", () => {
  for (const f of HUD_FIXES.filter((f) => f.cssClass)) {
    assert.match(f.cssClass, /^swade-tweaks--/);
  }
});

test("catalogue : corrections propres à Monk's Little Details", () => {
  for (const k of ["fixMldHeight", "fixMldNames", "fixMldHighlight"]) assert.equal(byKey(k).requires, MLD_ID);
  for (const k of ["fixStatusColors", "fixTrackerOpacity", "fixPaletteClamp"]) assert.equal(byKey(k).requires, null);
});

test("catalogue : le recalage du panneau est du JS, sans classe CSS", () => {
  assert.equal(byKey("fixPaletteClamp").cssClass, null);
});

test("isFixAvailable : sans prérequis → toujours", () => {
  assert.equal(isFixAvailable(byKey("fixStatusColors"), () => false), true);
});

test("isFixAvailable : prérequis inactif → non", () => {
  assert.equal(isFixAvailable(byKey("fixMldHeight"), () => false), false);
  assert.equal(isFixAvailable(byKey("fixMldHeight"), (id) => id === MLD_ID), true);
});

test("activeFixClasses : tout coché, MLD actif → toutes les classes", () => {
  const classes = activeFixClasses(HUD_FIXES, allOn, allOn);
  assert.deepEqual(classes.sort(), HUD_FIXES.filter((f) => f.cssClass).map((f) => f.cssClass).sort());
});

test("activeFixClasses : MLD inactif → pas ses classes, même cochées", () => {
  const classes = activeFixClasses(HUD_FIXES, allOn, () => false);
  assert.ok(!classes.includes(byKey("fixMldHeight").cssClass));
  assert.ok(classes.includes(byKey("fixStatusColors").cssClass));
});

test("activeFixClasses : réglage décoché → pas de classe", () => {
  const classes = activeFixClasses(HUD_FIXES, (k) => k !== "fixTrackerOpacity", allOn);
  assert.ok(!classes.includes(byKey("fixTrackerOpacity").cssClass));
});
