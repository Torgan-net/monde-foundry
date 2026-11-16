import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;
const tokenOf = (id) => world.combatants.find((c) => c.id === id).token;
const lastTokenUpdate = (tid) => stubs.updates.filter((u) => u.doc === "token" && u.id === tid).at(-1);

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  world.combat.flags = { "swade-chase": { chase: { active: true, type: "ground", interval: 5 },
    units: { cKa: { status: "out" } } } };
  mods = {
    move: await import("../../scripts/services/movement.js"),
    chase: await import("../../scripts/services/chase.js"),
    handlers: await import("../../scripts/services/handlers.js"),
    card: await import("../../scripts/services/complication-card.js"),
    socket: await import("../../scripts/services/socket.js")
  };
});

test("déplacement d'une carte vers l'avant : le jeton garde son décalage au-dessus de la carte", async () => {
  await mods.socket.asGM("moveUnit", { combatId: "combat1", combatantId: "cJa", steps: 1, why: "test" });
  assert.deepEqual(lastTokenUpdate("t6").patch, { x: 3817, y: 1120 });   // 4♠ → 7♣ (+325,6 ; −60,8)
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(view.units.get("cJa").loc.index, 8);
  assert.match(stubs.created.at(-1).content, /7♣/);
});

test("piste trop courte : le jeton s'arrête au bout et le MJ est prié d'ajouter des cartes", async () => {
  const before = stubs.updates.filter((u) => u.doc === "token" && u.id === "t6").length;
  await mods.socket.asGM("moveUnit", { combatId: "combat1", combatantId: "cJa", steps: 2, why: "test" });
  assert.equal(stubs.updates.filter((u) => u.doc === "token" && u.id === "t6").length, before);  // déjà sur la dernière carte
  const msg = stubs.created.at(-1);
  assert.match(msg.content, /ajoutez 2 cartes/i);
  assert.ok(msg.whisper?.length, "message réservé au MJ");
});

test("un joueur ne déplace pas le jeton d'un autre", async () => {
  game.user.isGM = false;
  const n = stubs.updates.filter((u) => u.doc === "token").length;
  const gob = world.combatants.find((c) => c.id === "cG1");
  gob.actor.testUserPermission = () => false;
  await mods.socket.asGM("moveUnit", { combatId: "combat1", combatantId: "cG1", steps: 1, why: "test" });
  assert.equal(stubs.updates.filter((u) => u.doc === "token").length, n);
  game.user.isGM = true;
});

test("Changer de position : après le jet, le joueur choisit le déplacement (Prouesse → jusqu'à 2)", async () => {
  // Edrin (7♣, dernière carte) : on recule de 2
  globalThis.__dialogQueue = ["m-2"];
  await mods.handlers.runActionRoll(world.combat, "cEd", "changePosition", "free", { speedBonus: 0 });
  const dlg = globalThis.__lastDialog;
  assert.ok(dlg.buttons.some((b) => b.action === "m-2"));
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(view.units.get("cEd").loc.index, 6);
});

test("Lever le pied : recul de 1 ou 2 cartes, sans « avant »", async () => {
  globalThis.__dialogQueue = ["m-1"];
  await mods.handlers.runActionApply(world.combat, "cG4", "liftFoot", "liftFoot");
  const dlg = globalThis.__lastDialog;
  assert.deepEqual(dlg.buttons.map((b) => b.action), ["m-1", "m-2"]);
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(view.units.get("cG4").loc.index, 4);   // 2♣ → 9♣
});

test("Complication échouée sur un cœur : le MJ choisit la direction du Bousculé", async () => {
  // Gobelin sur 2♥ (index 1)
  const gob = world.combatants.find((c) => c.id === "cG3");
  const msg = await ChatMessage.create({ content: "", flags: { "swade-chase": { complication: {
    combatId: "combat1", combatantId: "cG3", round: 1, name: "Goblin", actionLabel: "5♣",
    mode: "foot", suit: "hearts", cityStreets: false, rooftops: false, state: "pending" } } } });
  globalThis.__dialogQueue = ["m1"];
  await mods.card.resolveComplication({ messageId: msg.id, outcome: "failure" }, game.user);
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(view.units.get("cG3").loc.index, 2);
  assert.match(msg.content, /Bousculé/);
  void gob;
});

test("Fuir réussi : confirmation du MJ, puis hors poursuite", async () => {
  // Janar est sur la dernière carte, le gobelin le plus proche à 4 cartes : Fuir à −4
  const view = mods.chase.computeChaseView(world.combat);
  const flee = mods.chase.actionsFor(view, "cJa").find((a) => a.id === "flee");
  assert.equal(flee.available, true);
  assert.deepEqual(flee.rolls[0].mods.map((m) => m.value), [-4]);
  globalThis.__dialogQueue = ["success"];
  await mods.handlers.runActionRoll(world.combat, "cJa", "flee", "roll");
  assert.equal(world.combat.flags["swade-chase"].units.cJa.status, "out");
  assert.match(stubs.created.find((m) => /s'échappe/.test(m.content)).content, /hors poursuite/);
});

test("Fuir raté : l'unité reste dans la poursuite", async () => {
  world.combat.flags["swade-chase"].units.cJa = { status: "in" };
  globalThis.__dialogQueue = ["failure"];
  await mods.handlers.runActionRoll(world.combat, "cJa", "flee", "roll");
  assert.equal(world.combat.flags["swade-chase"].units.cJa.status, "in");
});

test("Lever le pied : compte comme une action ; annulé, rien n'est compté", async () => {
  world.combat.flags["swade-chase"].units.cG2 = {};
  globalThis.__dialogQueue = [null];                     // fenêtre fermée
  await mods.handlers.runActionApply(world.combat, "cG2", "liftFoot", "liftFoot");
  assert.equal(world.combat.flags["swade-chase"].units.cG2.turn, undefined);
  globalThis.__dialogQueue = ["m-1"];
  await mods.handlers.runActionApply(world.combat, "cG2", "liftFoot", "liftFoot");
  assert.deepEqual(world.combat.flags["swade-chase"].units.cG2.turn.standard, ["liftFoot"]);
});
