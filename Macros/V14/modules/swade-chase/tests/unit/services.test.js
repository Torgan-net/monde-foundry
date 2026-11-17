import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let world, mods;

before(async () => {
  await import("../../scripts/main.js");             // test de fumée : chargement complet
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  mods = {
    reader: await import("../../scripts/services/track-reader.js"),
    chase: await import("../../scripts/services/chase.js"),
    watchers: await import("../../scripts/services/watchers.js"),
    card: await import("../../scripts/services/complication-card.js"),
    handlers: await import("../../scripts/services/handlers.js"),
    panel: await import("../../scripts/apps/chase-panel.js")
  };
});

test("l'API est publiée au chargement", () => {
  const api = game.modules.get("swade-chase").api;
  assert.equal(api.version, 1);
  assert.equal(typeof api.open, "function");
});

test("lecture de la piste CCM : 9 cartes à enseigne de la scène courante", () => {
  const track = mods.reader.readSceneTrack(world.scene);
  assert.equal(track.length, 9);
  assert.equal(track[0].suit, "clubs");
  assert.equal(track[7].suit, "spades");
});

test("démarrer la poursuite : Kapla hors piste → question au MJ, puis Complication de Janar (son tour)", async () => {
  globalThis.__dialogAnswer = "support";
  await mods.handlers.startChase(world.combat);
  const units = world.combat.flags["swade-chase"].units;
  assert.equal(world.combat.flags["swade-chase"].chase.active, true);
  assert.equal(units.cKa.status, "support");
  assert.equal(units.cKa.offTrackAck, "4007,1270");
  assert.equal(units.cJa.complication.state, "pending");
  assert.equal(units.cJa.complication.suit, "spades");       // Janar est sur le 4♠
  const msg = stubs.created.find((m) => /Complication : Janar/.test(m.content));
  assert.ok(msg, "annonce dans le chat");
});

test("Janar a la main : le jet de Complication s'ouvre automatiquement, une seule fois", async () => {
  assert.equal(stubs.updates.filter((u) => u.doc === "roll" && u.name === "Janar").length, 1);
  const { startComplicationGM } = await import("../../scripts/services/complication-flow.js");
  await startComplicationGM(world.combat);
  assert.equal(stubs.updates.filter((u) => u.doc === "roll" && u.name === "Janar").length, 1);
});

test("pas de seconde Complication pour le même round", async () => {
  const before = stubs.created.length;
  await mods.watchers.checkComplications(world.combat);
  assert.equal(stubs.created.length, before);
});

test("une unité déjà traitée n'est pas redemandée tant que son jeton ne bouge pas", async () => {
  globalThis.__dialogAnswer = "out";
  await mods.watchers.checkOffTrack(world.combat);
  assert.equal(world.combat.flags["swade-chase"].units.cKa.status, "support");
});

test("actions de Janar : écarts calculés, Fuir impossible", () => {
  const view = mods.chase.computeChaseView(world.combat);
  const opp = mods.chase.opponentsOf(view, "cJa").map((o) => o.gap).sort((a, b) => a - b);
  assert.deepEqual(opp, [2, 3, 3, 6]);              // gobelins sur 2♣, 9♣, 9♣, 2♥
  const flee = mods.chase.actionsFor(view, "cJa").find((a) => a.id === "flee");
  assert.equal(flee.available, false);
});

test("Kapla en soutien : seuls Soutien et Épreuve", () => {
  const view = mods.chase.computeChaseView(world.combat);
  const ok = mods.chase.actionsFor(view, "cKa").filter((a) => a.available).map((a) => a.id).sort();
  assert.deepEqual(ok, ["support", "test"]);
});

test("Échec de la Complication sur un pique, à pied : dé impair → Fatigue appliquée", async () => {
  const { asGM } = await import("../../scripts/services/socket.js");
  globalThis.__rollTotal = 3;
  await asGM("unitComplicationResolve", { combatId: "combat1", combatantId: "cJa", outcome: "failure" });
  const janar = world.combatants.find((c) => c.id === "cJa").actor;
  assert.equal(janar.system.fatigue.value, 1);
  assert.equal(world.combat.flags["swade-chase"].units.cJa.complication.state, "resolved");
  assert.match(stubs.created.at(-1).content, /Fatigue appliquée : 1 \/ 2/);
});

