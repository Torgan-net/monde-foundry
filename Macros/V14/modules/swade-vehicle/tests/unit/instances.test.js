/**
 * Instances d'acteurs pour un véhicule : un acteur non lié (Extra, « Lié à l'acteur » décoché) déposé sur
 * un poste ou un soutien devient une copie propre au véhicule ; un acteur lié est référencé tel quel.
 */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeVehicle, makeCharacter } from "../helpers/foundry-stubs.js";

let env, I;

/** Faux Actor.create / Folder.create / game.actors.filter, sur le registre des stubs. */
function installDocumentStore() {
  let n = 0;
  const created = [], deleted = [], folders = [];
  globalThis.Actor.implementation = {
    create: async (data) => {
      const id = `I${++n}`;
      const a = makeCharacter({ uuid: `Actor.${id}`, name: data.name });
      Object.assign(a, { folder: data.folder ?? null, prototypeToken: data.prototypeToken, flags: data.flags ?? {}, data });
      a.getFlag = (s, k) => foundry.utils.getProperty(a.flags[s] ?? {}, k);
      a.delete = async () => { deleted.push(a.uuid); delete env.actors[a.uuid]; };
      env.actors[a.uuid] = a;
      created.push(a);
      return a;
    }
  };
  globalThis.Folder = { implementation: { create: async (d) => { const f = { id: `F${folders.length + 1}`, ...d }; folders.push(f); return f; } } };
  game.folders = { find: (fn) => folders.find(fn) };
  game.actors.filter = (fn) => Object.values(env.actors).filter(fn);
  Object.defineProperty(game.actors, "contents", { get: () => Object.values(env.actors), configurable: true });
  return { created, deleted, folders };
}

function template({ uuid, name, linked }) {
  const a = makeCharacter({ uuid, name, wildcard: linked });
  a.prototypeToken = { actorLink: linked, name };
  a.toObject = () => ({ _id: a.id, name, type: "character", folder: "Fx", prototypeToken: { actorLink: linked, name }, flags: {} });
  env.actors[uuid] = a;
  return a;
}

let store;
before(async () => {
  env = installFoundryStubs();
  I = await import("../../scripts/services/instances.js");
});
beforeEach(() => { store = installDocumentStore(); });

test("Acteur lié (Joker) : référencé tel quel, aucune copie", async () => {
  const v = makeVehicle();
  template({ uuid: "Actor.J", name: "Darryn", linked: true });
  assert.equal(await I.crewUuidFor(v, "Actor.J"), "Actor.J");
  assert.equal(store.created.length, 0);
});

test("Acteur non lié (Extra) : copie propre au véhicule, liée, rangée dans le dossier des équipages", async () => {
  const v = makeVehicle({ name: "Far Star" });
  template({ uuid: "Actor.X", name: "Kathol Republic Marine", linked: false });
  const uuid = await I.crewUuidFor(v, "Actor.X");
  const copy = store.created[0];
  assert.equal(uuid, copy.uuid);
  assert.equal(copy.name, "Kathol Republic Marine (Far Star)");
  assert.equal(copy.prototypeToken.actorLink, true);
  assert.equal(copy.prototypeToken.name, "Kathol Republic Marine (Far Star)");
  assert.deepEqual(copy.flags["swade-vehicle"], { instanceOf: "Actor.X", instanceFor: "Actor.V" });
  assert.equal(copy.folder, store.folders[0].id);
  assert.equal(store.folders[0].name, "Équipages des véhicules");
});

test("Extra lié à l'acteur (ex. un PNJ récurrent) : référencé tel quel ; Joker non lié : instance", async () => {
  const v = makeVehicle({ name: "Far Star" });
  const extra = template({ uuid: "Actor.EL", name: "Capitaine Voss", linked: true });
  extra.isWildcard = false;
  assert.equal(await I.crewUuidFor(v, "Actor.EL"), "Actor.EL");
  const joker = template({ uuid: "Actor.JN", name: "Héros générique", linked: false });
  joker.isWildcard = true;
  assert.notEqual(await I.crewUuidFor(v, "Actor.JN"), "Actor.JN");
  assert.equal(store.created.length, 1);
});

test("Deux Extras du même modèle : deux instances numérotées", async () => {
  const v = makeVehicle({ name: "Far Star" });
  template({ uuid: "Actor.X", name: "Marine", linked: false });
  await I.crewUuidFor(v, "Actor.X");
  await I.crewUuidFor(v, "Actor.X");
  assert.deepEqual(store.created.map((a) => a.name), ["Marine (Far Star)", "Marine (Far Star) 2"]);
  assert.equal(store.folders.length, 1);
});

test("Acteur de jeton (synthétique) ou déjà instance : pas de nouvelle copie", async () => {
  const v = makeVehicle();
  const tok = makeCharacter({ uuid: "Scene.S.Token.T.Actor.X", name: "Marine" });
  tok.isToken = true;
  env.actors[tok.uuid] = tok;
  assert.equal(await I.crewUuidFor(v, tok.uuid), tok.uuid);
  template({ uuid: "Actor.X", name: "Marine", linked: false });
  const inst = await I.crewUuidFor(v, "Actor.X");
  assert.equal(await I.crewUuidFor(v, inst), inst);
  assert.equal(store.created.length, 1);
});

test("Instance d'un autre véhicule déposée : nouvelle instance pour ce véhicule, même modèle", async () => {
  const a = makeVehicle({ uuid: "Actor.VA", name: "Far Star" });
  const b = makeVehicle({ uuid: "Actor.VB", name: "Kestrel" });
  template({ uuid: "Actor.X", name: "Marine", linked: false });
  const instA = await I.crewUuidFor(a, "Actor.X");
  env.actors[instA].toObject = () => ({ name: "Marine (Far Star)", type: "character", prototypeToken: { actorLink: true }, flags: { "swade-vehicle": { instanceOf: "Actor.X", instanceFor: "Actor.VA" } } });
  const instB = await I.crewUuidFor(b, instA);
  assert.notEqual(instB, instA);
  assert.equal(env.actors[instB].name, "Marine (Kestrel)");
  assert.deepEqual(env.actors[instB].flags["swade-vehicle"], { instanceOf: "Actor.X", instanceFor: "Actor.VB" });
});

test("Nettoyage : les instances du véhicule qui ne sont plus référencées sont supprimées", async () => {
  const v = makeVehicle();
  template({ uuid: "Actor.X", name: "Marine", linked: false });
  const a = await I.crewUuidFor(v, "Actor.X");
  const b = await I.crewUuidFor(v, "Actor.X");
  await I.pruneInstances(v, [a]);
  assert.deepEqual(store.deleted, [b]);
  assert.ok(env.actors["Actor.X"], "le modèle n'est jamais supprimé");
});

test("Références d'un véhicule : occupants, acteurs de soutien et membres natifs", () => {
  const postes = [{ occupant: "Actor.A", supports: [{ actor: "Actor.B" }, { actor: null }] }, { occupant: null, support: { enabled: true } }];
  assert.deepEqual([...I.referencedActors(postes, [{ uuid: "Actor.C" }])].sort(), ["Actor.A", "Actor.B", "Actor.C"]);
});
