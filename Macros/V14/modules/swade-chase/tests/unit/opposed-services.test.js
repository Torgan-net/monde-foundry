import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;
const cb = (id) => world.combatants.find((c) => c.id === id);
const idx = (id) => mods.chase.computeChaseView(world.combat).units.get(id).loc.index;
const lastOpposed = () => stubs.created.filter((m) => m.flags?.["swade-chase"]?.complication?.kind === "opposed").at(-1);
const unitFlags = (id) => world.combat.flags["swade-chase"].units[id] ?? {};

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 }, units: {} } };
  // Edrin rejoint les deux gobelins du 9♣ (index 4)
  Object.assign(cb("cEd").token, { x: 2470, y: 1400 });
  mods = {
    chase: await import("../../scripts/services/chase.js"),
    handlers: await import("../../scripts/services/handlers.js"),
    opp: await import("../../scripts/services/opposed-card.js")
  };
});

test("Repousser : choix de la cible sur la même carte, jet de l'attaquant, message de jet opposé", async () => {
  assert.equal(idx("cEd"), 4);
  globalThis.__dialogQueue = ["t:cG1"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "push", "roll");
  assert.deepEqual(globalThis.__lastDialog.buttons.map((b) => b.action).sort(), ["t:cG1", "t:cG2"]);
  const msg = lastOpposed();
  const d = msg.flags["swade-chase"].complication;
  assert.equal(d.action, "push");
  assert.equal(d.defenderId, "cG1");
  assert.deepEqual(d.attackerRoll, { total: 2, isCritfail: false });
  assert.match(msg.content, /Repousser/);
});

test("jet du défenseur : résultat comparé et proposé (2 contre 2 → le défenseur l'emporte)", async () => {
  const msg = lastOpposed();
  await mods.opp.rollDefender(msg.id);
  const d = msg.flags["swade-chase"].complication;
  assert.deepEqual(d.defenderRoll, { total: 2, isCritfail: false });
  assert.equal(d.suggested, "lose");
});

test("Prouesse de l'attaquant : défenseur Bousculé (direction au choix de l'attaquant) + Échec critique de Manœuvre", async () => {
  const msg = lastOpposed();
  globalThis.__dialogQueue = ["m1"];
  globalThis.__rollTotal = 3;                     // dé impair à pied → Fatigue
  await mods.opp.resolveOpposed({ messageId: msg.id, outcome: "raise" }, game.user);
  assert.equal(idx("cG1"), 5);
  assert.equal(cb("cG1").actor.system.fatigue.value, 1);
  assert.equal(msg.flags["swade-chase"].complication.state, "resolved");
  assert.match(msg.content, /Bousculé/);
  assert.match(msg.content, /Échec critique/);
});

test("Échec critique de l'attaquant : la manœuvre se retourne contre lui (il est Bousculé)", async () => {
  world.combat.flags["swade-chase"].units.cEd.turn = null;      // nouveau tour pour Edrin
  globalThis.__dialogQueue = ["t:cG2"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "push", "roll");
  const msg = lastOpposed();
  globalThis.__dialogQueue = ["m-1"];
  await mods.opp.resolveOpposed({ messageId: msg.id, outcome: "critfail" }, game.user);
  assert.equal(idx("cEd"), 3);
});

test("Aborder (navires) : victoire → vaisseau abordé, défenseurs En attente ; le commandant ne peut que Changer de position à −4", async () => {
  // Edrin et le gobelin 2 en bateau, sur la même carte
  Object.assign(cb("cEd").token, { x: 2470, y: 1400 });
  world.combat.flags["swade-chase"].units.cEd = { mode: "boat" };
  world.combat.flags["swade-chase"].units.cG2 = { mode: "boat" };
  await mods.handlers.runActionRoll(world.combat, "cEd", "board", "roll");   // une seule cible : pas de choix
  const msg = lastOpposed();
  await mods.opp.resolveOpposed({ messageId: msg.id, outcome: "win" }, game.user);
  assert.deepEqual(unitFlags("cG2").boardedBy, { id: "cEd", name: "Edrin \"Ed\"" });
  assert.match(msg.content, /En attente/);
  const cp = mods.chase.actionsFor(mods.chase.computeChaseView(world.combat), "cG2").find((a) => a.id === "changePosition");
  assert.ok(cp.rolls[0].mods.some((m) => m.value === -4));
});

