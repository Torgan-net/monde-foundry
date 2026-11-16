import { test } from "node:test";
import assert from "node:assert/strict";
import { findMultiActionField, isRollDialog } from "../../scripts/integrations/roll-dialog.js";

// Faux DOM minimal reprenant le dump de la fenêtre RollDialog de SWADE (16/11/2026).
const radio = (value) => ({ tagName: "INPUT", type: "radio", name: "map", value, checked: value === "0",
  events: [], dispatchEvent(e) { this.events.push(e.type); } });
const root = (els) => ({ querySelectorAll: (sel) => els.filter((e) => sel.includes(e.tagName === "SELECT" ? "select" : "input")) });

test("RollDialog SWADE : radios « map » 0 / −2 / −4", () => {
  const radios = ["0", "-2", "-4"].map(radio);
  const others = [{ tagName: "INPUT", type: "text", name: "", value: "" },
    { tagName: "SELECT", name: "messageMode", type: "select-one", value: "public", options: [{ value: "public", text: "Public" }] }];
  const f = findMultiActionField(root([...radios, ...others]));
  assert.ok(f);
  assert.equal(f.set(2), true);
  assert.equal(radios[1].checked, true);
  assert.equal(radios[0].checked, false);
  assert.deepEqual(radios[1].events, ["change"]);
  assert.equal(f.set(3), true);
  assert.equal(radios[2].checked, true);
  assert.equal(radios[1].checked, false);
});

test("variante select (au cas où) : valeurs −2 / −4", () => {
  const sel = { tagName: "SELECT", name: "whatever", value: "0",
    options: [{ value: "0", text: "Aucune" }, { value: "-2", text: "2" }, { value: "-4", text: "3" }],
    events: [], dispatchEvent(e) { this.events.push(e.type); } };
  const f = findMultiActionField(root([sel]));
  assert.equal(f.set(2), true);
  assert.equal(sel.value, "-2");
});

test("aucun champ reconnu → null", () => {
  assert.equal(findMultiActionField(root([{ tagName: "INPUT", type: "text", name: "rof", value: "1" }])), null);
});

test("seules les fenêtres de jet sont visées", () => {
  assert.equal(isRollDialog("RollDialog"), true);
  assert.equal(isRollDialog("RollTableDirectory"), false);
  assert.equal(isRollDialog("RollTableConfig"), false);
  assert.equal(isRollDialog("ChasePanel"), false);
});

import { injectModifiers, formatModValue } from "../../scripts/integrations/roll-dialog.js";

// Faux RollDialog (dump SWADE Tools 4.1.4 / SWADE 6) : ligne « Ajout » = 2 champs texte + bouton.
function fakeDialog() {
  const added = [];
  const label = { className: "new-modifier-label", value: "", dispatchEvent() {} };
  const value = { className: "new-modifier-value", value: "", dispatchEvent() {} };
  const button = { className: "add-modifier", click() { added.push({ label: label.value, value: value.value }); label.value = ""; value.value = ""; } };
  const root = { querySelector: (sel) => ({ ".new-modifier-label": label, ".new-modifier-value": value, ".add-modifier": button })[sel] ?? null };
  return { root, added };
}

test("valeur d'un modificateur au format de la fenêtre (+2 / -2)", () => {
  assert.equal(formatModValue(2), "+2");
  assert.equal(formatModValue(-4), "-4");
  assert.equal(formatModValue(0), "0");
});

test("modificateurs de poursuite ajoutés un par un dans la ligne « Ajout »", async () => {
  const { root, added } = fakeDialog();
  const ok = await injectModifiers(() => root, [
    { label: "Action dédiée", value: 2 },
    { label: "Carte de poursuite (Carreau)", value: -2 }
  ], { delay: 0 });
  assert.equal(ok, true);
  assert.deepEqual(added, [
    { label: "Action dédiée", value: "+2" },
    { label: "Carte de poursuite (Carreau)", value: "-2" }
  ]);
});

test("ligne « Ajout » absente → false (le joueur est prévenu)", async () => {
  assert.equal(await injectModifiers(() => ({ querySelector: () => null }), [{ label: "x", value: 1 }], { delay: 0 }), false);
  assert.equal(await injectModifiers(() => null, [], { delay: 0 }), true);   // rien à ajouter
});
