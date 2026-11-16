import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleCategory, ramDamage } from "../../scripts/rules/ram.js";

test("Échelle : modificateur d'Échelle SWADE (system.stats.scale) → catégorie", () => {
  assert.equal(scaleCategory({ scale: -6 }).dice, 1);   // Minuscule → au moins Petit (d6)
  assert.equal(scaleCategory({ scale: -2 }).label, "Petit");
  assert.equal(scaleCategory({ scale: 0 }).dice, 2);
  assert.equal(scaleCategory({ scale: 2 }).label, "Grand");
  assert.equal(scaleCategory({ scale: 4 }).dice, 4);
  assert.equal(scaleCategory({ scale: 6 }).label, "Gigantesque");
});

test("Échelle : repli sur la Taille quand l'Échelle manque", () => {
  assert.equal(scaleCategory({ size: -2 }).label, "Petit");
  assert.equal(scaleCategory({ size: 0 }).label, "Normal");
  assert.equal(scaleCategory({ size: 3 }).label, "Normal");
  assert.equal(scaleCategory({ size: 4 }).label, "Grand");
  assert.equal(scaleCategory({ size: 8 }).label, "Énorme");
  assert.equal(scaleCategory({ size: 12 }).label, "Gigantesque");
  assert.equal(scaleCategory({}).label, "Normal");
});

test("dégâts de base : Échelle de celui qui les provoque", () => {
  const r = ramDamage({ dealer: { scale: 0, toughness: 5 }, target: { toughness: 5 } });
  assert.equal(r.formula, "2d6");
  assert.deepEqual(r.parts.map((p) => p.label), ["Échelle Normal"]);
});

test("Prouesse de l'attaquant : +d6", () => {
  assert.equal(ramDamage({ dealer: { scale: 0 }, target: {}, raise: true }).formula, "3d6");
});

test("Résistance : +d6 si plus élevée que l'adversaire, +2d6 si au moins le double", () => {
  assert.equal(ramDamage({ dealer: { scale: 2, toughness: 11 }, target: { toughness: 10 } }).formula, "4d6");
  assert.equal(ramDamage({ dealer: { scale: 2, toughness: 20 }, target: { toughness: 10 } }).formula, "5d6");
  assert.equal(ramDamage({ dealer: { scale: 2, toughness: 10 }, target: { toughness: 10 } }).formula, "3d6");
});

test("Vitesse : +d6 entre 90 et 180 km/h, +2d6 au-delà", () => {
  assert.equal(ramDamage({ dealer: { scale: 0, speedKmh: 89 }, target: {} }).formula, "2d6");
  assert.equal(ramDamage({ dealer: { scale: 0, speedKmh: 90 }, target: {} }).formula, "3d6");
  assert.equal(ramDamage({ dealer: { scale: 0, speedKmh: 180 }, target: {} }).formula, "3d6");
  assert.equal(ramDamage({ dealer: { scale: 0, speedKmh: 181 }, target: {} }).formula, "4d6");
});

test("cumul complet (voiture lourde à 200 km/h, Prouesse)", () => {
  const r = ramDamage({ dealer: { scale: 4, toughness: 24, speedKmh: 200 }, target: { toughness: 12 }, raise: true });
  assert.equal(r.formula, "9d6");    // 4 + 1 + 2 + 2
  assert.equal(r.parts.length, 4);
});