test("une Complication résolue ne se résout pas deux fois", async () => {
  const { asGM } = await import("../../scripts/services/socket.js");
  await asGM("unitComplicationResolve", { combatId: "combat1", combatantId: "cJa", outcome: "failure" });
  const janar = world.combatants.find((c) => c.id === "cJa").actor;
  assert.equal(janar.system.fatigue.value, 1);
});

test("jet d'action : Changer de position en action → +2 et marque du tour", async () => {
  await mods.handlers.runActionRoll(world.combat, "cEd", "changePosition", "action");
  const roll = stubs.updates.filter((u) => u.doc === "roll").at(-1);
  assert.equal(roll.name, "Edrin \"Ed\"");
  assert.deepEqual(roll.opts.additionalMods.map((m) => m.value), [2]);
  assert.equal(world.combat.flags["swade-chase"].units.cEd.marks.changedPosition, 1);
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(mods.chase.actionsFor(view, "cEd").find((a) => a.id === "changePosition").available, false);
});

test("panneau : contexte de Janar (son tour)", async () => {
  const app = new mods.panel.ChasePanel();
  const ctx = await app._prepareContext();
  assert.equal(ctx.active, true);
  assert.equal(ctx.unit.name, "Janar");
  assert.equal(ctx.unit.isTurn, true);
  assert.equal(ctx.unit.actionCard.label, "10♣");
  assert.equal(ctx.unit.chaseCard.label, "4♠");
  assert.equal(ctx.unit.chaseCard.position, 8);
  assert.equal(ctx.unit.complicationBlock, null);           // Complication déjà résolue
  assert.deepEqual(ctx.tabs.map((t) => t.id), ["move", "harass", "defend", "usual", "gm"]);
  assert.equal(ctx.currentTab.id, "move");
  assert.equal(ctx.turn.planned, 1);
});

test("tour d'Edrin : 2 actions prévues → −2 sur ses jets en action, puis plafond", async () => {
  const { asGM } = await import("../../scripts/services/socket.js");
  // Edrin a déjà joué Changer de position (action) plus haut : on ne peut plus descendre sous 1.
  await asGM("setPlanned", { combatId: "combat1", combatantId: "cEd", planned: 2 });
  const view = mods.chase.computeChaseView(world.combat);
  const atk = mods.chase.actionsFor(view, "cEd").find((a) => a.id === "attack");
  assert.equal(atk.available, true);
  await mods.handlers.runActionApply(world.combat, "cEd", "attack", "declare");
  const turn = mods.chase.turnOf(mods.chase.computeChaseView(world.combat), "cEd");
  assert.deepEqual(turn.standard, ["changePosition", "attack"]);
  const after = mods.chase.actionsFor(mods.chase.computeChaseView(world.combat), "cEd");
  assert.equal(after.find((a) => a.id === "ram").available, false);
  assert.match(stubs.created.at(-1).content, /action 2 \/ 2.*−2/);
});

test("on ne peut pas prévoir moins d'actions que celles déjà jouées", async () => {
  const { asGM } = await import("../../scripts/services/socket.js");
  await asGM("setPlanned", { combatId: "combat1", combatantId: "cEd", planned: 1 });
  assert.equal(mods.chase.turnOf(mods.chase.computeChaseView(world.combat), "cEd").planned, 2);
});

test("ouvrir le panneau la première fois ne positionne pas une fenêtre pas encore rendue", () => {
  mods.panel.ChasePanel.instance = null;
  const app = mods.panel.ChasePanel.open();
  assert.equal(app.rendered, true);
  assert.ok(app.lastRenderOptions.position.width <= 460);
});

test("Passer En attente : écrit system.roundHeld, puis l'action n'est plus proposée", async () => {
  await mods.handlers.runActionApply(world.combat, "cEl", "hold", "hold");
  const elharn = world.combatants.find((c) => c.id === "cEl");
  assert.equal(elharn.system.roundHeld, 1);
  const view = mods.chase.computeChaseView(world.combat);
  const hold = mods.chase.actionsFor(view, "cEl").find((a) => a.id === "hold");
  assert.equal(hold.available, false);
});

