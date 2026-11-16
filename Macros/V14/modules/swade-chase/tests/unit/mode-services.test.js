import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;
const cb = (id) => world.combatants.find((c) => c.id === id);
const unitOf = (id) => mods.state.getUnit(world.combat, cb(id));

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 }, units: {} } };
  game.modules.set("swade-vehicle", { id: "swade-vehicle", active: true, api: {
    getManeuverSkill: (a) => (a.name === "Goblin" ? { key: "Piloting", label: "Pilotage" } : null)
  } });
  mods = {
    state: await import("../../scripts/services/state.js"),
    socket: await import("../../scripts/services/socket.js"),
    panel: await import("../../scripts/apps/chase-panel.js")
  };
});

test("par défaut : mode automatique — personnage sans monture à pied", () => {
  const u = unitOf("cJa");
  assert.equal(u.modeSetting, "auto");
  assert.equal(u.mode, "foot");
});

test("véhicule : mode déduit de swade-vehicle (Pilotage → avion / vaisseau)", () => {
  cb("cG1").actor.type = "vehicle";
  assert.equal(unitOf("cG1").mode, "air");
  cb("cG1").actor.type = "character";
});

test("monture associée : le personnage passe automatiquement en Monté", async () => {
  await mods.socket.asGM("setUnit", { combatId: "combat1", combatantId: "cJa", patch: { mountTokenId: "tHorse" } });
  assert.equal(unitOf("cJa").mode, "mounted");
});

test("le MJ peut forcer un mode, puis revenir en automatique", async () => {
  await mods.socket.asGM("setUnit", { combatId: "combat1", combatantId: "cJa", patch: { mode: "foot" } });
  assert.equal(unitOf("cJa").mode, "foot");
  assert.equal(unitOf("cJa").modeSetting, "foot");
  await mods.socket.asGM("setUnit", { combatId: "combat1", combatantId: "cJa", patch: { mode: "auto" } });
  assert.equal(unitOf("cJa").mode, "mounted");
});

test("panneau : choix « Automatique » avec le mode déduit, monture proposable à tout personnage", async () => {
  await mods.socket.asGM("setUnit", { combatId: "combat1", combatantId: "cEd", patch: { mode: "auto" } });
  const app = new mods.panel.ChasePanel();
  app.selectedId = "cEd";
  app.lastTurnKey = `combat1:${world.combat.round}:${world.combat.combatant.id}`;
  const ctx = await app._prepareContext();
  assert.equal(ctx.unit.name, "Edrin \"Ed\"");
  const auto = ctx.unit.modes.find((m) => m.value === "auto");
  assert.ok(auto.selected);
  assert.match(auto.label, /Automatique.*pied/i);
  assert.ok(ctx.unit.mounts.some((m) => m.value === "tHorse"));
});
