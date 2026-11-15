import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs, makeCombat, makeCombatant, DEFAULT_ICON } from "../helpers/foundry-stubs.js";
import { getLeader, groupOf, syncGroup, groupsToSyncForCombatant } from "../../scripts/services/groups.js";
import { WRITE_FLAG } from "../../scripts/constants.js";

beforeEach(() => installFoundryStubs());

function scene() {
  const elharn = makeCombatant({ id: "c1", name: "Elharn", img: "elharn.png", group: "g1" });
  const bob = makeCombatant({ id: "c2", name: "Bob", img: "bob.png", group: "g1" });
  const combat = makeCombat({
    combatants: [elharn, bob],
    groups: [{ id: "g1", name: "Groupe de combattants", leader: "c1" }]
  });
  return { combat, elharn, bob, group: combat.groups.get("g1") };
}

test("getLeader : retrouve le combattant meneur", () => {
  const { group, elharn } = scene();
  assert.equal(getLeader(group), elharn);
});

test("getLeader : null sans meneur ou meneur absent du combat", () => {
  const { group } = scene();
  group.system.leader = null;
  assert.equal(getLeader(group), null);
  group.system.leader = "inconnu";
  assert.equal(getLeader(group), null);
});

test("groupOf : accepte un identifiant ou un document", () => {
  const { group, elharn } = scene();
  assert.equal(groupOf(elharn), group);
  elharn.group = group;
  assert.equal(groupOf(elharn), group);
  elharn.group = null;
  assert.equal(groupOf(elharn), null);
});

test("syncGroup : écrit nom et image du meneur, marqué comme écriture du module", async () => {
  const { group } = scene();
  await syncGroup(group);
  assert.equal(group.writes.length, 1);
  assert.deepEqual(group.writes[0].changes, { name: "Groupe d'Elharn", img: "elharn.png" });
  assert.equal(group.writes[0].options[WRITE_FLAG], true);
});

test("syncGroup : image du token puis de l'acteur en repli", async () => {
  const { group, elharn } = scene();
  elharn.img = null;
  elharn.token = { texture: { src: "anim.webm" } };
  elharn.actor = { img: "portrait.png" };
  await syncGroup(group);
  assert.equal(group.writes[0].changes.img, "portrait.png");
});

test("syncGroup : aucune écriture si rien ne change", async () => {
  const { group } = scene();
  await syncGroup(group);
  await syncGroup(group);
  assert.equal(group.writes.length, 1);
});

test("syncGroup : seul le MJ actif écrit", async () => {
  installFoundryStubs({ isGM: false });
  const { group } = scene();
  await syncGroup(group);
  assert.equal(group.writes.length, 0);
});

test("syncGroup : sans meneur, l'icône SWADE par défaut revient", async () => {
  const { group } = scene();
  group.img = "elharn.png";
  group.system.leader = null;
  await syncGroup(group);
  assert.deepEqual(group.writes[0].changes, { img: DEFAULT_ICON });
});

test("groupsToSyncForCombatant : groupe actuel + groupe qu'il menait", () => {
  const { combat, elharn, group } = scene();
  const other = makeCombat({ groups: [{ id: "g2", name: "Groupe de X", leader: "c1" }] }).groups.get("g2");
  other.parent = combat;
  combat.groups.set("g2", other);
  const list = groupsToSyncForCombatant(elharn);
  assert.deepEqual(list.map((g) => g.id).sort(), ["g1", "g2"]);
  assert.ok(list.includes(group));
});

test("groupsToSyncForCombatant : combattant hors groupe et non meneur → rien", () => {
  const { bob } = scene();
  bob.group = null;
  assert.deepEqual(groupsToSyncForCombatant(bob), []);
});
