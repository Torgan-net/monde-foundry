import { test } from "node:test";
import assert from "node:assert/strict";
import { readActionCard, triggersComplication, chaseCardLabel } from "../../scripts/rules/cards.js";

// Données réelles (dump du 15/11/2026)
const janar = { suitValue: 1, cardValue: 10, hasJoker: false, cardString: "10♣" };
const edrin = { suitValue: 2, cardValue: 12, hasJoker: false, cardString: "Q♦" };
const redJoker = { suitValue: 4, cardValue: 99, hasJoker: true, cardString: "Red J" };
const blackJoker = { suitValue: 4, cardValue: 98, hasJoker: true, cardString: "Blk J" };

test("lit l'enseigne de la carte d'action", () => {
  assert.equal(readActionCard(janar).suit, "clubs");
  assert.equal(readActionCard(edrin).suit, "diamonds");
  assert.equal(readActionCard({ suitValue: 3, cardValue: 6 }).suit, "hearts");
  assert.equal(readActionCard({ suitValue: 4, cardValue: 5 }).suit, "spades");
});

test("Joker : enseigne joker, couleur selon la valeur", () => {
  const r = readActionCard(redJoker);
  assert.equal(r.suit, "joker");
  assert.equal(r.isJoker, true);
  assert.equal(r.red, true);
  assert.equal(readActionCard(blackJoker).red, false);
});

test("pas de carte → null", () => {
  assert.equal(readActionCard(null), null);
  assert.equal(readActionCard({ cardValue: null }), null);
  assert.equal(readActionCard({ cardValue: 0, suitValue: 0 }), null);
});

test("seul un trèfle déclenche la Complication", () => {
  assert.equal(triggersComplication(readActionCard(janar)), true);
  assert.equal(triggersComplication(readActionCard(edrin)), false);
  assert.equal(triggersComplication(readActionCard(redJoker)), false);
  assert.equal(triggersComplication(null), false);
});

test("libellé d'une carte de poursuite (VF)", () => {
  assert.equal(chaseCardLabel({ suit: "spades", value: 4 }), "4♠");
  assert.equal(chaseCardLabel({ suit: "clubs", value: 13 }), "R♣");
  assert.equal(chaseCardLabel({ suit: "clubs", value: 14 }), "A♣");
  assert.equal(chaseCardLabel({ suit: "hearts", value: 11 }), "V♥");
  assert.equal(chaseCardLabel({ suit: "diamonds", value: 12 }), "D♦");
  assert.equal(chaseCardLabel({ suit: "joker", value: 99 }), "Joker");
});

import { isOnHold } from "../../scripts/rules/cards.js";
test("En attente : system.roundHeld (dump du 16/11/2026)", () => {
  assert.equal(isOnHold({ roundHeld: 1 }), true);
  assert.equal(isOnHold({ roundHeld: 0 }), false);
  assert.equal(isOnHold({ roundHeld: null }), false);
  assert.equal(isOnHold({}), false);
});
