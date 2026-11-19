import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTurnChange } from "../../scripts/rules/turn-order.js";

test("cas signalé : une carte retirée passe devant, le curseur revient en tête", () => {
  // Bran a retiré une meilleure carte : il passe premier, le curseur est resté sur Ada
  assert.deepEqual(computeTurnChange(["bran", "ada", "cole"], 1, "bran"), { turn: 0, direction: -1 });
});

test("avancer le curseur : direction positive", () => {
  assert.deepEqual(computeTurnChange(["a", "b", "c"], 0, "c"), { turn: 2, direction: 1 });
});

test("déjà actif : rien à écrire", () => {
  assert.equal(computeTurnChange(["a", "b"], 1, "b"), null);
});

test("combattant absent de l'ordre, sans repli : rien à écrire", () => {
  assert.equal(computeTurnChange(["a", "b"], 0, "x"), null);
});

test("suiveur absent de l'ordre : le curseur va sur son meneur", () => {
  assert.deepEqual(computeTurnChange(["a", "meneur"], 0, "suiveur", "meneur"), { turn: 1, direction: 1 });
});

test("le combattant visé est prioritaire sur son meneur", () => {
  assert.deepEqual(computeTurnChange(["a", "meneur", "suiveur"], 0, "suiveur", "meneur"), { turn: 2, direction: 1 });
});

test("curseur non défini : le choix est appliqué", () => {
  assert.deepEqual(computeTurnChange(["a", "b"], null, "a"), { turn: 0, direction: 1 });
});
