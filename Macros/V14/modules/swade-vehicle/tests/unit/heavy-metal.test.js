import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHeavyMetal } from "../../scripts/rules/heavy-metal.js";

const hm = (o) => resolveHeavyMetal(o);

test("Écart de Classes (table Heavy Metal)", () => {
  assert.equal(hm({ weaponClass: "I", targetClass: "III", raise: true }).noEffect, true); // 2 niveaux dessous
  assert.equal(hm({ weaponClass: "II", targetClass: "III" }).wounds, 0);                 // 1 niveau dessous
  assert.equal(hm({ weaponClass: "IV", targetClass: "IV", d3: 2 }).wounds, 2);           // égales : d3
  assert.equal(hm({ weaponClass: "V", targetClass: "IV", d3: 2 }).wounds, 3);            // d3 + 1 par niveau
  assert.equal(hm({ weaponClass: "VII", targetClass: "IV", d3: 1 }).wounds, 4);
});

test("Prouesse : +1, peut faire passer 0 à 1 mais jamais « aucun effet »", () => {
  assert.equal(hm({ weaponClass: "II", targetClass: "III", raise: true }).wounds, 1);
  assert.equal(hm({ weaponClass: "I", targetClass: "III", raise: true }).noEffect, true);
});

test("Le pilote de la cible doit manœuvrer dès que l'attaque a un effet", () => {
  assert.equal(hm({ weaponClass: "II", targetClass: "III" }).maneuver, true);
  assert.equal(hm({ weaponClass: "I", targetClass: "III" }).maneuver, false);
});

test("Ogives", () => {
  assert.equal(hm({ weaponClass: "III", targetClass: "IV", warhead: "ap", targetArmor: 20, d3: 1 }).wounds, 1); // cible -1 Classe
  assert.equal(hm({ weaponClass: "III", targetClass: "IV", warhead: "ap", targetArmor: 6 }).wounds, 0);         // Armure < 10
  assert.equal(hm({ weaponClass: "II", targetClass: "IV", warhead: "phase" }).wounds, 0);                       // arme +1 Classe
  assert.equal(hm({ weaponClass: "III", targetClass: "IV", warhead: "plasma", raise: true }).wounds, 2);       // Prouesse +2
  const he1 = hm({ weaponClass: "IV", targetClass: "IV", warhead: "he", d3: 1 });
  assert.deepEqual([he1.wounds, he1.extraCritical], [0, false]);
  const he3 = hm({ weaponClass: "IV", targetClass: "IV", warhead: "he", d3: 3 });
  assert.deepEqual([he3.wounds, he3.extraCritical], [2, true]);
  const emp = hm({ weaponClass: "IV", targetClass: "IV", warhead: "emp", d3: 3 });
  assert.deepEqual([emp.wounds, emp.electronicsOut], [1, true]);
  const emp0 = hm({ weaponClass: "III", targetClass: "IV", warhead: "emp" });
  assert.deepEqual([emp0.wounds, emp0.electronicsOut], [0, false]);
  assert.equal(hm({ weaponClass: "I", targetClass: "VII", warhead: "nuclear" }).wounds, 10);
});

test("Prouesse avant les réductions des ogives (choix validé)", () => {
  assert.equal(hm({ weaponClass: "IV", targetClass: "IV", warhead: "emp", d3: 1, raise: true }).wounds, 0);
});

test("Gestion de l'énergie en Blessures", () => {
  assert.equal(hm({ weaponClass: "V", targetClass: "IV", d3: 2, energyWounds: 2 }).wounds, 5);
  assert.equal(hm({ weaponClass: "IV", targetClass: "V", energyWounds: -1 }).wounds, 0);
  assert.equal(hm({ weaponClass: "II", targetClass: "V", energyWounds: 2 }).noEffect, true);
});

test("Classe manquante : erreur explicite", () => {
  assert.throws(() => hm({ weaponClass: "IV" }));
});
