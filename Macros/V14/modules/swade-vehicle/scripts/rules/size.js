/** Règles liées à la Taille. Règles pures. */

/** Échelle d'après la Taille (table Taille et Échelle du livre de base), +6 au-delà de 12. */
export function scaleForSize(size) {
  const n = Number(size) || 0;
  if (n <= -4) return -6;
  if (n <= -2) return -4;
  if (n === -1) return -2;
  if (n <= 3) return 0;
  if (n <= 7) return 2;
  if (n <= 11) return 4;
  return 6;
}

/**
 * Blessures max d'après la Taille : 3 de base, +1 Grand (4–7), +2 Énorme (8–11), +3 Gargantuesque (12–20),
 * puis 8, 10 et 12 pour Gargantuesque +1 (21–28), +2 (29–36) et +3 (37+) du Compagnon Science-Fiction.
 */
export function woundsForSize(size) {
  const n = Number(size) || 0;
  if (n >= 37) return 12;
  if (n >= 29) return 10;
  if (n >= 21) return 8;
  return 3 + (n >= 12 ? 3 : n >= 8 ? 2 : n >= 4 ? 1 : 0);
}
