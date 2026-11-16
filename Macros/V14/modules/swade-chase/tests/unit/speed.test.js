import { test } from "node:test";
import assert from "node:assert/strict";
import { toKmh, autoSpeedBonus, parseSpeed } from "../../scripts/rules/speed.js";

test("conversion en km/h", () => {
  assert.equal(toKmh({ value: 100, unit: "km/h" }), 100);
  assert.equal(toKmh({ value: 100, unit: "kph" }), 100);
  assert.equal(Math.round(toKmh({ value: 60, unit: "mph" })), 97);
  assert.equal(toKmh({ value: 50, unit: "" }), 50);          // unité absente : valeur brute
  assert.equal(toKmh({ value: 50, unit: "noeuds" }), null);   // unité inconnue
  assert.equal(toKmh(null), null);
});

test("lecture d'une Vitesse saisie en texte", () => {
  assert.deepEqual(parseSpeed("120 km/h"), { value: 120, unit: "km/h" });
  assert.deepEqual(parseSpeed("75 mph"), { value: 75, unit: "mph" });
  assert.deepEqual(parseSpeed(90), { value: 90, unit: "" });
  assert.equal(parseSpeed("rapide"), null);
});

test("bonus automatique : strictement plus rapide +1, au moins deux fois +2", () => {
  const v = (value) => ({ value, unit: "km/h" });
  assert.equal(autoSpeedBonus(v(100), [v(100)]).bonus, 0);
  assert.equal(autoSpeedBonus(v(101), [v(100)]).bonus, 1);
  assert.equal(autoSpeedBonus(v(200), [v(100), v(60)]).bonus, 2);
  assert.equal(autoSpeedBonus(v(150), [v(100), v(80)]).bonus, 1);
  // comparé au plus rapide des assaillants
  assert.equal(autoSpeedBonus(v(150), [v(160), v(40)]).bonus, 0);
  const r = autoSpeedBonus(v(150), [v(100)]);
  assert.equal(r.mine, 150);
  assert.equal(r.fastest, 100);
});

test("bonus impossible à calculer : Vitesse inconnue d'un côté ou pas d'assaillant", () => {
  const v = (value) => ({ value, unit: "km/h" });
  assert.equal(autoSpeedBonus(null, [v(100)]), null);
  assert.equal(autoSpeedBonus(v(100), [v(100), null]), null);
  assert.equal(autoSpeedBonus(v(100), []), null);
});

test("personnages : comparaison des Allures", () => {
  const p = (value) => ({ value, unit: "pace" });
  assert.equal(autoSpeedBonus(p(6), [p(6)]).bonus, 0);
  assert.equal(autoSpeedBonus(p(8), [p(6), p(5)]).bonus, 1);
  assert.equal(autoSpeedBonus(p(12), [p(6)]).bonus, 2);
  assert.deepEqual(autoSpeedBonus(p(8), [p(6)]), { bonus: 1, mine: 8, fastest: 6, kind: "pace" });
});

test("Allure contre Vitesse max : incomparable", () => {
  assert.equal(autoSpeedBonus({ value: 6, unit: "pace" }, [{ value: 60, unit: "km/h" }]), null);
  assert.equal(autoSpeedBonus({ value: 60, unit: "km/h" }, [{ value: 6, unit: "pace" }]), null);
});
