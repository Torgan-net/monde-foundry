/** Contexte d'affichage de la fiche : construit sur un véhicule fictif, comme le ferait Foundry. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeVehicle, makeCharacter } from "../helpers/foundry-stubs.js";

let env, buildSheetContext;
before(async () => {
  env = installFoundryStubs();
  ({ buildSheetContext } = await import("../../scripts/sheets/context.js"));
});

function farStar() {
  const pilot = makeCharacter({ uuid: "Actor.P", name: "Darryn" });
  pilot.img = "darryn.png";
  env.actors[pilot.uuid] = pilot;
  const weapon = { id: "w1", name: "Super Laser (Classe V)", type: "weapon", img: "w.png",
    system: { isVehicular: true, isHeavyWeapon: true, damage: "5d10", ap: 30, range: "150/300/600", rof: 1, shots: 0, actions: { trait: "Shooting", additional: {} } },
    getFlag: () => undefined };
  const armor = { id: "m1", name: "Armure", type: "gear", img: "a.png",
    system: { isVehicular: true, mods: 1, quantity: 10, actions: {}, description: "" }, getFlag: () => undefined };
  const v = makeVehicle({
    name: "Far Star (Class IV)",
    system: { size: 15, scale: 6, classification: "Frégate", handling: -2, topspeed: { value: 14, unit: "" },
      toughness: { total: 45, armor: 20 }, wounds: { value: 1, max: 6, ignored: 0 }, driver: { skill: "Piloting" },
      status: { isDistracted: false }, crew: { required: { max: 4 }, optional: { value: 120, max: 120 }, members: [{ uuid: "Actor.P", role: "operator", weapons: ["w1"] }] },
      energy: { enabled: true, value: 300, max: 300 }, mods: { max: 60 }, cargo: { max: 0 }, additionalStats: { shield: { value: 3 } } },
    flags: { postes: [{ id: "p1", label: "Barre", type: "pilote", weapons: ["w1"], mods: [], occupant: "Actor.P" }] },
    items: [weapon, armor]
  });
  v.appliedEffects = [];
  return v;
}

test("Contexte de la Passerelle : Classe, caractéristiques, postes, bouclier", async () => {
  const v = farStar();
  const sheet = { document: v, postes: v.getFlag("swade-vehicle", "postes"), _tab: "passerelle", _locked: true, collapsed: new Set() };
  const ctx = await buildSheetContext(sheet, {});
  assert.equal(ctx.displayName, "Far Star");
  assert.equal(ctx.classe, "IV");
  assert.match(ctx.subtitle, /Taille 15 · Échelle 6 · Manœuvre : Pilotage/);
  assert.deepEqual(ctx.stats.find((s) => s.label === "Mods"), { label: "Mods", value: "10 / 60", warn: false });
  assert.equal(ctx.postes[0].occupant.name, "Darryn");
  assert.equal(ctx.postes[0].weapons[0].classe, "V");
  assert.equal(ctx.postes[0].isPilot, true);
  assert.deepEqual(ctx.shield, { key: "shield", value: 3, max: 3 });
  assert.equal(ctx.crewAlert, "Équipage requis : 1 / 4");
  assert.deepEqual(ctx.tabs, { passerelle: true, cargaison: false, journal: false, equipement: false, conception: false });
});

test("Contexte de l'onglet Équipement et de la Conception (MJ déverrouillé)", async () => {
  const v = farStar();
  const sheet = { document: v, postes: v.getFlag("swade-vehicle", "postes"), _tab: "conception", _locked: false, collapsed: new Set() };
  const ctx = await buildSheetContext(sheet, {});
  assert.equal(ctx.tabs.conception, true);
  assert.equal(ctx.equipment.weapons[0].classe, "V");
  assert.equal(ctx.equipment.mods[0].slots, 10);
  assert.equal(ctx.tech.scaleAuto, 6);
  assert.equal(ctx.tech.woundsAuto, 6);
});

test("Contexte : soutiens multiples d'un poste, acteur affiché, bonus cumulés, effectif", async () => {
  const v = farStar();
  const meca = makeCharacter({ uuid: "Actor.M", name: "Mécano", wildcard: false });
  meca.img = "m.png";
  env.actors[meca.uuid] = meca;
  const postes = [{ id: "p1", label: "Barre", type: "pilote", weapons: [], mods: [], occupant: "Actor.P",
    supports: [{ id: "s1", label: "Servants", count: 10, die: 8, mod: 0 }, { id: "s2", label: "", actor: "Actor.M", count: 0, skill: "" }] }];
  await v.setFlag("swade-vehicle", "postes", postes);
  await v.setFlag("swade-vehicle", "supportBonus", { p1: { s1: { value: 2, label: "Servants" }, s2: { value: 1, label: "Mécano" } } });
  const ctx = await buildSheetContext({ document: v, postes, _tab: "passerelle", _locked: true, collapsed: new Set() }, {});
  const sup = ctx.postes[0].supports;
  assert.equal(sup.length, 2);
  assert.equal(sup[0].text, "10 pers. · d8 + dé Joker");
  assert.deepEqual([sup[1].actorName, sup[1].skillLabel], ["Mécano", null]); // acteur sans compétence
  assert.equal(ctx.postes[0].supportPending, "+3");
  assert.equal(ctx.crew.support, 11);
});

test("Contexte : soutien avec acteur, choix parmi les compétences de l'acteur", async () => {
  const v = farStar();
  const meca = makeCharacter({ uuid: "Actor.M2", name: "Mécano", wildcard: false });
  const sk = (id, name, swid, sides) => ({ id, type: "skill", name, system: { swid, die: { sides } } });
  meca.items = Object.assign([sk("k1", "Réparation", "repair", 8), sk("k2", "Pilotage", "piloting", 6), { id: "w", type: "weapon", name: "Pistolet", system: {} }], { get: () => null });
  env.actors[meca.uuid] = meca;
  const postes = [{ id: "p1", label: "Barre", type: "pilote", weapons: [], mods: [], occupant: "Actor.P",
    supports: [{ id: "s1", label: "", actor: "Actor.M2", count: 0, skill: "repair" }, { id: "s2", label: "Sans acteur", count: 3 }] }];
  await v.setFlag("swade-vehicle", "postes", postes);
  const ctx = await buildSheetContext({ document: v, postes, _tab: "conception", _locked: false, collapsed: new Set() }, {});
  const [withActor, without] = ctx.editPostes[0].supports;
  assert.deepEqual(withActor.skillOptions, [
    { value: "piloting", label: "Pilotage d6", selected: false },
    { value: "repair", label: "Réparation d8", selected: true }
  ]);
  assert.equal(without.skillOptions, null);
  assert.equal(ctx.postes[0].supports[0].skillLabel, "Réparation d8");
});

test("Contexte : sans compétence réglée, la première compétence de l'acteur", async () => {
  const v = farStar();
  const meca = makeCharacter({ uuid: "Actor.M3", name: "Mousse", wildcard: false });
  meca.items = Object.assign([{ id: "k1", type: "skill", name: "Perception", system: { swid: "notice", die: { sides: 6 } } }], { get: () => null });
  env.actors[meca.uuid] = meca;
  const postes = [{ id: "p1", label: "Barre", type: "pilote", weapons: [], mods: [], supports: [{ id: "s1", actor: "Actor.M3" }] }];
  await v.setFlag("swade-vehicle", "postes", postes);
  const ctx = await buildSheetContext({ document: v, postes, _tab: "conception", _locked: false, collapsed: new Set() }, {});
  // Rien de réglé : la première compétence de l'acteur, jamais celle du poste imposée.
  assert.deepEqual(ctx.editPostes[0].supports[0].skillOptions, [{ value: "notice", label: "Perception d6", selected: true }]);
  assert.equal(ctx.postes[0].supports[0].skillLabel, "Perception d6");
});
