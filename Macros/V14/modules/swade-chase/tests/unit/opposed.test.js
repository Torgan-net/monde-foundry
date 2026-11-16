import { test } from "node:test";
import assert from "node:assert/strict";
import { opposedOutcome, pushResult, boardResult } from "../../scripts/rules/opposed.js";

test("jet opposé : l'attaquant doit réussir ET battre le défenseur ; égalité au défenseur", () => {
  assert.equal(opposedOutcome({ total: 6 }, { total: 5 }), "win");
  assert.equal(opposedOutcome({ total: 6 }, { total: 6 }), "lose");
  assert.equal(opposedOutcome({ total: 3 }, { total: 1 }), "lose");     // pas de Succès
  assert.equal(opposedOutcome({ total: 10 }, { total: 6 }), "raise");   // 4 de plus
  assert.equal(opposedOutcome({ total: 9 }, { total: 6 }), "win");
  assert.equal(opposedOutcome({ total: 2, isCritfail: true }, { total: 1 }), "critfail");
  assert.equal(opposedOutcome({ total: 6 }, null), null);
  assert.equal(opposedOutcome(null, { total: 6 }), null);
});

test("Repousser : victoire → défenseur Bousculé ; Prouesse → + Échec critique ; Échec critique → retour à l'envoyeur", () => {
  assert.deepEqual(pushResult("win"), { bumpDefender: true, defenderCritical: false, bumpAttacker: false });
  assert.deepEqual(pushResult("raise"), { bumpDefender: true, defenderCritical: true, bumpAttacker: false });
  assert.deepEqual(pushResult("lose"), { bumpDefender: false, defenderCritical: false, bumpAttacker: false });
  assert.deepEqual(pushResult("critfail"), { bumpDefender: false, defenderCritical: false, bumpAttacker: true });
});

test("Aborder : victoire → bord à bord, défenseurs En attente ; Prouesse → pas En attente", () => {
  assert.deepEqual(boardResult("win"), { boarded: true, defendersOnHold: true });
  assert.deepEqual(boardResult("raise"), { boarded: true, defendersOnHold: false });
  assert.deepEqual(boardResult("lose"), { boarded: false, defendersOnHold: false });
});
