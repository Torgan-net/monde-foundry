import { test } from "node:test";
import assert from "node:assert/strict";
import { complicationFor, criticalFailureEffect, traitOutcome, needsCriticalDie } from "../../scripts/rules/complication.js";

const sum = (c) => c.mods.reduce((s, m) => s + m.value, 0);

test("table des Complications (p. 125)", () => {
  const sp = complicationFor("spades");
  assert.equal(sum(sp), 0);
  assert.equal(sp.failure, "critical");

  const he = complicationFor("hearts");
  assert.equal(sum(he), 0);
  assert.equal(he.failure, "bumped");
  assert.equal(he.cards, 1);

  const di = complicationFor("diamonds");
  assert.equal(sum(di), -2);
  assert.equal(di.failure, "bumped");
  assert.equal(di.cards, 1);

  const cl = complicationFor("clubs");
  assert.equal(sum(cl), -2);
  assert.equal(cl.failure, "critical");

  const jo = complicationFor("joker");
  assert.equal(sum(jo), 2);
  assert.equal(jo.failure, "bumped");
  assert.equal(jo.cards, 2);
});

test("Rues de la ville : −2 supplémentaire, sauf Joker", () => {
  assert.equal(sum(complicationFor("diamonds", { cityStreets: true })), -4);
  assert.equal(sum(complicationFor("spades", { cityStreets: true })), -2);
  assert.equal(sum(complicationFor("joker", { cityStreets: true })), 2);
});

test("enseigne inconnue → null", () => {
  assert.equal(complicationFor(null), null);
  assert.equal(complicationFor("cups"), null);
});

test("Échec critique à pied : pair = perd son tour, impair = Fatigue", () => {
  assert.equal(criticalFailureEffect("foot", 2).loseTurn, true);
  assert.equal(criticalFailureEffect("foot", 6).loseTurn, true);
  assert.equal(criticalFailureEffect("foot", 3).fatigue, "self");
  assert.equal(criticalFailureEffect("foot", 1).fatigue, "self");
});

test("Échec critique monté : 1-2 passe, 3-4 monture, 5-6 cavalier", () => {
  assert.equal(criticalFailureEffect("mounted", 1).loseTurn, true);
  assert.equal(criticalFailureEffect("mounted", 2).loseTurn, true);
  assert.equal(criticalFailureEffect("mounted", 3).fatigue, "mount");
  assert.equal(criticalFailureEffect("mounted", 4).fatigue, "mount");
  assert.equal(criticalFailureEffect("mounted", 5).fatigue, "self");
  assert.equal(criticalFailureEffect("mounted", 6).fatigue, "self");
});

test("Échec critique en véhicule : Perte de contrôle, sans dé", () => {
  for (const mode of ["vehicle", "boat", "air"]) {
    assert.equal(needsCriticalDie(mode), false);
    assert.equal(criticalFailureEffect(mode, null).outOfControl, true);
  }
  assert.equal(needsCriticalDie("foot"), true);
  assert.equal(needsCriticalDie("mounted"), true);
});

test("Sur les toits (à pied) : 1-2 tour, 3-4 Fatigue, 5-6 chute", () => {
  const o = { rooftops: true };
  assert.equal(criticalFailureEffect("foot", 2, o).loseTurn, true);
  assert.equal(criticalFailureEffect("foot", 4, o).fatigue, "self");
  assert.equal(criticalFailureEffect("foot", 5, o).fall, true);
  assert.equal(criticalFailureEffect("foot", 6, o).fall, true);
  // les toits ne changent rien pour un cavalier
  assert.equal(criticalFailureEffect("mounted", 5, o).fatigue, "self");
});

test("résultat d'un jet de Trait", () => {
  assert.equal(traitOutcome({ total: 3 }), "failure");
  assert.equal(traitOutcome({ total: 4 }), "success");
  assert.equal(traitOutcome({ total: 7 }), "success");
  assert.equal(traitOutcome({ total: 8 }), "raise");
  assert.equal(traitOutcome({ total: 12, isCritfail: true }), "critfail");
  assert.equal(traitOutcome({ total: 6, target: 6 }), "success");
  assert.equal(traitOutcome({ total: 9, target: 6 }), "success");
  assert.equal(traitOutcome({ total: 10, target: 6 }), "raise");
  assert.equal(traitOutcome(null), null);
});

import { mountFatigueMod } from "../../scripts/rules/complication.js";
test("Fatigue de la monture : malus aux jets d'Équitation du cavalier", () => {
  assert.equal(mountFatigueMod(0), null);
  assert.deepEqual(mountFatigueMod(1), { label: "Fatigue de la monture", value: -1 });
  assert.deepEqual(mountFatigueMod(2), { label: "Fatigue de la monture", value: -2 });
  assert.equal(mountFatigueMod(undefined), null);
});
