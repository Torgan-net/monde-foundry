import { test } from "node:test";
import assert from "node:assert/strict";
import { complicationFor, criticalFailureEffect, driverWord } from "../../scripts/rules/complication.js";
import { modsPhrase } from "../../scripts/rules/wording.js";

test("qui tient les commandes : pilote (avion, vaisseau), barreur (bateau), conducteur (autre véhicule)", () => {
  assert.equal(driverWord("air"), "pilote");
  assert.equal(driverWord("boat"), "barreur");
  assert.equal(driverWord("vehicle"), "conducteur");
});

test("Échec critique d'un véhicule : Perte de contrôle, avec le bon mot", () => {
  assert.match(criticalFailureEffect("air", null).text, /pilote/);
  assert.match(criticalFailureEffect("boat", null).text, /barreur/);
  assert.match(criticalFailureEffect("vehicle", null).text, /conducteur.*Pertes de contrôle/);
});

test("conséquence d'une Complication précisée selon le mode", () => {
  assert.match(complicationFor("spades", { mode: "vehicle" }).failureText, /Perte de contrôle/);
  assert.match(complicationFor("clubs", { mode: "foot" }).failureText, /pair, il perd le reste de son tour ; impair, il subit un niveau de Fatigue/);
  assert.match(complicationFor("spades", { mode: "mounted" }).failureText, /1d6/);
  assert.match(complicationFor("hearts", { mode: "vehicle" }).failureText, /Bousculé/);
});

test("modificateur lisible : « sans modificateur » au lieu de « à 0 »", () => {
  assert.equal(modsPhrase([]), "sans modificateur");
  assert.equal(modsPhrase([{ label: "x", value: -2 }]), "à −2");
  assert.equal(modsPhrase([{ label: "x", value: 2 }]), "à +2");
});
