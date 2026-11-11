/**
 * Services (avec faux Foundry) : ce que le module écrit sur les véhicules et l'équipage.
 * Les jets passent par une file de résultats (installRollQueue) ; sans table réglée, le module lance 2d6 lui-même.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, installRollQueue, makeVehicle, makeCharacter } from "../helpers/foundry-stubs.js";

let env, rolls, S;

before(async () => {
  env = installFoundryStubs();
  rolls = installRollQueue();
  S = {
    ...(await import("../../scripts/services/criticals.js")),
    ...(await import("../../scripts/services/wounds.js")),
    ...(await import("../../scripts/services/joker.js")),
    ...(await import("../../scripts/services/energy.js")),
    ...(await import("../../scripts/services/damage-card.js"))
  };
});

beforeEach(() => { rolls.length = 0; env.calls.chat.length = 0; });

function ship(extra = {}) {
  const pilot = makeCharacter({ uuid: "Actor.P", name: "Darryn" });
  env.actors[pilot.uuid] = pilot;
  const v = makeVehicle({
    system: { wounds: { value: 0, max: 5 }, status: {}, size: 15, additionalStats: { shield: { value: 2 } },
      crew: { members: [{ uuid: "Actor.P", role: "operator", weapons: [] }] }, ...extra.system },
    items: extra.items ?? [{ id: "w1", name: "Laser (Classe II)", type: "weapon", system: { isVehicular: true } }],
    flags: extra.flags ?? {}
  });
  env.actors[v.uuid] = v;
  return { v, pilot };
}

test("Dégradation de guidage cumulée : Maniabilité −4 au plus, effet actif au format v14", async () => {
  const { v } = ship();
  rolls.push(3, 3, 3, 3, 3);
  for (let i = 0; i < 5; i++) await S.applyCritical(v);
  assert.equal(v.getFlag("swade-vehicle", "crits").handling, 4);
  assert.deepEqual(v.effects[0].changes, [{ key: "system.handling", type: "add", value: "-4" }]);
});

test("Dégradation de propulsion cumulée : Vitesse 60 % au moins", async () => {
  const { v } = ship();
  rolls.push(4, 5, 4, 5, 4);
  for (let i = 0; i < 5; i++) await S.applyCritical(v);
  assert.equal(v.getFlag("swade-vehicle", "crits").speed, 4);
  assert.deepEqual(v.effects[0].changes, [{ key: "system.topspeed.value", type: "multiply", value: "0.6" }]);
});

test("Arme détruite (11), puis châssis quand il n'y a plus d'arme", async () => {
  const { v } = ship();
  rolls.push(11, 11);
  await S.applyCritical(v);
  await S.applyCritical(v);
  assert.deepEqual(v.getFlag("swade-vehicle", "crits").destroyed, ["w1"]);
  assert.match(v.getFlag("swade-vehicle", "journal").at(-1).text, /châssis/);
});

test("Équipage (9) en collision : les occupants sont Secoués", async () => {
  const { v, pilot } = ship();
  rolls.push(9);
  await S.applyCritical(v, { collision: true });
  assert.ok(pilot.statuses.has("shaken"));
});

test("Perte de contrôle 2 : véhicule Distrait, d4 Blessures et une Dégradation", async () => {
  const { v } = ship();
  rolls.push(2, 3, 7); // table, d4, Dégradation
  await S.applyOutOfControl(v);
  assert.equal(v.system.status.isDistracted, true);
  assert.equal(v.system.wounds.value, 3);
  assert.equal(rolls.length, 0);
});

test("Perte de contrôle 3–4 : 1 Blessure et une Dégradation ; 5–9 : Distrait ; 10–11 : Vulnérable", async () => {
  let { v } = ship();
  rolls.push(3, 8);
  await S.applyOutOfControl(v);
  assert.equal(v.system.wounds.value, 1);
  ({ v } = ship());
  rolls.push(7);
  await S.applyOutOfControl(v);
  assert.deepEqual([v.system.status.isDistracted, v.system.wounds.value], [true, 0]);
  ({ v } = ship());
  rolls.push(10);
  await S.applyOutOfControl(v);
  assert.equal(v.system.status.isVulnerable, true);
});

test("Perte de contrôle 12 : Dégradation avec relance des résultats Équipage", async () => {
  const { v } = ship();
  rolls.push(12, 9, 10, 6);
  await S.applyOutOfControl(v);
  assert.equal(rolls.length, 0);
});

test("Blessures au-delà du maximum : épave, valeur plafonnée à max + 1", async () => {
  const { v } = ship();
  await S.setVehicleWounds(v, 9, "test");
  assert.deepEqual([v.system.wounds.value, v.system.status.isWrecked], [6, true]);
  assert.equal(env.calls.chat.length, 1);
  await S.setVehicleWounds(v, 3, "test");
  assert.equal(S.vehicleWoundsValue(v), 3);
});

test("Joker d'un véhicule : un Jeton aux Jokers à bord des véhicules alliés, une seule fois par round", async () => {
  const mk = (uuid, name, wild = true) => (env.actors[uuid] = makeCharacter({ uuid, name, wildcard: wild }));
  const darryn = mk("Actor.J1", "Darryn"), tobb = mk("Actor.J2", "Tobb"), mecano = mk("Actor.J3", "Mécano", false);
  const lia = mk("Actor.J4", "Lia"), pirate = mk("Actor.J5", "Pirate"), hero = mk("Actor.J6", "Héros combattant");
  const crew = (...u) => ({ members: u.map((x) => ({ uuid: x, role: "operator", weapons: [] })) });
  const a = makeVehicle({ uuid: "Actor.S1", system: { crew: crew("Actor.J1", "Actor.J2", "Actor.J3") }, flags: { postes: [{ id: "p", type: "pilote", occupant: "Actor.J1" }] } });
  const b = makeVehicle({ uuid: "Actor.S2", system: { crew: crew("Actor.J4", "Actor.J6") } });
  const c = makeVehicle({ uuid: "Actor.S3", system: { crew: crew("Actor.J5") } });
  for (const x of [a, b, c]) env.actors[x.uuid] = x;
  const cmb = (actor, disposition, hasJoker, id) => ({ id, actor, actorId: actor.id, token: { disposition }, hasJoker });
  const combat = { round: 1, flags: {}, getFlag(s, k) { return this.flags[k]; }, async setFlag(s, k, val) { this.flags[k] = val; },
    combatants: [cmb(a, 1, true, "c1"), cmb(b, 1, false, "c2"), cmb(c, -1, false, "c3"), cmb(hero, 1, false, "c4")] };
  game.combats = [combat];
  await S.awardJokerBennies(combat, combat.combatants[0]);
  await S.awardJokerBennies(combat, combat.combatants[0]);
  assert.deepEqual([darryn, tobb, mecano, lia, pirate, hero].map((x) => x.bennies), [1, 1, 0, 1, 0, 0]);
  assert.equal(S.vehicleHasJoker(a), true);
  assert.equal(S.vehicleHasJoker(b), false);
  game.combats = [];
});

test("Gestion de l'énergie lue sur le véhicule", () => {
  const { v } = ship({ flags: { power: { boost: "weapons", from: ["propulsion", "shields"] } } });
  assert.deepEqual(S.powerMods(v), { handling: -4, soak: -4, weaponDamage: 8, weaponWounds: 2 });
});

test("Carte de dégâts : boutons selon l'étape", () => {
  const { v } = ship();
  const base = { mode: "hm", title: "Super Laser", subtitle: "", targetUuid: v.uuid, targetName: v.name, isVehicle: true,
    noEffect: false, steps: [], maneuverRequired: true, log: [], done: false, soakDone: false, maneuverDone: false, validated: false };
  const buttons = (d) => [...S.damageCardHTML(d).matchAll(/data-swv-dmg="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons({ ...base, wounds: 3, remaining: 3, applied: false }), ["soak", "apply"]);
  assert.deepEqual(buttons({ ...base, wounds: 3, remaining: 2, applied: false, soakDone: true }), ["apply"]);
  assert.deepEqual(buttons({ ...base, wounds: 3, remaining: 2, applied: true }), ["maneuver", "maneuverOk", "ooc"]);
  assert.deepEqual(buttons({ ...base, wounds: 0, remaining: 0, applied: true }), ["maneuver", "maneuverOk", "ooc"]);
  assert.deepEqual(buttons({ ...base, mode: "native", wounds: 2, remaining: 2, applied: true }), ["soak", "validate"]);
  const allSoaked = { ...base, wounds: 3, remaining: 0, applied: false, soakDone: true, done: true };
  assert.deepEqual(buttons(allSoaked), []);
  assert.match(S.damageCardHTML(allSoaked), /Toutes les Blessures encaissées/);
});

test("Soutien sans acteur : jet de groupe, bonus rangé sous le soutien", async () => {
  const { groupRoll } = await import("../../scripts/services/support.js");
  const { v } = ship({ flags: { postes: [{ id: "p1", label: "Tourelle", type: "artilleur",
    supports: [{ id: "s1", label: "Servants", count: 10, die: 8, mod: 0 }, { id: "s2", label: "Pourvoyeurs", count: 4, die: 6, mod: 0 }] }] } });
  rolls.push(9, 2);               // d8 = 9, dé Joker = 2 → Prouesse
  await groupRoll(v, "p1", "s1");
  rolls.push(5, 1);               // d6 = 5, dé Joker = 1 → Réussite
  await groupRoll(v, "p1", "s2");
  assert.deepEqual(v.getFlag("swade-vehicle", "supportBonus.p1"), { s1: { value: 2, label: "Servants" }, s2: { value: 1, label: "Pourvoyeurs" } });
  assert.equal(env.calls.chat.length, 2);
});

test("Soutien avec acteur : jet de l'acteur, puis carte de résultat à valider", async () => {
  const { groupRoll, applySupportResult } = await import("../../scripts/services/support.js");
  const mecano = makeCharacter({ uuid: "Actor.M", name: "Mécano", wildcard: false });
  const rolled = [];
  mecano.items = Object.assign([{ id: "k1", type: "skill", name: "Shooting", system: { swid: "shooting" } }], { get: () => null });
  mecano.rollSkill = async (id, opts) => { rolled.push(id); return null; };
  env.actors[mecano.uuid] = mecano;
  const asked = [];
  foundry.applications.api.DialogV2.prompt = async (o) => { asked.push(o.content); return o.content.match(/<option value="([^"]*)" selected/)?.[1] ?? null; };
  const { v } = ship({ flags: { postes: [{ id: "p1", label: "Tourelle", type: "artilleur", supports: [{ id: "s1", label: "", actor: "Actor.M", count: 0 }] }] } });
  await groupRoll(v, "p1", "s1");
  assert.equal(asked.length, 1);                       // compétence demandée au jet, Tir proposé par défaut
  assert.deepEqual(rolled, ["k1"]);                    // compétence par défaut d'un artilleur : Tir
  const card = env.calls.chat.at(-1);
  assert.match(card.content, /data-swv-support-result="2"/);
  assert.match(card.content, /Tourelle<\/strong> · Shooting/);
  assert.equal(v.getFlag("swade-vehicle", "supportBonus.p1"), undefined);
  await applySupportResult(v, "p1", "s1", 1, "Mécano");
  assert.deepEqual(v.getFlag("swade-vehicle", "supportBonus.p1.s1"), { value: 1, label: "Mécano" });
  foundry.applications.api.DialogV2.prompt = async () => null;
});

test("Soutien avec acteur : la compétence se choisit au jet parmi celles de l'acteur (Astrogation, Électronique…)", async () => {
  const { groupRoll } = await import("../../scripts/services/support.js");
  const tech = makeCharacter({ uuid: "Actor.T", name: "Technicien", wildcard: false });
  const rolled = [];
  const sk = (id, name, swid, sides) => ({ id, type: "skill", name, system: { swid, die: { sides } } });
  tech.items = Object.assign([sk("a1", "Pilotage", "piloting", 6), sk("a2", "Électronique", "electronics", 8), sk("a3", "Astrogation", "astrogation", 6)], { get: () => null });
  tech.rollSkill = async (id) => { rolled.push(id); return null; };
  env.actors[tech.uuid] = tech;
  let content = "";
  foundry.applications.api.DialogV2.prompt = async (o) => { content = o.content; return "astrogation"; };
  const { v } = ship({ system: { driver: { skill: "Piloting" } }, flags: { postes: [{ id: "p1", label: "Barre", type: "pilote", supports: [{ id: "s1", actor: "Actor.T" }] }] } });
  await groupRoll(v, "p1", "s1");
  assert.match(content, /<option value="astrogation" selected>Astrogation d6/); // rien de réglé : première de la liste
  assert.match(content, /<option value="piloting">Pilotage d6/);
  assert.match(content, /<option value="electronics">Électronique d8/);
  assert.deepEqual(rolled, ["a3"]);
  assert.match(env.calls.chat.at(-1).content, /Barre<\/strong> · Astrogation/);
  // Fenêtre fermée : pas de jet.
  foundry.applications.api.DialogV2.prompt = async () => null;
  await groupRoll(v, "p1", "s1");
  assert.deepEqual(rolled, ["a3"]);
});
