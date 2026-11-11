import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRollOutcome } from "../../scripts/rules/support.js";
import { shieldMaxForSize, soakNegations, emergencyRechargeValue } from "../../scripts/rules/shield.js";
import { woundPenalty, clampVehicleWounds, isWreckedValue } from "../../scripts/rules/wounds.js";

test("Jet de groupe : meilleur des deux dés + modificateur contre 4", () => {
  assert.deepEqual(groupRollOutcome({ trait: 9, wild: 2, mod: 0 }).bonus, 2);
  assert.deepEqual(groupRollOutcome({ trait: 3, wild: 5, mod: 0 }).bonus, 1);
  assert.deepEqual(groupRollOutcome({ trait: 3, wild: 2, mod: 0 }).bonus, 0);
  assert.deepEqual(groupRollOutcome({ trait: 6, wild: 2, mod: 2 }).bonus, 2);
});

test("Jet de groupe : échec critique (deux 1) = −2, non relançable", () => {
  const r = groupRollOutcome({ trait: 1, wild: 1, traitFirst: 1, wildFirst: 1, mod: 0, previous: 2 });
  assert.deepEqual([r.bonus, r.critFail, r.kept], [-2, true, false]);
});

test("Jet de groupe relancé : on garde le meilleur résultat", () => {
  const r = groupRollOutcome({ trait: 4, wild: 2, mod: 0, previous: 2 });
  assert.deepEqual([r.bonus, r.kept], [2, true]);
  assert.equal(groupRollOutcome({ trait: 9, wild: 2, mod: 0, previous: 1 }).bonus, 2);
});

test("Bouclier : charges max = moitié des Blessures de base, arrondie à l'inférieur", () => {
  assert.equal(shieldMaxForSize(15), 3);
  assert.equal(shieldMaxForSize(21), 4);
  assert.equal(shieldMaxForSize(5), 2);
});

test("Bouclier : Blessures annulées par jet (une par réussite et par Prouesse)", () => {
  for (const [total, n] of [[3, 0], [4, 1], [7, 1], [8, 2], [11, 2], [12, 3]]) assert.equal(soakNegations(total), n, `total ${total}`);
  assert.equal(soakNegations(undefined), 0);
});

test("Bouclier : recharge d'urgence", () => {
  assert.equal(emergencyRechargeValue(1, 4, "fail"), 1);
  assert.equal(emergencyRechargeValue(1, 4, "success"), 3);
  assert.equal(emergencyRechargeValue(3, 4, "success"), 4);
  assert.equal(emergencyRechargeValue(0, 3, "raise"), 3);
});

test("Blessures du véhicule : malus, plafond max + 1, épave au-delà du maximum", () => {
  assert.equal(woundPenalty(2, 0), -2);
  assert.equal(woundPenalty(5, 1), -3);
  assert.equal(woundPenalty(0, 2), 0);
  assert.equal(clampVehicleWounds(9, 5), 6);
  assert.equal(clampVehicleWounds(-2, 5), 0);
  assert.equal(isWreckedValue(6, 5), true);
  assert.equal(isWreckedValue(5, 5), false);
});
