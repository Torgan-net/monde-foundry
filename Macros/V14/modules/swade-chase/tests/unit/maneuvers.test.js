import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fleeModifier, speedBonus, changePositionCards, rangeOf, buildActions
} from "../../scripts/rules/maneuvers.js";

test("Fuir : au moins 4 cartes ; −4, −2 à 5, 0 à 6 et plus", () => {
  assert.equal(fleeModifier(3), null);
  assert.equal(fleeModifier(4), -4);
  assert.equal(fleeModifier(5), -2);
  assert.equal(fleeModifier(6), 0);
  assert.equal(fleeModifier(9), 0);
  assert.equal(fleeModifier(null), null);
});

test("Bonus de vitesse", () => {
  assert.equal(speedBonus(10, 12), 0);
  assert.equal(speedBonus(12, 12), 0);
  assert.equal(speedBonus(13, 12), 1);
  assert.equal(speedBonus(24, 12), 2);
  assert.equal(speedBonus(10, 0), 0);
});

test("Changer de position : 1 carte sur Succès, 2 sur Prouesse", () => {
  assert.equal(changePositionCards("failure"), 0);
  assert.equal(changePositionCards("critfail"), 0);
  assert.equal(changePositionCards("success"), 1);
  assert.equal(changePositionCards("raise"), 2);
});

test("Portée = écart × Intervalle", () => {
  assert.equal(rangeOf(3, 5), 15);
  assert.equal(rangeOf(0, 5), 0);
  assert.equal(rangeOf(2, 25), 50);
});

const base = {
  status: "in", mode: "foot", npcCrew: false, round: 3,
  marks: {}, interval: 5, speedBonus: 0,
  opponents: [{ id: "g1", name: "Gobelin", gap: 0 }, { id: "g2", name: "Gobelin", gap: 3 }]
};
const find = (list, id) => list.find((a) => a.id === id);

test("toutes les actions sont proposées à une unité dans la poursuite", () => {
  const a = buildActions(base);
  for (const id of ["changePosition", "liftFoot", "flee", "push", "ram", "evade", "steady", "attack", "test", "support", "power", "hold"]) {
    assert.ok(find(a, id), id);
  }
});

test("Changer de position : deux jets (gratuit / action +2) avec bonus de vitesse", () => {
  const cp = find(buildActions({ ...base, speedBonus: 1 }), "changePosition");
  assert.equal(cp.available, true);
  const free = cp.rolls.find((r) => r.key === "free");
  const act = cp.rolls.find((r) => r.key === "action");
  assert.deepEqual(free.mods.map((m) => m.value), [1]);
  assert.deepEqual(act.mods.map((m) => m.value).sort(), [1, 2]);
});

test("une fois par tour : Changer de position déjà fait, ou après Lever le pied", () => {
  const done = find(buildActions({ ...base, marks: { changedPosition: 3 } }), "changePosition");
  assert.equal(done.available, false);
  const lifted = find(buildActions({ ...base, marks: { liftedFoot: 3 } }), "changePosition");
  assert.equal(lifted.available, false);
  // marque d'un round précédent : sans effet
  const old = find(buildActions({ ...base, marks: { changedPosition: 2 } }), "changePosition");
  assert.equal(old.available, true);
});

test("Fuir dépend de l'adversaire le plus proche", () => {
  assert.equal(find(buildActions(base), "flee").available, false);
  const far = { ...base, opponents: [{ id: "g", name: "G", gap: 5 }] };
  const flee = find(buildActions(far), "flee");
  assert.equal(flee.available, true);
  assert.deepEqual(flee.rolls[0].mods.map((m) => m.value), [-2]);
  const veryFar = find(buildActions({ ...base, opponents: [{ id: "g", name: "G", gap: 6 }] }), "flee");
  assert.deepEqual(veryFar.rolls[0].mods, []);
});

test("Repousser / Éperonner : seulement avec un adversaire sur la même carte", () => {
  assert.equal(find(buildActions(base), "push").available, true);
  const none = { ...base, opponents: [{ id: "g", name: "G", gap: 2 }] };
  assert.equal(find(buildActions(none), "push").available, false);
  assert.equal(find(buildActions(none), "ram").available, false);
});

test("Aborder : navires et vaisseaux seulement", () => {
  assert.equal(find(buildActions(base), "board"), undefined);
  const ship = find(buildActions({ ...base, mode: "boat" }), "board");
  assert.equal(ship.available, true);
});

test("Se dérober : une fois par round", () => {
  assert.equal(find(buildActions(base), "evade").available, true);
  assert.equal(find(buildActions({ ...base, marks: { evaded: 3 } }), "evade").available, false);
});

test("équipage PNJ : pas de Soutien ni d'Épreuve", () => {
  const a = buildActions({ ...base, npcCrew: true });
  assert.equal(find(a, "support").available, false);
  assert.equal(find(a, "test").available, false);
});

test("unité en soutien : seulement Soutien et Épreuve", () => {
  const a = buildActions({ ...base, status: "support" });
  assert.deepEqual(a.filter((x) => x.available).map((x) => x.id).sort(), ["support", "test"]);
});

test("unité hors poursuite : aucune action", () => {
  assert.equal(buildActions({ ...base, status: "out" }).length, 0);
});

test("position inconnue : les actions de distance sont signalées", () => {
  const a = buildActions({ ...base, opponents: [{ id: "g", name: "G", gap: null }] });
  assert.equal(find(a, "flee").available, false);
  assert.match(find(a, "flee").reason, /position/i);
});

test("attaque : cibles avec écart et Portée", () => {
  const atk = find(buildActions(base), "attack");
  assert.deepEqual(atk.targets.map((t) => [t.gap, t.range, t.contact]), [[0, 0, true], [3, 15, false]]);
});

test("Retenir son action : bouton « Passer En attente », sauf si déjà En attente", () => {
  const hold = find(buildActions(base), "hold");
  assert.deepEqual(hold.applies.map((a) => [a.key, a.cost]), [["hold", "none"]]);
  const held = find(buildActions({ ...base, onHold: true }), "hold");
  assert.equal(held.available, false);
  assert.match(held.reason, /Déjà En attente/);
});

test("vaisseau abordé : seul Changer de position, à −4 ; Lever le pied et Fuir impossibles", () => {
  const ctx = { ...base, mode: "boat", boardedBy: "Le Corsaire", opponents: [{ id: "g", name: "G", gap: 5 }] };
  const a = buildActions(ctx);
  const cp = find(a, "changePosition");
  assert.equal(cp.available, true);
  assert.ok(cp.rolls.every((r) => r.mods.some((m) => m.value === -4)));
  assert.match(cp.summary, /plus retenu/);
  assert.equal(find(a, "liftFoot").available, false);
  assert.equal(find(a, "flee").available, false);
  assert.match(find(a, "flee").reason, /abordé/i);
});
