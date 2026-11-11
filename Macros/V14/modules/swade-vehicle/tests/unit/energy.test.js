import { test } from "node:test";
import assert from "node:assert/strict";
import { computePowerMods, powerLabel } from "../../scripts/rules/energy.js";

const zero = { handling: 0, soak: 0, weaponDamage: 0, weaponWounds: 0 };

test("Pas de répartition : aucun modificateur", () => {
  assert.deepEqual(computePowerMods(null), zero);
});

test("Propulsion renforcée : +2 par source ; les sources détournées sont pénalisées", () => {
  assert.deepEqual(computePowerMods({ boost: "propulsion", from: ["shields"] }), { ...zero, handling: 2, soak: -4 });
  assert.deepEqual(computePowerMods({ boost: "propulsion", from: ["shields", "weapons"] }),
    { handling: 4, soak: -4, weaponDamage: -4, weaponWounds: -1 });
});

test("Boucliers et armes renforcés", () => {
  assert.deepEqual(computePowerMods({ boost: "shields", from: ["propulsion"] }), { ...zero, handling: -4, soak: 2 });
  assert.deepEqual(computePowerMods({ boost: "weapons", from: ["propulsion", "shields"] }),
    { handling: -4, soak: -4, weaponDamage: 8, weaponWounds: 2 });
});

test("Recharge d'urgence du bouclier : propulsion et armes détournées", () => {
  assert.deepEqual(computePowerMods({ boost: "recharge", from: ["propulsion", "weapons"] }),
    { handling: -4, soak: 0, weaponDamage: -4, weaponWounds: -1 });
});

test("Libellés", () => {
  assert.equal(powerLabel({ boost: "weapons", from: ["propulsion"] }), "Armes renforcées, énergie détournée : propulsion");
  assert.equal(powerLabel(null), null);
});
