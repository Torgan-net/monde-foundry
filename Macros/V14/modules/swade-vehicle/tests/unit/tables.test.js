import { test } from "node:test";
import assert from "node:assert/strict";
import { criticalOutcome, outOfControlOutcome, addCritical, speedMultiplier, CRIT_MAX } from "../../scripts/rules/tables.js";

test("Dégradations critiques : résultat d'après le 2d6", () => {
  const expected = { 2: "scratch", 3: "handling", 4: "speed", 5: "speed", 6: "chassis", 7: "chassis", 8: "chassis", 9: "crew", 10: "crew", 11: "weapon", 12: "system" };
  for (const [total, key] of Object.entries(expected)) assert.equal(criticalOutcome(Number(total)), key, `2d6 = ${total}`);
});

test("Perte de contrôle : résultat d'après le 2d6", () => {
  const expected = { 2: "majorCollision", 3: "minorCollision", 4: "minorCollision", 5: "distracted", 9: "distracted", 10: "vulnerable", 11: "vulnerable", 12: "glitch" };
  for (const [total, key] of Object.entries(expected)) assert.equal(outOfControlOutcome(Number(total)), key, `2d6 = ${total}`);
});

test("Cumul des Dégradations : Maniabilité −4 au plus, Vitesse 60 % au moins", () => {
  let c = { handling: 0, speed: 0, destroyed: [] };
  for (let i = 0; i < 6; i++) c = addCritical(c, "handling");
  for (let i = 0; i < 6; i++) c = addCritical(c, "speed");
  assert.deepEqual([c.handling, c.speed], [CRIT_MAX.handling, CRIT_MAX.speed]);
  assert.equal(speedMultiplier(c.speed), 0.6);
  assert.equal(speedMultiplier(1), 0.9);
});

test("Arme détruite : ajoutée une seule fois", () => {
  let c = addCritical({ handling: 0, speed: 0, destroyed: [] }, "weapon", "w1");
  c = addCritical(c, "weapon", "w1");
  assert.deepEqual(c.destroyed, ["w1"]);
});