test("commandant abordé : Changer de position réussi avec Prouesse → libéré et déplacé d'une carte", async () => {
  const before = idx("cG2");
  globalThis.__dialogQueue = ["raise", "m1"];
  await mods.handlers.runActionRoll(world.combat, "cG2", "changePosition", "free");
  assert.equal(unitFlags("cG2").boardedBy, null);
  assert.equal(idx("cG2"), before + 1);
});

test("Éperonner réussi : dégâts mutuels annoncés", async () => {
  world.combat.flags["swade-chase"].units.cEd = { mode: "foot" };
  world.combat.flags["swade-chase"].units.cG2 = { mode: "foot" };
  Object.assign(cb("cG2").token, { x: 2452, y: 1570 });
  Object.assign(cb("cEd").token, { x: 2470, y: 1400 });
  globalThis.__dialogQueue = ["t:cG2"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "ram", "roll");
  const msg = lastOpposed();
  await mods.opp.resolveOpposed({ messageId: msg.id, outcome: "win" }, game.user);
  assert.match(msg.content, /dégâts/i);
  // Normal contre Normal, sans Vitesse : 2d6 de chaque côté
  assert.match(msg.content, /Edrin &quot;Ed&quot; inflige <strong>2d6<\/strong>/);
  assert.match(msg.content, /Goblin inflige <strong>2d6<\/strong>/);
});

test("Éperonner avec Prouesse, Échelle et Résistance : dés lancés pour chacun", async () => {
  world.combat.flags["swade-chase"].units.cEd = { mode: "foot" };
  cb("cEd").actor.system.stats = { scale: 2, size: 4, toughness: { value: 12 } };
  cb("cG2").actor.system.stats = { scale: 0, size: 0, toughness: { value: 5 } };
  globalThis.__dialogQueue = ["t:cG2"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "ram", "roll");
  const msg = lastOpposed();
  const rolled = [];
  const R = globalThis.Roll;
  globalThis.Roll = class extends R { constructor(f) { super(f); rolled.push(f); } };
  await mods.opp.resolveOpposed({ messageId: msg.id, outcome: "raise" }, game.user);
  globalThis.Roll = R;
  // Edrin : Grand 3 + Prouesse 1 + Résistance double 2 = 6d6 ; gobelin : Normal 2d6
  assert.deepEqual(rolled, ["6d6", "2d6"]);
  assert.match(msg.content, /6d6/);
});

test("Bousculer : un même assaillant ne Bouscule une cible qu'une fois par tour", async () => {
  // Edrin et le gobelin 2 sur la même carte, 3 actions prévues
  world.combat.flags["swade-chase"].units.cEd = { mode: "foot", turn: { round: world.combat.round, planned: 3, standard: [], free: null } };
  world.combat.flags["swade-chase"].units.cG2 = { mode: "foot" };
  Object.assign(cb("cG2").token, { x: 2452, y: 1570 });
  Object.assign(cb("cEd").token, { x: 2470, y: 1400 });
  globalThis.__dialogQueue = ["t:cG2", "m1"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "push", "roll");
  await mods.opp.resolveOpposed({ messageId: lastOpposed().id, outcome: "win" }, game.user);
  const after1 = idx("cG2");
  // second Repousser réussi, toujours sur la même carte ? On replace le gobelin à côté d'Edrin
  Object.assign(cb("cG2").token, { x: 2452, y: 1570 });
  globalThis.__dialogQueue = ["t:cG2"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "push", "roll");
  const msg = lastOpposed();
  const before = stubs.updates.filter((u) => u.doc === "token" && u.id === "t2").length;
  await mods.opp.resolveOpposed({ messageId: msg.id, outcome: "win" }, game.user);
  assert.equal(stubs.updates.filter((u) => u.doc === "token" && u.id === "t2").length, before);   // pas de second déplacement
  assert.match(msg.content, /déjà été Bousculé/);
  void after1;
});
