/** Soutiens multiples d'un poste : règles pures (conversion, compétence par défaut, cumul, effectif). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSupports, defaultSupportSkill, combineSupportBonuses, pendingSupportBonuses, supportCrewCount, SUPPORT_MAX
} from "../../scripts/rules/support.js";

test("Ancien format (un soutien unique) converti en liste", () => {
  const legacy = { id: "p1", support: { enabled: true, label: "Servants", count: 10, die: 8, mod: 1 } };
  assert.deepEqual(normalizeSupports(legacy), [{ id: "legacy", label: "Servants", count: 10, die: 8, mod: 1, skill: "", actor: null }]);
  assert.deepEqual(normalizeSupports({ id: "p2", support: { enabled: false, label: "x" } }), []);
  assert.deepEqual(normalizeSupports({ id: "p3" }), []);
});

test("Nouveau format : liste conservée, valeurs normalisées", () => {
  const poste = { supports: [{ id: "s1", label: "Mécano", actor: "Actor.M", count: "", die: "", mod: "-1", skill: "Repair" }] };
  assert.deepEqual(normalizeSupports(poste), [{ id: "s1", label: "Mécano", count: 0, die: 6, mod: -1, skill: "Repair", actor: "Actor.M" }]);
});

test("Compétence par défaut d'un soutien : celle du poste", () => {
  assert.equal(defaultSupportSkill({ type: "pilote" }, "Piloting"), "Piloting");
  assert.equal(defaultSupportSkill({ type: "artilleur" }, "Piloting"), "Shooting");
  assert.equal(defaultSupportSkill({ type: "autre", skill: "Electronics" }, "Piloting"), "Electronics");
  assert.equal(defaultSupportSkill({ type: "autre", skill: "" }, "Piloting"), null);
});

test("Cumul des bonus de soutien : plafond à +4, échecs critiques déduits", () => {
  assert.equal(combineSupportBonuses([2, 1]), 3);
  assert.equal(combineSupportBonuses([2, 2, 1]), SUPPORT_MAX);
  assert.equal(combineSupportBonuses([2, -2]), 0);
  assert.equal(combineSupportBonuses([-2, -2]), -4);
  assert.equal(combineSupportBonuses([]), 0);
});

test("Bonus en attente : ancien format (un seul) et nouveau format (par soutien)", () => {
  assert.deepEqual(pendingSupportBonuses({ value: 2, label: "Servants" }), [{ id: "legacy", value: 2, label: "Servants" }]);
  assert.deepEqual(pendingSupportBonuses({ s1: { value: 1, label: "A" }, s2: { value: 2, label: "B" } }),
    [{ id: "s1", value: 1, label: "A" }, { id: "s2", value: 2, label: "B" }]);
  assert.deepEqual(pendingSupportBonuses(undefined), []);
});

test("Effectif des soutiens dans l'équipage : un acteur compte au moins pour 1", () => {
  assert.equal(supportCrewCount([{ count: 10 }, { count: 0, actor: "Actor.M" }, { count: 3, actor: "Actor.X" }]), 14);
  assert.equal(supportCrewCount([{ count: -2 }]), 0);
});
