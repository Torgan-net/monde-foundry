import { test } from "node:test";
import assert from "node:assert/strict";
import { currentTurn, multiActionMod, applyTurnLimits, MAX_ACTIONS } from "../../scripts/rules/turn.js";
import { buildActions } from "../../scripts/rules/maneuvers.js";

const base = {
  status: "in", mode: "foot", round: 2, marks: {}, interval: 5,
  opponents: [{ id: "g", name: "Gobelin", gap: 0 }, { id: "h", name: "Gobelin", gap: 5 }]
};
const find = (l, id) => l.find((a) => a.id === id);
const withTurn = (turn) => applyTurnLimits(buildActions(base), currentTurn(turn, 2));

test("tour par défaut : 1 action, rien d'utilisé ; un ancien tour est ignoré", () => {
  assert.deepEqual(currentTurn(null, 2), { round: 2, planned: 1, free: null, standard: [], exclusive: false });
  assert.equal(currentTurn({ round: 1, planned: 3, standard: ["x"] }, 2).planned, 1);
  assert.equal(currentTurn({ round: 2, planned: 3, standard: ["x"] }, 2).planned, 3);
  assert.equal(MAX_ACTIONS, 3);
});

test("malus d'actions multiples : 0, −2, −4", () => {
  assert.equal(multiActionMod(1), null);
  assert.equal(multiActionMod(2).value, -2);
  assert.equal(multiActionMod(3).value, -4);
});

test("1 action prévue : pas d'actions multiples", () => {
  const cp = find(withTurn(null), "changePosition");
  const act = cp.rolls.find((r) => r.key === "action");
  assert.deepEqual(act.mods.map((m) => m.value), [2]);
  assert.equal(act.multiAction, undefined);
});

test("2 actions prévues : option « actions multiples » sur les jets en action, pas de modificateur injecté", () => {
  const cp = find(withTurn({ round: 2, planned: 2 }), "changePosition");
  const act = cp.rolls.find((r) => r.key === "action");
  assert.deepEqual(act.mods.map((m) => m.value), [2]);
  assert.equal(act.multiAction, 2);
  assert.equal(act.multiPenalty, -2);
  assert.equal(cp.rolls.find((r) => r.key === "free").multiAction, undefined);
});

test("3 actions prévues : −4", () => {
  const push = find(withTurn({ round: 2, planned: 3 }), "push");
  assert.deepEqual(push.rolls[0].mods, []);
  assert.equal(push.rolls[0].multiAction, 3);
  assert.equal(push.rolls[0].multiPenalty, -4);
});

test("action gratuite utilisée : toutes les autres variantes gratuites sont grisées", () => {
  const a = withTurn({ round: 2, free: "changePosition" });
  const evade = find(a, "evade");
  assert.deepEqual(evade.applies.map((x) => x.key), ["evadeAction"]);
  const steady = find(a, "steady");
  assert.equal(steady.available, false);
  assert.match(steady.reason, /gratuite/);
});

test("actions standard épuisées : les variantes en action sont grisées, la gratuite reste", () => {
  const a = withTurn({ round: 2, planned: 1, standard: ["push"] });
  assert.equal(find(a, "ram").available, false);
  assert.match(find(a, "ram").reason, /1 \/ 1/);
  assert.deepEqual(find(a, "changePosition").rolls.map((r) => r.key), ["free"]);
});

test("2 actions prévues, 1 jouée : la gratuite et la seconde action restent possibles", () => {
  const cp = find(withTurn({ round: 2, planned: 2, standard: ["push"] }), "changePosition");
  assert.deepEqual(cp.rolls.map((r) => r.key), ["free", "action"]);
});

test("action exclusive (Fuir) : seulement seule, sans actions multiples", () => {
  const far = { ...base, opponents: [{ id: "h", name: "Gobelin", gap: 5 }] };
  const withTurn = (turn) => applyTurnLimits(buildActions(far), currentTurn(turn, 2));
  const ok = find(withTurn(null), "flee");
  assert.equal(ok.available, true);
  assert.equal(ok.exclusive, true);
  const multi = find(withTurn({ round: 2, planned: 2 }), "flee");
  assert.equal(multi.available, false);
  assert.match(multi.reason, /exclusive/);
  const used = find(withTurn({ round: 2, free: "steady" }), "flee");
  assert.equal(used.available, false);
});

