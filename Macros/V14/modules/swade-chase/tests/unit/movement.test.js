import { test } from "node:test";
import assert from "node:assert/strict";
import { moveIndex, shiftPosition, moveChoices } from "../../scripts/rules/movement.js";

test("index cible le long de la piste (9 cartes)", () => {
  assert.deepEqual(moveIndex(9, 4, 1), { index: 5, overflow: 0 });
  assert.deepEqual(moveIndex(9, 4, -2), { index: 2, overflow: 0 });
  assert.deepEqual(moveIndex(9, 8, 0), { index: 8, overflow: 0 });
});

test("au-delà des bouts : débordement (cartes à ajouter), on reste sur la dernière carte", () => {
  assert.deepEqual(moveIndex(9, 8, 2), { index: 8, overflow: 2, side: "after" });
  assert.deepEqual(moveIndex(9, 7, 2), { index: 8, overflow: 1, side: "after" });
  assert.deepEqual(moveIndex(9, 0, -1), { index: 0, overflow: 1, side: "before" });
});

test("nouvelle position du jeton : même décalage par rapport à sa carte", () => {
  const from = { cx: 3556, cy: 1604 }, to = { cx: 3881, cy: 1544 };
  assert.deepEqual(shiftPosition({ x: 3491, y: 1181 }, from, to), { x: 3816, y: 1121 });
});

test("choix de déplacement : Succès 1 carte, Prouesse jusqu'à 2, dans les deux sens", () => {
  const s = moveChoices({ max: 1 });
  assert.deepEqual(s.map((c) => c.steps), [1, -1, 0]);
  const r = moveChoices({ max: 2 });
  assert.deepEqual(r.map((c) => c.steps), [2, 1, -1, -2, 0]);
  assert.match(r[0].label, /avant.*2/i);
  assert.match(r[3].label, /arrière.*2/i);
});

test("choix de déplacement : sens imposé (Lever le pied : arrière seulement, sans « ne pas bouger »)", () => {
  const back = moveChoices({ max: 2, forward: false, stay: false });
  assert.deepEqual(back.map((c) => c.steps), [-1, -2]);
});

import { freeSpot } from "../../scripts/rules/movement.js";
test("place libre : la cible si personne n'y est", () => {
  assert.deepEqual(freeSpot({ x: 100, y: 100, w: 100, h: 100 }, [], { step: 100 }), { x: 100, y: 100 });
});

test("place libre : décalage d'une case quand un jeton occupe déjà la cible", () => {
  const p = freeSpot({ x: 100, y: 100, w: 100, h: 100 }, [{ x: 100, y: 100, w: 100, h: 100 }], { step: 100 });
  assert.notDeepEqual(p, { x: 100, y: 100 });
  assert.equal(Math.abs(p.x - 100) + Math.abs(p.y - 100) <= 200, true);
});

test("place libre : plusieurs jetons, aucun chevauchement (véhicule 2 × 2 compris)", () => {
  const occ = [{ x: 100, y: 100, w: 100, h: 100 }, { x: 200, y: 100, w: 100, h: 100 }, { x: 0, y: 100, w: 100, h: 100 }];
  const p = freeSpot({ x: 100, y: 100, w: 200, h: 200 }, occ, { step: 100 });
  const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.ok(occ.every((o) => !ov({ ...p, w: 200, h: 200 }, o)));
});