test("bonus de vitesse automatique entre véhicules (Vitesse max du système)", () => {
  const saved = world.combatants.map((c) => [c.actor.type, c.actor.system.topspeed]);
  try {
    for (const c of world.combatants) { c.actor.type = "vehicle"; c.actor.system.topspeed = "60 km/h"; }
    const edrin = world.combatants.find((c) => c.id === "cEd");
    edrin.actor.system.topspeed = "130 km/h";
    let view = mods.chase.computeChaseView(world.combat);
    assert.deepEqual(mods.chase.autoSpeedFor(view, "cEd"), { bonus: 2, mine: 130, fastest: 60, kind: "kmh" });
    edrin.actor.system.topspeed = "61 km/h";
    view = mods.chase.computeChaseView(world.combat);
    assert.equal(mods.chase.autoSpeedFor(view, "cEd").bonus, 1);
    // le bonus calculé arrive dans les jets de Changer de position…
    const kapla = world.combatants.find((c) => c.id === "cKa");
    const cp = mods.chase.actionsFor(view, "cJa").find((a) => a.id === "changePosition");
    assert.ok(cp);
    // … sauf si une Vitesse manque : pas de calcul
    world.combatants.find((c) => c.id === "cG1").actor.system.topspeed = undefined;
    view = mods.chase.computeChaseView(world.combat);
    assert.equal(mods.chase.autoSpeedFor(view, "cEd"), null);
    void kapla;
  } finally {
    world.combatants.forEach((c, i) => { c.actor.type = saved[i][0]; c.actor.system.topspeed = saved[i][1]; });
  }
});

test("bonus automatique appliqué au jet si le joueur ne l'a pas changé", () => {
  const saved = world.combatants.map((c) => [c.actor.type, c.actor.system.topspeed]);
  try {
    for (const c of world.combatants) { c.actor.type = "vehicle"; c.actor.system.topspeed = "50 km/h"; }
    world.combatants.find((c) => c.id === "cJa").actor.system.topspeed = "80 km/h";
    const view = mods.chase.computeChaseView(world.combat);
    const free = mods.chase.actionsFor(view, "cJa").find((a) => a.id === "changePosition").rolls.find((r) => r.key === "free");
    assert.deepEqual(free.mods.map((m) => m.value), [1]);
    const manual = mods.chase.actionsFor(view, "cJa", { speedBonus: 0 }).find((a) => a.id === "changePosition").rolls.find((r) => r.key === "free");
    assert.deepEqual(manual.mods, []);
  } finally {
    world.combatants.forEach((c, i) => { c.actor.type = saved[i][0]; c.actor.system.topspeed = saved[i][1]; });
  }
});

test("Allure d'un personnage : lue dans les champs connus du système", async () => {
  const { characterPace } = await import("../../scripts/services/speed-reader.js");
  assert.equal(characterPace({ type: "character", system: { pace: { ground: 6 } } }), 6);
  // dump réel (SWADE 6.0.4)
  const real = { base: "ground", ground: 6, fly: null, swim: null, burrow: null, running: { die: 6, mod: 0 }, default: 6 };
  assert.equal(characterPace({ type: "npc", system: { pace: real } }), 6);
  assert.equal(characterPace({ type: "npc", system: { pace: { ...real, ground: 5, default: 7 } } }), 7);
  assert.equal(characterPace({ type: "npc", system: { pace: 8 } }), 8);
  assert.equal(characterPace({ type: "character", system: { stats: { speed: { value: 6, adjusted: 5 } } } }), 5);
  assert.equal(characterPace({ type: "vehicle", system: { pace: { ground: 6 } } }), null);
  assert.equal(characterPace({ type: "character", system: {} }), null);
});

test("bonus automatique entre personnages à pied", () => {
  const saved = world.combatants.map((c) => c.actor.system.pace);
  try {
    for (const c of world.combatants) c.actor.system.pace = { ground: 6 };
    world.combatants.find((c) => c.id === "cJa").actor.system.pace = { ground: 8 };
    const view = mods.chase.computeChaseView(world.combat);
    assert.deepEqual(mods.chase.autoSpeedFor(view, "cJa"), { bonus: 1, mine: 8, fastest: 6, kind: "pace" });
  } finally {
    world.combatants.forEach((c, i) => { c.actor.system.pace = saved[i]; });
  }
});

