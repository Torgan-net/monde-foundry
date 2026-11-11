import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classeFromValue, averageDamage, weaponClasseValue, computeWeaponClasse,
  computeVehicleClasse, stripClasse, romanToInt, intToRoman
} from "../../scripts/rules/classes.js";

const weapon = (damage, ap, isHeavyWeapon = true) => ({ system: { damage, ap, isHeavyWeapon } });
const vehicle = (total) => ({ system: { toughness: { total } } });

test("Classe d'arme : moyenne des dés + PA, arrondi au supérieur (CSF)", () => {
  assert.equal(weaponClasseValue(weapon("4d6", 10)), 24); // exemple du livre
  assert.equal(computeWeaponClasse(weapon("4d6", 10)), "II");
  assert.equal(weaponClasseValue(weapon("5d10", 30)), 58); // Super Laser
  assert.equal(computeWeaponClasse(weapon("5d10", 30)), "V");
  assert.equal(weaponClasseValue(weapon("3d10", 20)), 37);
  assert.equal(computeWeaponClasse(weapon("3d10", 20)), "III");
});

test("Classe d'arme : les bonus fixes ne comptent pas", () => {
  assert.equal(weaponClasseValue(weapon("3d6+4", 4)), 15); // Gatling Laser
  assert.equal(computeWeaponClasse(weapon("3d6+4", 4)), "I");
  assert.equal(weaponClasseValue(weapon("2d8+10", 5)), 14);
});

test("Classe d'arme : seulement les armes lourdes, formules simples", () => {
  assert.equal(computeWeaponClasse(weapon("2d6", 2, false)), null);
  assert.equal(computeWeaponClasse(weapon("@str+d6", 0)), null);
  assert.equal(averageDamage("2d6"), 7);
  assert.equal(averageDamage(""), null);
});

test("Classe d'arme : bornes de la table", () => {
  for (const [v, c] of [[1, "I"], [20, "I"], [21, "II"], [30, "II"], [31, "III"], [60, "V"], [61, "VI"], [70, "VI"], [71, "VII"], [150, "VII"]]) {
    assert.equal(classeFromValue(v, 20), c, `valeur ${v}`);
  }
  assert.equal(classeFromValue(0, 20), null);
});

test("Classe de véhicule : Résistance totale, bornes de la table", () => {
  for (const [t, c] of [[15, "I"], [16, "II"], [25, "II"], [26, "III"], [45, "IV"], [46, "V"], [55, "V"], [56, "VI"], [65, "VI"], [66, "VII"], [82, "VII"]]) {
    assert.equal(computeVehicleClasse(vehicle(t)), c, `Résistance ${t}`);
  }
  assert.equal(computeVehicleClasse(vehicle(0)), null);
});

test("Nom affiché sans la Classe", () => {
  assert.equal(stripClasse("Super Laser (Classe V)"), "Super Laser");
  assert.equal(stripClasse("Gatling Laser (Class I)"), "Gatling Laser");
  assert.equal(stripClasse("Far Star"), "Far Star");
});

test("Chiffres romains", () => {
  assert.equal(romanToInt("iv"), 4);
  assert.equal(intToRoman(9), "VII");
  assert.equal(intToRoman(0), "I");
});
