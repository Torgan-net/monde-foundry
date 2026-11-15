import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleForSize, woundsForSize, scaleName, scaleText } from "../../scripts/rules/size.js";

test("Modificateur d'Échelle d'après la Taille (table des Tailles), étendu au-delà de 20", () => {
  // Minuscule −4 ; Très petit −3 ; Petit −2 ; Normal −1 à 3 ; Grand 4–7 ; Énorme 8–11 ; Gigantesque 12+.
  const cases = [[-4, -6], [-3, -4], [-2, -2], [-1, 0], [0, 0], [3, 0], [4, 2], [7, 2], [8, 4], [11, 4], [12, 6], [15, 6], [21, 6], [44, 6]];
  for (const [size, scale] of cases) assert.equal(scaleForSize(size), scale, `Taille ${size}`);
});

test("Blessures max d'après la Taille, jusqu'à Gargantuesque +3 (CSF)", () => {
  const cases = [[0, 3], [3, 3], [4, 4], [7, 4], [8, 5], [11, 5], [12, 6], [20, 6], [21, 8], [28, 8], [29, 10], [36, 10], [37, 12], [44, 12]];
  for (const [size, wounds] of cases) assert.equal(woundsForSize(size), wounds, `Taille ${size}`);
});

test("Nom de l'Échelle et modificateur affichés ensemble", () => {
  const cases = [[-6, "Minuscule"], [-4, "Très petit"], [-2, "Petit"], [0, "Normal"], [2, "Grand"], [4, "Énorme"], [6, "Gigantesque"]];
  for (const [mod, name] of cases) assert.equal(scaleName(mod), name);
  assert.equal(scaleName(3), null); // valeur forcée hors table
  assert.equal(scaleText(6), "Gigantesque (+6)");
  assert.equal(scaleText(-4), "Très petit (−4)");
  assert.equal(scaleText(0), "Normal (0)");
  assert.equal(scaleText(3), "modificateur +3");
});

test("Saisie de la Taille : négative autorisée jusqu'à −4 (scooter, planche à roulettes…)", async () => {
  const { techValue } = await import("../../scripts/rules/numbers.js");
  assert.equal(techValue("size", "-2"), -2);
  assert.equal(techValue("size", "−3"), -3);
  assert.equal(techValue("size", "-9"), -4);   // Minuscule : Taille −4 au plus petit
  assert.equal(techValue("size", "21"), 21);
  assert.equal(techValue("int", "-2"), 0);     // les autres valeurs restent positives
  assert.equal(techValue("signed", "-2"), -2);
  assert.equal(techValue("text", "  Frégate "), "Frégate");
  assert.equal(scaleForSize(-2), -2);
});
