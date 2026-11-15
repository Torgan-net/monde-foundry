import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeCombat, makeCombatant } from "../helpers/foundry-stubs.js";
import { WRITE_FLAG } from "../../scripts/constants.js";

// Test de fumée : main.js se charge avec les faux objets et enregistre ses hooks
const hooks = installFoundryStubs();
await import("../../scripts/main.js");

const handler = (kind, name) => hooks[kind].find((h) => h.name === name)?.fn;

test("main.js enregistre les hooks attendus", () => {
  for (const name of ["createCombatantGroup", "updateCombatantGroup", "createCombatant", "updateCombatant"]) {
    assert.ok(handler("on", name), `hook ${name} manquant`);
  }
  assert.ok(handler("once", "init"));
  assert.ok(handler("once", "ready"));
});

test("ready : expose l'API et l'annonce", () => {
  handler("once", "ready")();
  const api = game.modules.get("swade-tweaks").api;
  assert.equal(api.version, 1);
  assert.equal(typeof api.syncGroup, "function");
  assert.ok(hooks.callAll.some((c) => c.name === "swade-tweaks.ready"));
});

function setup() {
  const elharn = makeCombatant({ id: "c1", name: "Elharn", img: "e.png", group: "g1" });
  const combat = makeCombat({ combatants: [elharn], groups: [{ id: "g1", name: "Groupe de combattants", leader: "c1" }] });
  return { elharn, group: combat.groups.get("g1") };
}

test("updateCombatantGroup : réagit au changement de meneur", async () => {
  const { group } = setup();
  await handler("on", "updateCombatantGroup")(group, { system: { leader: "c1" } }, {});
  assert.equal(group.writes.length, 1);
});

test("updateCombatantGroup : ignore ses propres écritures et les autres changements", async () => {
  const { group } = setup();
  await handler("on", "updateCombatantGroup")(group, { system: { leader: "c1" } }, { [WRITE_FLAG]: true });
  await handler("on", "updateCombatantGroup")(group, { name: "X" }, {});
  assert.equal(group.writes.length, 0);
});

test("createCombatant : un combattant entré directement dans un groupe le synchronise", async () => {
  const { elharn, group } = setup();
  await handler("on", "createCombatant")(elharn, {});
  assert.equal(group.writes.length, 1);
});

test("updateCombatant : ignoré si ni groupe, ni nom, ni image ne changent", async () => {
  const { elharn, group } = setup();
  await handler("on", "updateCombatant")(elharn, { initiative: 12 }, {});
  assert.equal(group.writes.length, 0);
  await handler("on", "updateCombatant")(elharn, { name: "Elharn" }, {});
  assert.equal(group.writes.length, 1);
});