test("après une action exclusive : tout est grisé", () => {
  const a = withTurn({ round: 2, standard: ["flee"], exclusive: true });
  assert.equal(a.filter((x) => x.available && (x.rolls.length || x.applies.length)).length, 0);
});

test("actions habituelles : bouton « Déclarer » qui consomme une action", () => {
  const atk = find(withTurn(null), "attack");
  assert.deepEqual(atk.applies.map((x) => [x.key, x.cost]), [["declare", "action"]]);
});

test("Lever le pied compte comme une action (sans jet)", () => {
  const lift = find(withTurn(null), "liftFoot");
  assert.deepEqual(lift.applies.map((x) => [x.key, x.cost]), [["liftFoot", "action"]]);
  assert.equal(lift.timing, "Action (sans jet)");
  // actions prévues épuisées : plus de Lever le pied
  const spent = find(withTurn({ round: 2, planned: 2, standard: ["push", "ram"] }), "liftFoot");
  assert.equal(spent.available, false);
  // 2 actions prévues, 1 jouée : encore possible
  assert.equal(find(withTurn({ round: 2, planned: 2, standard: ["push"], free: "steady" }), "liftFoot").available, true);
});

test("Retenir son action : seulement avant toute autre action du round", () => {
  assert.equal(find(withTurn(null), "hold").available, true);
  const afterFree = find(withTurn({ round: 2, free: "steady" }), "hold");
  assert.equal(afterFree.available, false);
  assert.match(afterFree.reason, /avant toute autre action/);
  assert.equal(find(withTurn({ round: 2, standard: ["push"] }), "hold").available, false);
  // un tour d'un round précédent ne compte pas
  assert.equal(find(withTurn({ round: 1, standard: ["push"] }), "hold").available, true);
});

import { turnDone, plannedLocked, actionsSpent } from "../../scripts/rules/turn.js";

test("tour terminé : actions déclarées ET action gratuite faites, ou action exclusive", () => {
  assert.equal(turnDone(currentTurn(null, 2)), false);
  assert.equal(turnDone(currentTurn({ round: 2, planned: 1, free: "steady" }, 2)), false);
  assert.equal(turnDone(currentTurn({ round: 2, planned: 1, standard: ["push"] }, 2)), false);
  assert.equal(turnDone(currentTurn({ round: 2, planned: 1, standard: ["push"], free: "steady" }, 2)), true);
  assert.equal(turnDone(currentTurn({ round: 2, planned: 2, standard: ["push"], free: "steady" }, 2)), false);
  assert.equal(turnDone(currentTurn({ round: 2, planned: 1, standard: ["flee"], exclusive: true }, 2)), true);
});

test("actions déclarées faites : il reste l'action gratuite (après l'action principale)", () => {
  const t = currentTurn({ round: 2, planned: 1, standard: ["push"] }, 2);
  assert.equal(actionsSpent(t), true);
  const a = withTurn({ round: 2, planned: 1, standard: ["push"] });
  assert.deepEqual(find(a, "changePosition").rolls.map((r) => r.key), ["free"]);
  assert.equal(find(a, "steady").available, true);
  assert.equal(find(a, "ram").available, false);
});

test("tour terminé : tout est grisé, y compris gratuites, Lever le pied et Retenir", () => {
  const a = withTurn({ round: 2, planned: 1, standard: ["push"], free: "evade" });
  const playable = a.filter((x) => x.available);
  assert.deepEqual(playable.map((x) => x.id), []);
  assert.match(find(a, "liftFoot").reason, /Tour terminé/);
  assert.match(find(a, "steady").reason, /Tour terminé/);
});

test("nombre d'actions verrouillé dès la première action engagée", () => {
  assert.equal(plannedLocked(currentTurn(null, 2)), false);
  assert.equal(plannedLocked(currentTurn({ round: 2, free: "steady" }, 2)), true);
  assert.equal(plannedLocked(currentTurn({ round: 2, planned: 2, standard: ["push"] }, 2)), true);
});

