import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLabel, isAutoName, pickImage, computeGroupUpdates } from "../../scripts/rules/group-label.js";

test("groupLabel : « de » devant consonne", () => {
  assert.equal(groupLabel("Brann"), "Groupe de Brann");
});

test("groupLabel : élision devant voyelle, accentuée ou non", () => {
  assert.equal(groupLabel("Elharn"), "Groupe d'Elharn");
  assert.equal(groupLabel("Aliénor"), "Groupe d'Aliénor");
  assert.equal(groupLabel("Éloïse"), "Groupe d'Éloïse");
  assert.equal(groupLabel("yann"), "Groupe d'yann");
});

test("groupLabel : pas d'élision devant h (muet ou aspiré, indécidable)", () => {
  assert.equal(groupLabel("Hugues"), "Groupe de Hugues");
});

test("groupLabel : nom vide ou espaces superflus", () => {
  assert.equal(groupLabel("  Brann "), "Groupe de Brann");
  assert.equal(groupLabel(""), null);
  assert.equal(groupLabel(null), null);
});

test("isAutoName : libellé SWADE par défaut et libellés générés", () => {
  assert.equal(isAutoName("Groupe de combattants"), true);
  assert.equal(isAutoName("Groupe de Elharn"), true);
  assert.equal(isAutoName("Groupe d'Elharn"), true);
  assert.equal(isAutoName(""), true);
  assert.equal(isAutoName(undefined), true);
});

test("isAutoName : un nom saisi à la main est protégé", () => {
  assert.equal(isAutoName("Les Charognards"), false);
  assert.equal(isAutoName("Groupement d'assaut"), false);
});

test("pickImage : première image non vide", () => {
  assert.equal(pickImage(null, "", "a.webp", "b.webp"), "a.webp");
  assert.equal(pickImage(null, undefined), null);
});

test("pickImage : les vidéos sont écartées", () => {
  assert.equal(pickImage("anim.webm", "portrait.png"), "portrait.png");
  assert.equal(pickImage("anim.MP4"), null);
});

test("computeGroupUpdates : groupe SWADE neuf → nom et image du meneur", () => {
  const u = computeGroupUpdates(
    { name: "Groupe de combattants", img: "icons/environment/people/charge.webp" },
    { name: "Elharn", images: ["West%20Marches/Token%20Elharn.png"] },
    "icons/environment/people/charge.webp"
  );
  assert.deepEqual(u, { name: "Groupe d'Elharn", img: "West%20Marches/Token%20Elharn.png" });
});

test("computeGroupUpdates : rien à écrire si déjà à jour", () => {
  const u = computeGroupUpdates(
    { name: "Groupe d'Elharn", img: "e.png" },
    { name: "Elharn", images: ["e.png"] },
    "default.webp"
  );
  assert.deepEqual(u, {});
});

test("computeGroupUpdates : nom manuel conservé, image mise à jour", () => {
  const u = computeGroupUpdates(
    { name: "Les Charognards", img: "default.webp" },
    { name: "Brann", images: ["b.png"] },
    "default.webp"
  );
  assert.deepEqual(u, { img: "b.png" });
});

test("computeGroupUpdates : sans meneur → icône par défaut, nom inchangé", () => {
  const u = computeGroupUpdates(
    { name: "Groupe de Brann", img: "b.png" },
    null,
    "default.webp"
  );
  assert.deepEqual(u, { img: "default.webp" });
});

test("computeGroupUpdates : meneur sans image exploitable → icône par défaut", () => {
  const u = computeGroupUpdates(
    { name: "Groupe de combattants", img: "default.webp" },
    { name: "Brann", images: ["anim.webm", null] },
    "default.webp"
  );
  assert.deepEqual(u, { name: "Groupe de Brann" });
});
