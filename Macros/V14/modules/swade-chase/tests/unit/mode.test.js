import { test } from "node:test";
import assert from "node:assert/strict";
import { deduceMode } from "../../scripts/rules/mode.js";

test("véhicule : sous-type d'après sa compétence de manœuvre (swade-vehicle)", () => {
  assert.equal(deduceMode({ isVehicle: true, vehicleSkill: "Piloting" }), "air");
  assert.equal(deduceMode({ isVehicle: true, vehicleSkill: "Pilotage" }), "air");
  assert.equal(deduceMode({ isVehicle: true, vehicleSkill: "Boating" }), "boat");
  assert.equal(deduceMode({ isVehicle: true, vehicleSkill: "Navigation" }), "boat");
  assert.equal(deduceMode({ isVehicle: true, vehicleSkill: "Driving" }), "vehicle");
  assert.equal(deduceMode({ isVehicle: true, vehicleSkill: "Riding" }), "mounted");   // chariot tiré par des bêtes
  assert.equal(deduceMode({ isVehicle: true }), "vehicle");                          // compétence inconnue
});

test("personnage : monté s'il a une monture associée, sinon à pied", () => {
  assert.equal(deduceMode({ isVehicle: false, hasMount: true }), "mounted");
  assert.equal(deduceMode({ isVehicle: false, hasMount: false }), "foot");
  assert.equal(deduceMode({}), "foot");
});