test("Janar (son tour) : action déclarée puis action gratuite → fin du tour proposée et acceptée", async () => {
  const { asGM } = await import("../../scripts/services/socket.js");
  const before = stubs.updates.filter((u) => u.doc === "nextTurn").length;
  await mods.handlers.runActionApply(world.combat, "cJa", "attack", "declare");
  assert.equal(stubs.updates.filter((u) => u.doc === "nextTurn").length, before);   // la gratuite reste possible
  await mods.handlers.runActionApply(world.combat, "cJa", "steady", "steady");
  assert.equal(stubs.updates.filter((u) => u.doc === "nextTurn").length, before + 1);
  const view = mods.chase.computeChaseView(world.combat);
  assert.equal(mods.chase.actionsFor(view, "cJa").filter((a) => a.available).length, 0);
  // nombre d'actions verrouillé pour un joueur…
  game.user.isGM = false;
  await asGM("setPlanned", { combatId: "combat1", combatantId: "cJa", planned: 2 });
  assert.equal(mods.chase.turnOf(mods.chase.computeChaseView(world.combat), "cJa").planned, 1);
  // … mais le MJ peut corriger
  game.user.isGM = true;
  await asGM("setPlanned", { combatId: "combat1", combatantId: "cJa", planned: 2 });
  assert.equal(mods.chase.turnOf(mods.chase.computeChaseView(world.combat), "cJa").planned, 2);
});

test("panneau : quand le tour change, il suit le participant actif", async () => {
  const app = new mods.panel.ChasePanel();
  let ctx = await app._prepareContext();
  assert.equal(ctx.unit.name, "Janar");
  // sélection manuelle : conservée tant que le tour ne change pas
  app.selectedId = "cG1";
  ctx = await app._prepareContext();
  assert.equal(ctx.unit.id, "cG1");
  // le tour passe à Edrin : le panneau bascule sur lui
  const saved = world.combat.combatant;
  world.combat.combatant = world.combatants.find((c) => c.id === "cEd");
  ctx = await app._prepareContext();
  assert.equal(ctx.unit.id, "cEd");
  world.combat.combatant = saved;
});

test("« Fin du tour » anticipée : avertissement s'il reste des actions, puis participant suivant", async () => {
  const app = new mods.panel.ChasePanel();
  app.selectedId = "cJa";
  world.combat.flags["swade-chase"].units.cJa.turn = null;      // rien joué ce tour
  const n = stubs.updates.filter((u) => u.doc === "nextTurn").length;
  let warned = null;
  const confirm = foundry.applications.api.DialogV2.confirm;
  foundry.applications.api.DialogV2.confirm = async (o) => { warned = o.content; return true; };
  await mods.panel.ChasePanel.onEndTurnEarly.call(app);
  foundry.applications.api.DialogV2.confirm = confirm;
  assert.match(warned, /il reste 1 action sur 1 et l'action gratuite/);
  assert.equal(stubs.updates.filter((u) => u.doc === "nextTurn").length, n + 1);
});

test("forcer la réouverture du panneau : seulement là où il est fermé", async () => {
  const { ChasePanel } = mods.panel;
  ChasePanel.instance = null;
  game.settings.get = ((g) => (m, k) => (k === "autoOpen" ? false : g(m, k)))(game.settings.get);
  const { broadcast } = await import("../../scripts/services/socket.js");
  await broadcast("forceOpenPanel", { userIds: null });
  assert.equal(ChasePanel.instance?.rendered, true);            // rouvert malgré autoOpen désactivé
  let renders = 0;
  const r = ChasePanel.instance.render.bind(ChasePanel.instance);
  ChasePanel.instance.render = (o) => { renders++; return r(o); };
  await broadcast("forceOpenPanel", { userIds: null });
  assert.equal(renders, 0);                                     // déjà ouvert : rien
  await broadcast("forceOpenPanel", { userIds: ["autre"] });
  assert.equal(renders, 0);                                     // pas pour cet utilisateur
});

test("Se dérober : texte adapté à un véhicule ou à un personnage à pied", async () => {
  const ed = world.combatants.find((c) => c.id === "cEd");
  world.combat.flags["swade-chase"].units.cEd = { turn: null };
  await mods.handlers.runActionApply(world.combat, "cEd", "evade", "evadeFree");
  const foot = stubs.created.at(-1).content;
  assert.doesNotMatch(foot, /son véhicule/);
  ed.actor.type = "vehicle";
  world.combat.round = 9;
  await mods.handlers.runActionApply(world.combat, "cEd", "evade", "evadeFree");
  assert.match(stubs.created.at(-1).content, /le véhicule et ses passagers/);
  ed.actor.type = "character";
  world.combat.round = 1;
});
