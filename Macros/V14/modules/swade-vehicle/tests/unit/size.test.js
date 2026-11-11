import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleForSize, woundsForSize } from "../../scripts/rules/size.js";

test("Échelle d'après la Taille (livre de base), étendue au-delà de 20", () => {
  const cases = [[-4, -6], [-3, -4], [-2, -4], [-1, -2], [0, 0], [3, 0], [4, 2], [7, 2], [8, 4], [11, 4], [12, 6], [15, 6], [21, 6], [44, 6]];
  for (const [size, scale] of cases) assert.equal(scaleForSize(size), scale, `Taille ${size}`);
});

test("Blessures max d'après la Taille, jusqu'à Gargantuesque +3 (CSF)", () => {
  const cases = [[0, 3], [3, 3], [4, 4], [7, 4], [8, 5], [11, 5], [12, 6], [20, 6], [21, 8], [28, 8], [29, 10], [36, 10], [37, 12], [44, 12]];
  for (const [size, wounds] of cases) assert.equal(woundsForSize(size), wounds, `Taille ${size}`);
});
