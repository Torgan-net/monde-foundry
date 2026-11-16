import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;
const cb = (id) => world.combatants.find((c) => c.id === id);
const idx = (id) => mods.chase.computeChaseView(world.combat).units.get(id).loc.index;
const dialogs = () => globalThis.__dialogCount ?? 0;

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 }, units: {} } };
  mods = {
    chase: await import("../../scripts/services/chase.js"),
    watch: await import("../../scripts/services/damage-watch.js"),
    card: await import("../../scripts/services/complication-card.js")
  };
  const { DialogV2 } = foundry.applications.api;
  const wait = DialogV2.wait;
  DialogV2.wait = async (o) => { globalThis.__dialogCount = dialogs() + 1; return wait(o); };
});

test("Janar Blessé (mise à jour des Blessures) : Bousculé, le MJ choisit la direction", async () => {
  globalThis.__dialogQueue = ["m-1"];
  const janar = cb("cJa").actor;
  Hooks.callAll("preUpdateActor", janar, { system: { wounds: { value: 1 } } }, {}, game.user.id);
  await mods.watch.settled();
  assert.equal(idx("cJa"), 6);                              // 4♠ → A♣
  assert.match(globalThis.__lastDialog.content, /Blessé/);
  assert.ok(globalThis.__lastDialog.buttons.some((b) => b.action === "m0"), "option « ne pas Bousculer »");
});

test("Edrin Secoué (effet de statut posé par ce client) : Bousculé", async () => {
  globalThis.__dialogQueue = ["m-1"];
  const before = idx("cEd");
  Hooks.callAll("createActiveEffect", { parent: cb("cEd").actor, statuses: new Set(["shaken"]) }, {}, game.user.id);
  await mods.watch.settled();
  assert.equal(idx("cEd"), before - 1);
});

test("effet posé par un autre client : ignoré ici (pas de doublon)", async () => {
  const n = dialogs();
  Hooks.callAll("createActiveEffect", { parent: cb("cEd").actor, statuses: new Set(["stunned"]) }, {}, "autre");
  await mods.watch.settled();
  assert.equal(dialogs(), n);
});

test("Blessure et Secoué pour le même coup : une seule fenêtre", async () => {
  const n = dialogs();
  globalThis.__dialogQueue = ["m0", "m0"];
  const gob = cb("cG2").actor;
  Hooks.callAll("preUpdateActor", gob, { system: { wounds: { value: 1 } } }, {}, game.user.id);
  Hooks.callAll("createActiveEffect", { parent: gob, statuses: new Set(["shaken"]) }, {}, game.user.id);
  await mods.watch.settled();
  assert.equal(dialogs(), n + 1);
});

test("unité hors poursuite : pas de Bousculé", async () => {
  world.combat.flags["swade-chase"].units.cKa = { status: "out" };
  const n = dialogs();
  Hooks.callAll("preUpdateActor", cb("cKa").actor, { system: { wounds: { value: 1 } } }, {}, game.user.id);
  await mods.watch.settled();
  assert.equal(dialogs(), n);
});

test("véhicule touché : Bousculé + message de jet de contrôle ; Échec → Perte de contrôle (swade-vehicle)", async () => {
  const calls = [];
  game.modules.set("swade-vehicle", { id: "swade-vehicle", active: true, api: {
    rollManeuver: async () => ({ total: 6 }),
    applyOutOfControl: async (a) => { calls.push(a.name); return 7; }
  } });
  const g4 = cb("cG4");
  g4.actor.type = "vehicle";
  globalThis.__dialogQueue = ["m1"];
  Hooks.callAll("preUpdateActor", g4.actor, { system: { wounds: { value: 1 } } }, {}, game.user.id);
  await mods.watch.settled();
  const msg = stubs.created.find((m) => m.flags?.["swade-chase"]?.complication?.kind === "control");
  assert.ok(msg, "message de jet de contrôle");
  assert.match(msg.content, /Perte de contrôle/);
  await mods.card.resolveComplication({ messageId: msg.id, outcome: "failure" }, game.user);
  assert.deepEqual(calls, ["Goblin"]);
  assert.match(msg.content, /Pertes de contrôle tirée \(7\)/);
  g4.actor.type = "character";
});
