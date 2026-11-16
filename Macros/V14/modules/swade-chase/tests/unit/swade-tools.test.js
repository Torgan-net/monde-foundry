import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, buildDumpWorld } from "../helpers/foundry-stubs.js";

const stubs = installFoundryStubs({ gm: true });
let st, rolls, world;
const render = (msg) => Hooks.callAll("renderChatMessageHTML", msg, {}, { user: { id: msg.authorId } });
const fakeMsg = (o = {}) => {
  const m = { id: o.id ?? "m", authorId: o.authorId ?? "u1", isOwner: true, rolls: o.rolls ?? [], flags: {},
    updates: [], update: async (p) => { m.updates.push(p); } };
  return m;
};

before(async () => {
  await import("../../scripts/main.js");
  Hooks.callAll("init");
  Hooks.callAll("ready");
  world = buildDumpWorld(stubs);
  st = await import("../../scripts/integrations/swade-tools.js");
  rolls = await import("../../scripts/services/rolls.js");
});

test("mode du lanceur : natif, SWADE Tools « simplifié », ou jet natif marqué pour SWADE Tools", () => {
  assert.equal(st.rollerMode(), "native");                         // SWADE Tools absent
  game.modules.set("swade-tools", { id: "swade-tools", active: true });
  game.swadetools = { skill: async () => {} };
  assert.equal(st.rollerMode(), "tagged");                         // jets simplifiés désactivés
  game.settings.register("swade-tools", "simpleRolls", { default: true });
  assert.equal(st.rollerMode(), "simple");
  game.settings.register = game.settings.register;                 // (inchangé)
});

test("marquage : seul le prochain message de jet de cet utilisateur reçoit flags.swade-tools.rolltype", async () => {
  st.tagNextRoll("skill");
  const note = fakeMsg({ id: "note" });                            // message sans jet : ignoré
  render(note);
  const other = fakeMsg({ id: "other", authorId: "u2", rolls: [{}] });   // jet d'un autre joueur : ignoré
  render(other);
  const mine = fakeMsg({ id: "mine", rolls: [{}] });
  render(mine);
  assert.deepEqual(note.updates, []);
  assert.deepEqual(other.updates, []);
  assert.deepEqual(mine.updates, [{ "flags.swade-tools.rolltype": "skill" }]);
  const next = fakeMsg({ id: "next", rolls: [{}] });               // une seule fois
  render(next);
  assert.deepEqual(next.updates, []);
});

test("jet de véhicule (swade-vehicle) avec SWADE Tools : le message de jet est marqué", async () => {
  game.settings.register("swade-tools", "simpleRolls", { default: false });
  game.modules.set("swade-vehicle", { id: "swade-vehicle", active: true, api: {
    rollManeuver: async () => { const m = fakeMsg({ id: "veh", rolls: [{}] }); render(m); globalThis.__vehMsg = m; return { total: 5 }; }
  } });
  const bus = world.combatants.find((c) => c.id === "cG1");
  bus.actor.type = "vehicle";
  await rolls.rollManeuver(bus, "vehicle", [], "test");
  assert.deepEqual(globalThis.__vehMsg.updates, [{ "flags.swade-tools.rolltype": "skill" }]);
  bus.actor.type = "character";
});

test("mode simplifié : le champ « Modificateur » de la fenêtre de SWADE Tools est prérempli avec le total", async () => {
  const input = { value: "", title: "" };
  const root = { querySelector: (s) => (s === "#mod" ? input : null) };
  st.prefillSimpleMods([{ label: "Action dédiée", value: 2 }, { label: "Carreau", value: -2 }, { label: "Vitesse", value: 1 }]);
  Hooks.callAll("renderDialog", {}, [root]);
  assert.equal(input.value, "1");
  assert.match(input.title, /Action dédiée \+2/);
});
