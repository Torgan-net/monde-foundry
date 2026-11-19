import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeStartedCombat, makeCombatant, makeRow } from "../helpers/foundry-stubs.js";
import {
  combatantFromRow, canSetActive, setActiveCombatant, activeCombatantMenuEntry
} from "../../scripts/services/turns.js";
import { WRITE_FLAG } from "../../scripts/constants.js";

beforeEach(() => installFoundryStubs());

function scene(options = {}) {
  const ada = makeCombatant({ id: "ada", name: "Ada" });
  const bran = makeCombatant({ id: "bran", name: "Bran", group: "g1" });
  const cole = makeCombatant({ id: "cole", name: "Cole", group: "g1" });
  const combat = makeStartedCombat({
    combatants: [ada, bran, cole],
    groups: [{ id: "g1", name: "Groupe de Bran", leader: "bran" }],
    order: ["bran", "ada", "cole"],
    turn: 1,
    ...options
  });
  return { combat, ada, bran, cole };
}

test("combatantFromRow : ligne de combattant", () => {
  const { combat, cole } = scene();
  assert.equal(combatantFromRow(combat, makeRow({ combatantId: "cole" })), cole);
});

test("combatantFromRow : en-tête de groupe → meneur", () => {
  const { combat, bran } = scene();
  assert.equal(combatantFromRow(combat, makeRow({ groupId: "g1" })), bran);
});

test("combatantFromRow : id de groupe porté par l'image de l'en-tête", () => {
  const { combat, bran } = scene();
  assert.equal(combatantFromRow(combat, makeRow({ nestedGroupId: "g1" })), bran);
});

test("combatantFromRow : élément sans identifiant → null", () => {
  const { combat } = scene();
  assert.equal(combatantFromRow(combat, makeRow()), null);
});

test("setActiveCombatant : écrit le tour, marqué comme écriture du module", async () => {
  const { combat, bran } = scene();
  assert.equal(await setActiveCombatant(bran), true);
  assert.equal(combat.writes.length, 1);
  assert.deepEqual(combat.writes[0].changes, { turn: 0 });
  assert.equal(combat.writes[0].options.direction, -1);
  assert.equal(combat.writes[0].options[WRITE_FLAG], true);
});

test("setActiveCombatant : suiveur absent de l'ordre → curseur sur le meneur", async () => {
  const { combat, cole } = scene({ order: ["ada", "bran"], turn: 0 });
  await setActiveCombatant(cole);
  assert.deepEqual(combat.writes[0].changes, { turn: 1 });
});

test("setActiveCombatant : aucune écriture si déjà actif", async () => {
  const { combat, ada } = scene();
  assert.equal(await setActiveCombatant(ada), false);
  assert.equal(combat.writes.length, 0);
});

test("setActiveCombatant : un joueur ne peut pas déplacer le curseur", async () => {
  installFoundryStubs({ isGM: false });
  const { combat, bran } = scene();
  assert.equal(await setActiveCombatant(bran), false);
  assert.equal(combat.writes.length, 0);
});

test("setActiveCombatant : combat non lancé → aucune écriture", async () => {
  const { combat, bran } = scene({ started: false });
  assert.equal(await setActiveCombatant(bran), false);
  assert.equal(combat.writes.length, 0);
});

test("canSetActive : vrai pour un autre combattant, faux pour le combattant actif", () => {
  const { ada, bran } = scene();
  assert.equal(canSetActive(bran), true);
  assert.equal(canSetActive(ada), false);
  assert.equal(canSetActive(null), false);
});

test("entrée de menu : masquée sur le combattant actif, visible sur les autres", () => {
  const { combat } = scene();
  const entry = activeCombatantMenuEntry({ viewed: combat });
  assert.equal(entry.visible(makeRow({ combatantId: "ada" })), false);
  assert.equal(entry.visible(makeRow({ combatantId: "bran" })), true);
  assert.equal(entry.visible(makeRow({ groupId: "g1" })), true);
});

test("entrée de menu : sans combat affiché, masquée", () => {
  const entry = activeCombatantMenuEntry({ viewed: null });
  assert.equal(entry.visible(makeRow({ combatantId: "bran" })), false);
});

test("entrée de menu : le clic déplace le curseur (signature v14 : event, target)", async () => {
  const { combat } = scene();
  const entry = activeCombatantMenuEntry({ viewed: combat });
  await entry.onClick({}, makeRow({ groupId: "g1" }));
  assert.deepEqual(combat.writes[0].changes, { turn: 0 });
});

// --- 1.2.1 : ajout direct dans la classe du suivi (nom de hook inconnu) ---
import { patchTrackerMenus, MENU_LABEL } from "../../scripts/services/turns.js";

function makeTrackerClass() {
  class Base {
    _getEntryContextOptions() { return [{ label: "Mettre à jour le combattant" }]; }
    _getCombatContextOptions() { return [{ label: "Réinitialiser" }]; }
  }
  class SwadeTracker extends Base {
    _getGroupContextOptions() { return [{ label: "Dissoudre le groupe" }]; }
  }
  return SwadeTracker;
}

test("patchTrackerMenus : ajoute l'entrée aux menus combattant et groupe, pas au menu du combat", () => {
  const Cls = makeTrackerClass();
  const patched = patchTrackerMenus(Cls);
  assert.deepEqual(patched.sort(), ["_getEntryContextOptions", "_getGroupContextOptions"]);
  const t = new Cls();
  assert.ok(t._getEntryContextOptions().some((e) => e.label === MENU_LABEL));
  assert.ok(t._getGroupContextOptions().some((e) => e.label === MENU_LABEL));
  assert.ok(!t._getCombatContextOptions().some((e) => e.label === MENU_LABEL));
});

test("patchTrackerMenus : idempotent, une seule entrée même appliqué deux fois", () => {
  const Cls = makeTrackerClass();
  patchTrackerMenus(Cls);
  patchTrackerMenus(Cls);
  const items = new Cls()._getEntryContextOptions();
  assert.equal(items.filter((e) => e.label === MENU_LABEL).length, 1);
});

test("patchTrackerMenus : classe absente → rien", () => {
  assert.deepEqual(patchTrackerMenus(null), []);
});
