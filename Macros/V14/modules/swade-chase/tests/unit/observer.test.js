import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: false });
let world, mods;
const cb = (id) => world.combatants.find((c) => c.id === id);
// Droits : propriétaire de Janar, observateur d'Edrin, rien sur les autres.
const perms = { cJa: "OWNER", cEd: "OBSERVER" };
const LEVEL = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 }, units: {} } };
  for (const c of world.combatants) {
    const lvl = LEVEL[perms[c.id] ?? "NONE"];
    c.actor.testUserPermission = (u, p) => lvl >= LEVEL[p];
    c.actor.isOwner = lvl >= LEVEL.OWNER;
  }
  mods = { panel: await import("../../scripts/apps/chase-panel.js"), socket: await import("../../scripts/services/socket.js") };
});

test("observateur : le participant apparaît dans le panneau, en lecture seule", async () => {
  const app = new mods.panel.ChasePanel();
  const ctx = await app._prepareContext();
  assert.deepEqual(ctx.units.map((u) => u.id).sort(), ["cEd", "cJa"]);   // pas les gobelins
  app.selectedId = "cEd";
  app.lastTurnKey = `combat1:${world.combat.round}:${world.combat.combatant.id}`;
  const c2 = await app._prepareContext();
  assert.equal(c2.unit.name, "Edrin \"Ed\"");
  assert.equal(c2.unit.canAct, false);
  assert.equal(c2.unit.readOnly, true);
  assert.ok(c2.turn.options.every((o) => o.disabled));
  assert.ok(c2.tabs.flatMap((t) => t.actions).every((a) => !a.canAct));
});

test("propriétaire : le participant reste jouable", async () => {
  const app = new mods.panel.ChasePanel();
  const ctx = await app._prepareContext();
  assert.equal(ctx.unit.name, "Janar");
  assert.equal(ctx.unit.canAct, true);
  assert.equal(ctx.unit.readOnly, false);
});

test("observateur : aucune écriture acceptée par le MJ pour ce participant", () => {
  assert.equal(mods.socket.canControl(game.user, cb("cEd")), false);
  assert.equal(mods.socket.canObserve(game.user, cb("cEd")), true);
  assert.equal(mods.socket.canObserve(game.user, cb("cG1")), false);
});
