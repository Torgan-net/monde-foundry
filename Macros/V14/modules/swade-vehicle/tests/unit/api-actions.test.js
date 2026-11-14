/**
 * API, actions : fireWeapon(ref, weaponId, { shooter, mods }) et replenishShields(ref).
 * Utilisées par swade-clash dès qu'elles existent.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeVehicle, makeCharacter } from "../helpers/foundry-stubs.js";

let env, api;

before(async () => {
  env = installFoundryStubs();
  await import("../../scripts/main.js");
  await env.callHook("init");
  await env.callHook("ready");
  api = env.module.api;
});
beforeEach(() => { env.calls.notifications.length = 0; game.swade = {}; });

function gunner(uuid, name) {
  const a = makeCharacter({ uuid, name });
  a.rolled = [];
  a.items = Object.assign([{ id: "k1", type: "skill", name: "Tir", system: { swid: "shooting" } }], { get: () => null });
  a.rollSkill = async (id, opts) => { a.rolled.push({ id, mods: opts.additionalMods }); return { total: 8 }; };
  env.actors[uuid] = a;
  return a;
}

function ship({ flags = {}, system = {} } = {}) {
  const laser = { id: "w1", name: "Laser (Classe II)", type: "weapon", system: { isVehicular: true, rof: 1, actions: { trait: "Shooting", traitMod: 1 } } };
  const v = makeVehicle({
    uuid: "Actor.FS", items: [laser],
    system: { crew: { members: [] }, size: 15, additionalStats: { shield: { value: 1 } }, ...system },
    flags: { postes: [{ id: "t1", label: "Tourelle", type: "artilleur", occupant: "Actor.G", weapons: ["w1"] }], ...flags }
  });
  env.actors[v.uuid] = v;
  return v;
}

test("fireWeapon : par défaut l'occupant du poste de l'arme tire, avec ses soutiens et les modificateurs fournis", async () => {
  const g = gunner("Actor.G", "Tobb");
  const v = ship({ flags: { supportBonus: { t1: { s1: { value: 2, label: "Servants" } } } } });
  const r = await api.fireWeapon(v, "w1", { mods: [{ label: "Clash", value: -2 }] });
  assert.equal(r.shooter, g);
  assert.equal(r.weapon.id, "w1");
  assert.equal(r.poste.id, "t1");
  assert.equal(r.via, "module");
  assert.deepEqual(g.rolled[0].mods, [
    { label: "Laser", value: 1 },
    { label: "Soutien · Servants", value: 2 },
    { label: "Clash", value: -2 }
  ]);
  assert.equal(v.getFlag("swade-vehicle", "supportBonus.t1"), undefined); // soutien consommé
});

test("fireWeapon : tireur imposé (acteur ou UUID) ; hors poste, aucun bonus de soutien pris", async () => {
  gunner("Actor.G", "Tobb");
  const other = gunner("Actor.O", "Lia");
  const v = ship({ flags: { supportBonus: { t1: { s1: { value: 1, label: "Servants" } } } } });
  const r = await api.fireWeapon(v.uuid, "w1", { shooter: "Actor.O" });
  assert.equal(r.shooter, other);
  assert.equal(r.poste, null);
  assert.deepEqual(other.rolled[0].mods, [{ label: "Laser", value: 1 }]);
  assert.deepEqual(v.getFlag("swade-vehicle", "supportBonus.t1"), { s1: { value: 1, label: "Servants" } });
});

test("fireWeapon : pipeline natif de SWADE quand il existe", async () => {
  const g = gunner("Actor.G", "Tobb");
  const calls = [];
  game.swade = { itemChatCardHelper: { handleAction: async (item, actor, action, opts) => calls.push([item.id, actor.name, action, opts.additionalMods]) } };
  const v = ship();
  const r = await api.fireWeapon(v, "w1", { mods: [{ label: "Clash", value: 1 }] });
  assert.equal(r.via, "native");
  assert.deepEqual(calls, [["w1", "Tobb", "formula", [{ label: "Clash", value: 1 }]]]);
  assert.equal(g.rolled.length, 0);
});

test("fireWeapon : refus si arme inconnue, détruite ou sans tireur", async () => {
  gunner("Actor.G", "Tobb");
  assert.equal(await api.fireWeapon(ship(), "nope"), null);
  assert.equal(await api.fireWeapon(ship({ flags: { crits: { destroyed: ["w1"] } } }), "w1"), null);
  assert.equal(await api.fireWeapon(ship({ flags: { postes: [] } }), "w1"), null);
  assert.equal(await api.fireWeapon("Actor.inconnu", "w1"), null);
  assert.equal(env.calls.notifications.length, 4); // un avertissement par refus
});

test("replenishShields : charges au maximum, journal ; null sans bouclier", async () => {
  const v = ship();
  const r = await api.replenishShields(v);
  assert.equal(r.max > 1, true);
  assert.deepEqual(r, { value: r.max, max: r.max });
  assert.equal(v.system.additionalStats.shield.value, r.max);
  assert.match(v.getFlag("swade-vehicle", "journal").at(-1).text, /Bouclier rechargé/);
  assert.equal(await api.replenishShields(ship({ system: { additionalStats: {} } })), null);
});
