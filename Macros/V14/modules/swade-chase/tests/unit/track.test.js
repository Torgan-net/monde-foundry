import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTrack, locateOnTrack } from "../../scripts/rules/track.js";

// Piste réelle du dump (scène MPy3bt7bDJVBNE46), cartes 200 × 300, x/y = coin supérieur gauche.
// Volontairement mélangée pour vérifier le tri.
const W = 200, H = 300;
const raw = [
  { id: "c5", suit: "clubs", value: 2, x: 2776.77, y: 1699.31 },
  { id: "c0", suit: "clubs", value: 13, x: 1004.24, y: 1780.72 },
  { id: "c8", suit: "clubs", value: 7, x: 3781.16, y: 1393.57 },
  { id: "c2", suit: "diamonds", value: 9, x: 1686.72, y: 1621.49 },
  { id: "c1", suit: "hearts", value: 2, x: 1352.29, y: 1682.28 },
  { id: "c7", suit: "spades", value: 4, x: 3455.56, y: 1454.41 },
  { id: "c3", suit: "diamonds", value: 3, x: 2059.38, y: 1623.67 },
  { id: "c6", suit: "clubs", value: 14, x: 3104.86, y: 1605.83 },
  { id: "c4", suit: "clubs", value: 9, x: 2409.25, y: 1666.02 }
].map((c) => ({ ...c, w: W, h: H }));

const track = orderTrack(raw);
const tok = (x, y) => ({ x, y, w: 100, h: 100 });

test("la piste est ordonnée depuis la carte la plus à gauche", () => {
  assert.deepEqual(track.map((c) => c.id), ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
  assert.equal(track[0].index, 0);
  assert.equal(track[8].index, 8);
});

test("rattachement des jetons du dump (posés au-dessus des cartes)", () => {
  const cases = [
    ["Gobelin 1406", tok(1406, 1590), 1],
    ["Gobelin 2452", tok(2452, 1570), 4],
    ["Gobelin 2493", tok(2493, 1446), 4],
    ["Gobelin 2790", tok(2790, 1431), 5],
    ["Janar", tok(3491, 1181), 7],
    ["Merryl", tok(3761, 1294), 8],
    ["Edrin", tok(3812, 1158), 8]
  ];
  for (const [name, rect, idx] of cases) {
    const r = locateOnTrack(track, rect);
    assert.equal(r.onTrack, true, name);
    assert.equal(r.index, idx, name);
    assert.equal(r.ambiguous, false, name);
  }
});

test("Elharn, à cheval entre 4♠ et 7♣ : rattaché au 4♠ mais signalé", () => {
  const r = locateOnTrack(track, tok(3626, 1320));
  assert.equal(r.onTrack, true);
  assert.equal(r.index, 7);
  assert.equal(r.ambiguous, true);
  assert.equal(r.alternative, 8);
});

test("Kapla, au-delà de la dernière carte : hors piste", () => {
  const r = locateOnTrack(track, tok(4007, 1270));
  assert.equal(r.onTrack, false);
  assert.equal(r.reason, "after");
});

test("avant la première carte : hors piste", () => {
  const r = locateOnTrack(track, tok(800, 1700));
  assert.equal(r.onTrack, false);
  assert.equal(r.reason, "before");
});

test("loin de la piste (sur le côté) : hors piste", () => {
  const r = locateOnTrack(track, tok(2450, 800));
  assert.equal(r.onTrack, false);
  assert.equal(r.reason, "far");
});

test("pas de piste", () => {
  assert.equal(locateOnTrack([], tok(0, 0)).reason, "no-track");
  assert.deepEqual(orderTrack([]), []);
});

test("piste d'une seule carte", () => {
  const one = orderTrack([{ id: "a", suit: "hearts", value: 5, x: 0, y: 0, w: W, h: H }]);
  assert.equal(locateOnTrack(one, tok(50, -120)).index, 0);
  assert.equal(locateOnTrack(one, tok(2000, 2000)).onTrack, false);
});

test("véhicule 3 × 3 qui déborde de la dernière carte : reste sur la piste (marge = demi-jeton)", () => {
  const big = { x: 3880, y: 1100, w: 300, h: 300 };
  const r = locateOnTrack(track, big);
  assert.equal(r.onTrack, true);
  assert.equal(r.index, 8);
});

test("véhicule 2 × 2 posé au-dessus de sa carte, un peu loin : reste sur la piste", () => {
  // centre à 350 px au-dessus du haut de la carte 9♣ (seuil sans marge : 300)
  const r = locateOnTrack(track, { x: 2409, y: 1216, w: 200, h: 200 });
  assert.equal(r.onTrack, true);
  assert.equal(r.index, 4);
});
