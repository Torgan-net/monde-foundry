/**
 * Test de chargement : le module s'importe avec un faux Foundry, enregistre fiche et réglages,
 * corrige l'Échelle après le système, et son API répond sur un véhicule fictif.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeVehicle, makeCharacter } from "../helpers/foundry-stubs.js";

let env;
let api;

before(async () => {
  env = installFoundryStubs();
  await import("../../scripts/main.js");
  await env.callHook("init");
  await env.callHook("setup");
  await env.callHook("ready");
  api = env.module.api;
});

test("Le module enregistre sa fiche, ses réglages et son API", () => {
  assert.equal(env.calls.sheets.length, 1);
  assert.deepEqual(env.calls.sheets[0][3].types, ["vehicle"]);
  for (const key of ["diceRoller", "tableOutOfControl", "tableCritical"]) assert.ok(env.calls.settings[`swade-vehicle.${key}`], key);
  assert.equal(api?.version, 1);
});

test("L'Échelle imposée après le calcul du système (Taille 21 → 6, ou valeur forcée)", () => {
  const model = new env.VehicleModel();
  model.parent = makeVehicle({ system: { size: 21, scale: 0 } });
  model.prepareDerivedData();
  assert.equal(model.scale, 6);
  const forced = new env.VehicleModel();
  forced.parent = makeVehicle({ system: { size: 21, scale: 2 }, flags: { scaleForced: true } });
  forced.prepareDerivedData();
  assert.equal(forced.scale, 2);
});

test("API : pilote, Maniabilité, Classe, armes et postes", () => {
  const pilot = makeCharacter({ uuid: "Actor.P", name: "Darryn" });
  const gunner = makeCharacter({ uuid: "Actor.G", name: "Tobb" });
  env.actors[pilot.uuid] = pilot;
  env.actors[gunner.uuid] = gunner;
  const weapon = (id, name, damage, ap, flags = {}) => ({ id, name, type: "weapon", system: { isVehicular: true, isHeavyWeapon: true, damage, ap },
    getFlag: (s, k) => flags[k] });
  const ship = makeVehicle({
    system: { handling: -3, toughness: { total: 45, armor: 20 }, wounds: { value: 2, max: 6, ignored: 0 }, driver: { skill: "Piloting" }, status: {},
      crew: { members: [{ uuid: "Actor.P", role: "operator", weapons: ["w1"] }, { uuid: "Actor.G", role: "gunner", weapons: ["w2"] }] } },
    flags: { postes: [{ id: "p1", label: "Barre", type: "pilote", weapons: ["w1"], occupant: "Actor.P" },
      { id: "p2", label: "Tourelle", type: "artilleur", weapons: ["w2"], occupant: "Actor.G" }], crits: { destroyed: ["w2"] } },
    items: [weapon("w1", "Super Laser (Classe V)", "5d10", 30, { fixed: true }), weapon("w2", "Gatling Laser (Class I)", "3d6+4", 4)]
  });
  env.actors[ship.uuid] = ship;

  assert.equal(api.getPilot(ship)?.name, "Darryn");
  assert.equal(api.getCurrentHandling(ship), -3);
  assert.equal(api.getWoundPenalty(ship), -2);
  assert.deepEqual(api.getManeuverModifiers(ship).map((m) => m.value), [-3, -2]);
  assert.equal(api.getClasse(ship), "IV");
  assert.deepEqual(api.getWeapons(ship).map((w) => [w.name, w.classe, w.fixed, w.operator?.name]), [["Super Laser", "V", true, "Darryn"]]);
  assert.equal(api.getWeapons(ship, { includeDestroyed: true }).length, 2);
  assert.deepEqual(api.getPostes("Actor.V").map((p) => p.role), ["operator", "gunner"]);
  assert.equal(api.isVehicle(pilot), false);
});

test("Fiche : chaque action déclarée pointe vers une fonction, et les actions attendues existent", async () => {
  const { SwadeVehicleSheet } = await import("../../scripts/sheets/vehicle-sheet.js");
  const actions = SwadeVehicleSheet.DEFAULT_OPTIONS.actions;
  for (const [name, fn] of Object.entries(actions)) assert.equal(typeof fn, "function", `action ${name}`);
  for (const name of ["maneuver", "fire", "damage", "weaponAction", "modAction", "groupRoll", "wound", "outOfControl", "critical",
    "shieldSoak", "divertPower", "spendEnergy", "addPoste", "importCrew", "switchTab", "toggleLock", "openTweaks", "openNative", "addSupport", "deleteSupport", "clearSupportActor"]) {
    assert.ok(actions[name], `action ${name} absente`);
  }
  assert.equal(Object.keys(actions).length, 36);
});

test("API : soutiens multiples d'un poste et bonus cumulé", async () => {
  const v = makeVehicle({ uuid: "Actor.V2", system: { driver: { skill: "Piloting" }, crew: { members: [] } },
    flags: { postes: [{ id: "p1", label: "Barre", type: "pilote", supports: [{ id: "s1", label: "Servants", count: 4, die: 8 }, { id: "s2", actor: "Actor.P" }] }],
      supportBonus: { p1: { s1: { value: 2, label: "Servants" }, s2: { value: 1, label: "Darryn" } } } } });
  env.actors[v.uuid] = v;
  const [poste] = api.getPostes(v);
  assert.deepEqual(poste.supports.map((s) => [s.id, s.label, s.actor?.name ?? null, s.skill]), [["s1", "Servants", null, "Piloting"], ["s2", "", "Darryn", null]]); // acteur sans compétence : rien d'imposé
  assert.equal(poste.supportBonus, 3);
  assert.equal(poste.support.label, "Servants"); // compatibilité : premier soutien
});
