import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;
const cb = (id) => world.combatants.find((c) => c.id === id);
const unit = (id) => world.combat.flags["swade-chase"].units[id] ?? {};
const rollsOf = (name) => stubs.updates.filter((u) => u.doc === "roll" && u.name === name);

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.combatant = cb("cEd");                // ce n'est pas encore le tour de Janar (10♣)
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 }, units: {} } };
  mods = {
    flow: await import("../../scripts/services/complication-flow.js"),
    chase: await import("../../scripts/services/chase.js"),
    socket: await import("../../scripts/services/socket.js"),
    panel: await import("../../scripts/apps/chase-panel.js")
  };
});

test("pas de Complication tant que ce n'est pas le tour du participant", async () => {
  await mods.flow.startComplicationGM(world.combat);
  assert.equal(unit("cJa").complication, undefined);
  assert.equal(stubs.created.length, 0);
});

test("début du tour de Janar : Complication ouverte, message d'annonce sans boutons, jet proposé", async () => {
  world.combat.combatant = cb("cJa");
  await mods.flow.startComplicationGM(world.combat);
  const c = unit("cJa").complication;
  assert.equal(c.round, 1);
  assert.equal(c.state, "pending");
  assert.equal(c.suit, "spades");                    // Janar sur le 4♠
  const msg = stubs.created.at(-1);
  assert.match(msg.content, /Complication/);
  assert.doesNotMatch(msg.content, /data-sc=/);      // simple message, pas de boutons
  assert.equal(rollsOf("Janar").length, 1);          // jet ouvert automatiquement chez son joueur
});

test("tant que la Complication n'est pas résolue, aucune action n'est possible", () => {
  const view = mods.chase.computeChaseView(world.combat);
  const playable = mods.chase.actionsFor(view, "cJa").filter((a) => a.available);
  assert.deepEqual(playable, []);
});

test("panneau : bloc Complication avec modificateur, conséquence et boutons", async () => {
  const app = new mods.panel.ChasePanel();
  const ctx = await app._prepareContext();
  assert.equal(ctx.unit.name, "Janar");
  assert.ok(ctx.unit.complicationBlock);
  assert.equal(ctx.unit.complicationBlock.suitLabel, "Pique");
  assert.match(ctx.unit.complicationBlock.failureText, /Échec critique/);
});

test("une seule Complication par round", async () => {
  const n = stubs.created.length;
  await mods.flow.startComplicationGM(world.combat);
  assert.equal(stubs.created.length, n);
});

test("Échec : conséquence appliquée (dé impair à pied → Fatigue), résultat dans le chat, actions débloquées", async () => {
  globalThis.__rollTotal = 3;
  await mods.socket.asGM("unitComplicationResolve", { combatId: "combat1", combatantId: "cJa", outcome: "failure" });
  assert.equal(cb("cJa").actor.system.fatigue.value, 1);
  const c = unit("cJa").complication;
  assert.equal(c.state, "resolved");
  assert.match(stubs.created.at(-1).content, /Fatigue appliquée/);
  const view = mods.chase.computeChaseView(world.combat);
  assert.ok(mods.chase.actionsFor(view, "cJa").some((a) => a.available));
});

test("jeton hors piste : enseigne demandée (choix du MJ ou du joueur), puis jet", async () => {
  const kapla = cb("cKa");
  kapla.system = { cardValue: 4, suitValue: 1, hasJoker: false, cardString: "4♣" };
  world.combat.combatant = kapla;
  world.combat.round = 2;
  await mods.flow.startComplicationGM(world.combat);
  assert.equal(unit("cKa").complication.suit, null);
  await mods.socket.asGM("unitComplicationPatch", { combatId: "combat1", combatantId: "cKa", patch: { suit: "diamonds" } });
  assert.equal(unit("cKa").complication.suit, "diamonds");
});
