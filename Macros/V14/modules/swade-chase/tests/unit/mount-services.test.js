import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;
const cb = (id) => world.combatants.find((c) => c.id === id);
const units = () => world.combat.flags["swade-chase"].units;

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 }, units: {} } };
  mods = {
    chase: await import("../../scripts/services/chase.js"),
    socket: await import("../../scripts/services/socket.js"),
    card: await import("../../scripts/services/complication-card.js"),
    rolls: await import("../../scripts/services/rolls.js"),
    watch: await import("../../scripts/services/damage-watch.js"),
    panel: await import("../../scripts/apps/chase-panel.js")
  };
});

test("le MJ associe une monture à un cavalier (jeton de la scène)", async () => {
  await mods.socket.asGM("setUnit", { combatId: "combat1", combatantId: "cJa", patch: { mode: "mounted", mountTokenId: "tHorse" } });
  assert.equal(units().cJa.mountTokenId, "tHorse");
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(view.units.get("cJa").mount?.name, "Cheval");
});

test("le panneau du MJ propose les jetons de la scène comme monture (sauf le cavalier)", async () => {
  const app = new mods.panel.ChasePanel();
  const ctx = await app._prepareContext();
  assert.equal(ctx.unit.name, "Janar");
  const ids = ctx.unit.mounts.map((m) => m.value);
  assert.ok(ids.includes("tHorse"));
  assert.ok(!ids.includes("t6"));
  assert.equal(ctx.unit.mounts.find((m) => m.value === "tHorse").selected, true);
});

test("bonus de vitesse d'un cavalier : Allure de sa monture contre celle des assaillants", () => {
  for (const c of world.combatants) c.actor.system.pace = { default: 6 };
  const view = mods.chase.computeChaseView(world.combat);
  assert.deepEqual(mods.chase.autoSpeedFor(view, "cJa"), { bonus: 2, mine: 12, fastest: 6, kind: "pace" });
});

test("Fatigue de la monture : malus ajouté aux jets de Manœuvre du cavalier", async () => {
  world.horse.system.fatigue.value = 1;
  await mods.rolls.rollManeuver(cb("cJa"), "mounted", [], "test");
  const roll = stubs.updates.filter((u) => u.doc === "roll" && u.name === "Janar").at(-1);
  assert.ok(roll.opts.additionalMods.some((m) => m.value === -1 && /monture/.test(m.label)));
  world.horse.system.fatigue.value = 0;
});

test("Échec critique monté (3-4) : la Fatigue s'applique à la monture", async () => {
  const msg = await ChatMessage.create({ content: "", flags: { "swade-chase": { complication: {
    combatId: "combat1", combatantId: "cJa", round: 1, name: "Janar", actionLabel: "3♣",
    mode: "mounted", suit: "spades", cityStreets: false, rooftops: false, state: "pending" } } } });
  globalThis.__rollTotal = 4;
  await mods.card.resolveComplication({ messageId: msg.id, outcome: "failure" }, game.user);
  assert.equal(world.horse.system.fatigue.value, 1);
  assert.equal(cb("cJa").actor.system.fatigue.value, 0);
  assert.match(msg.content, /monture.*1 \/ 2/i);
});

test("monture Secouée : le cavalier est Bousculé", async () => {
  globalThis.__dialogQueue = ["m1"];
  const before = mods.chase.computeChaseView(world.combat).units.get("cJa").loc.index;
  Hooks.callAll("createActiveEffect", { parent: world.horse, statuses: new Set(["shaken"]) }, {}, game.user.id);
  await mods.watch.settled();
  assert.equal(mods.chase.computeChaseView(world.combat).units.get("cJa").loc.index, before + 1);
  assert.match(globalThis.__lastDialog.content, /monture/);
});
