import { test } from "node:test";
import assert from "node:assert/strict";
import { damageTrigger, statusTrigger, readCondition } from "../../scripts/rules/damage.js";

const st = (o = {}) => ({ shaken: false, stunned: false, wounds: 0, ...o });

test("personnage : Secoué, Sonné ou Blessé → Bousculé", () => {
  assert.deepEqual(damageTrigger({ isVehicle: false, before: st(), after: st({ shaken: true }) }), { bump: true, control: false, cause: "Secoué" });
  assert.equal(damageTrigger({ isVehicle: false, before: st(), after: st({ stunned: true }) }).cause, "Sonné");
  assert.equal(damageTrigger({ isVehicle: false, before: st({ wounds: 1 }), after: st({ wounds: 2 }) }).cause, "Blessé");
});

test("personnage : rien de nouveau → pas de Bousculé", () => {
  assert.equal(damageTrigger({ isVehicle: false, before: st({ shaken: true }), after: st({ shaken: true }) }), null);
  assert.equal(damageTrigger({ isVehicle: false, before: st({ wounds: 2 }), after: st({ wounds: 1 }) }), null);  // soins
  assert.equal(damageTrigger({ isVehicle: false, before: st({ shaken: true }), after: st() }), null);           // récupère
});

test("véhicule : Blessure → Bousculé + jet de Manœuvre du conducteur (sinon Perte de contrôle)", () => {
  assert.deepEqual(damageTrigger({ isVehicle: true, before: st(), after: st({ wounds: 1 }) }),
    { bump: true, control: true, cause: "dégâts au moins égaux à sa Résistance" });
  assert.equal(damageTrigger({ isVehicle: true, before: st(), after: st({ shaken: true }) }), null);  // un véhicule n'est pas Secoué
});

test("effets de statut posés (Secoué / Sonné)", () => {
  assert.equal(statusTrigger(new Set(["shaken"])), "Secoué");
  assert.equal(statusTrigger(new Set(["stunned"])), "Sonné");
  assert.equal(statusTrigger(new Set(["prone", "stunned"])), "Sonné");
  assert.equal(statusTrigger(new Set(["prone"])), null);
  assert.equal(statusTrigger(["shaken"]), "Secoué");
  assert.equal(statusTrigger(null), null);
});

test("lecture de l'état (system SWADE) avec repli", () => {
  assert.deepEqual(readCondition({ status: { isShaken: true, isStunned: false }, wounds: { value: 2 } }), st({ shaken: true, wounds: 2 }));
  assert.deepEqual(readCondition({}), st());
  assert.deepEqual(readCondition(null), st());
});

test("dump réel (16/11/2026) : personnage Secoué par effet de statut", () => {
  const sys = { status: { isShaken: true, isDistracted: false, isVulnerable: false, isStunned: false,
    isEntangled: false, isBound: false, isIncapacitated: false }, wounds: { value: 0, max: 0, ignored: 0 } };
  assert.deepEqual(readCondition(sys), { shaken: true, stunned: false, wounds: 0 });
  assert.equal(statusTrigger(["shaken"]), "Secoué");
});