import { blockForComplication } from "../../scripts/rules/turn.js";
test("Complication en attente : toutes les actions sont bloquées", () => {
  const a = blockForComplication(withTurn(null));
  assert.equal(a.filter((x) => x.available).length, 0);
  assert.match(find(a, "changePosition").reason, /Complication/);
  assert.deepEqual(find(a, "changePosition").rolls, []);
});

test("un seul déplacement volontaire par tour : après Changer de position, ni second Changer de position ni Lever le pied", () => {
  const ctx = { ...base, marks: { changedPosition: 2 } };
  const a = applyTurnLimits(buildActions(ctx), currentTurn({ round: 2, planned: 3, free: "changePosition" }, 2));
  assert.equal(find(a, "changePosition").available, false);
  assert.equal(find(a, "liftFoot").available, false);
  // … mais les autres actions restent possibles
  assert.equal(find(a, "push").available, true);
});

test("après Lever le pied : plus de Changer de position (ni gratuit ni en action)", () => {
  const a = applyTurnLimits(buildActions({ ...base, marks: { liftedFoot: 2 } }), currentTurn({ round: 2, planned: 3, standard: ["liftFoot"] }, 2));
  assert.equal(find(a, "changePosition").available, false);
  assert.equal(find(a, "liftFoot").available, false);
});

test("actions répétables : Repousser ou Attaquer plusieurs fois avec des actions multiples", () => {
  const a = withTurn({ round: 2, planned: 3, standard: ["push", "push"] });
  assert.equal(find(a, "push").available, true);
  assert.equal(find(a, "attack").available, true);
  const b = withTurn({ round: 2, planned: 3, standard: ["attack", "attack"] });
  assert.equal(find(b, "attack").available, true);
});

import { remainingActions } from "../../scripts/rules/turn.js";
test("actions restantes (avertissement avant de passer la main)", () => {
  assert.deepEqual(remainingActions(currentTurn(null, 2)), ["1 action sur 1", "l'action gratuite"]);
  assert.deepEqual(remainingActions(currentTurn({ round: 2, planned: 3, standard: ["push"] }, 2)), ["2 actions sur 3", "l'action gratuite"]);
  assert.deepEqual(remainingActions(currentTurn({ round: 2, planned: 1, standard: ["push"] }, 2)), ["l'action gratuite"]);
  assert.deepEqual(remainingActions(currentTurn({ round: 2, planned: 1, standard: ["push"], free: "steady" }, 2)), []);
  assert.deepEqual(remainingActions(currentTurn({ round: 2, planned: 1, standard: ["flee"], exclusive: true }, 2)), []);
});

import { MANEUVER_IDS } from "../../scripts/rules/maneuvers.js";
test("liste des manœuvres (chapitre Manœuvres) : Attaquer, Soutien, Épreuve, Pouvoir n'en sont pas", () => {
  assert.deepEqual([...MANEUVER_IDS].sort(), ["board", "changePosition", "evade", "flee", "liftFoot", "push", "ram", "steady"]);
  const a = buildActions(base);
  assert.equal(find(a, "push").maneuver, true);
  assert.equal(find(a, "attack").maneuver, undefined);
});

test("une seule manœuvre en action par tour (règle de table) ; les actions standard restent répétables", () => {
  const t = currentTurn({ round: 2, planned: 3, standard: ["push"] }, 2);
  const a = applyTurnLimits(buildActions(base), t, { oneManeuver: true });
  assert.equal(find(a, "ram").available, false);
  assert.match(find(a, "ram").reason, /une seule manœuvre en action/i);
  // la gratuite reste possible pour une manœuvre
  assert.deepEqual(find(a, "changePosition").rolls.map((r) => r.key), ["free"]);
  assert.deepEqual(find(a, "evade").applies.map((x) => x.key), ["evadeFree"]);
  // les actions standard (non-manœuvres) restent possibles
  assert.equal(find(a, "attack").available, true);
  assert.equal(find(a, "support").available, true);
});

test("sans la règle de table : plusieurs manœuvres en action possibles", () => {
  const t = currentTurn({ round: 2, planned: 3, standard: ["push"] }, 2);
  const a = applyTurnLimits(buildActions(base), t, { oneManeuver: false });
  assert.equal(find(a, "ram").available, true);
});
