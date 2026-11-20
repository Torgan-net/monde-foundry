import { test } from "node:test";
import assert from "node:assert/strict";
import { computePaletteShift, toLocalTranslate } from "../../scripts/rules/hud-clamp.js";

const viewport = { width: 1920, height: 1080 };
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

test("panneau entièrement visible : aucun décalage", () => {
  assert.deepEqual(computePaletteShift({ rect: rect(500, 300, 600, 400), viewport }), { dx: 0, dy: 0 });
});

test("dépasse à droite : ramené à la marge du bord droit", () => {
  const { dx, dy } = computePaletteShift({ rect: rect(1500, 300, 600, 400), viewport });
  assert.equal(dx, 1920 - 8 - 2100);
  assert.equal(dy, 0);
});

test("barre latérale ouverte : le bord droit devient son bord gauche", () => {
  const { dx } = computePaletteShift({ rect: rect(1200, 300, 600, 400), viewport, rightLimit: 1620 });
  assert.equal(dx, 1620 - 8 - 1800);
});

test("barre latérale plus à droite que l'écran : l'écran l'emporte", () => {
  const { dx } = computePaletteShift({ rect: rect(1500, 300, 600, 400), viewport, rightLimit: 3000 });
  assert.equal(dx, 1920 - 8 - 2100);
});

test("dépasse à gauche : ramené à la marge", () => {
  assert.equal(computePaletteShift({ rect: rect(-50, 300, 600, 400), viewport }).dx, 58);
});

test("dépasse en bas : remonté", () => {
  const { dx, dy } = computePaletteShift({ rect: rect(500, 900, 600, 400), viewport });
  assert.equal(dx, 0);
  assert.equal(dy, 1080 - 8 - 1300);
});

test("trop haut : redescendu sous la place réservée à « effacer tout »", () => {
  assert.equal(computePaletteShift({ rect: rect(500, 10, 600, 400), viewport }).dy, 30);
});

test("plus haut que l'écran : le haut reste visible", () => {
  const { dy } = computePaletteShift({ rect: rect(500, 200, 600, 1200), viewport });
  assert.equal(200 + dy, 40);
});

test("plus large que la zone : le bord gauche reste visible", () => {
  const { dx } = computePaletteShift({ rect: rect(100, 300, 2500, 400), viewport });
  assert.equal(100 + dx, 8);
});

test("marges personnalisées", () => {
  const { dx, dy } = computePaletteShift({ rect: rect(1500, 900, 600, 400), viewport, margin: 20, topMargin: 0 });
  assert.equal(dx, 1920 - 20 - 2100);
  assert.equal(dy, 1080 - 20 - 1300);
});

test("toLocalTranslate : convertit selon l'échelle du HUD", () => {
  assert.equal(toLocalTranslate({ dx: -100, dy: 50 }, 2), "-50px 25px");
});

test("toLocalTranslate : aucun décalage → chaîne vide", () => {
  assert.equal(toLocalTranslate({ dx: 0, dy: 0 }, 1.5), "");
});

test("toLocalTranslate : échelle nulle ou invalide → 1", () => {
  assert.equal(toLocalTranslate({ dx: 10, dy: 0 }, 0), "10px 0px");
  assert.equal(toLocalTranslate({ dx: 10, dy: 0 }, NaN), "10px 0px");
});
