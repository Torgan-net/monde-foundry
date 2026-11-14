/** Règles liées à la Taille. Règles pures. */

/**
 * Modificateur d'Échelle d'après la Taille (table des Tailles du livre de base), +6 au-delà de 12.
 * Le système SWADE range ce modificateur dans system.scale.
 */
export function scaleForSize(size) {
  const n = Number(size) || 0;
  if (n <= -4) return -6;
  if (n === -3) return -4;
  if (n === -2) return -2;
  if (n <= 3) return 0;
  if (n <= 7) return 2;
  if (n <= 11) return 4;
  return 6;
}

const SCALE_NAMES = { "-6": "Minuscule", "-4": "Très petit", "-2": "Petit", "0": "Normal", "2": "Grand", "4": "Énorme", "6": "Gigantesque" };

/** Nom de l'Échelle pour un modificateur (null hors table, ex. valeur forcée). */
export function scaleName(mod) {
  return SCALE_NAMES[String(Number(mod) || 0)] ?? null;
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** « Gigantesque (+6) » : nom de l'Échelle et modificateur, pour ne pas confondre les deux. */
export function scaleText(mod) {
  const n = Number(mod) || 0;
  const name = scaleName(n);
  return name ? `${name} (${signed(n)})` : `modificateur ${signed(n)}`;
}

/**
 * Blessures max d'après la Taille : 3 de base, +1 Grand (4–7), +2 Énorme (8–11), +3 Gigantesque (12–20),
 * puis 8, 10 et 12 pour Gigantesque +1 (21–28), +2 (29–36) et +3 (37+) du Compagnon Science-Fiction.
 */
export function woundsForSize(size) {
  const n = Number(size) || 0;
  if (n >= 37) return 12;
  if (n >= 29) return 10;
  if (n >= 21) return 8;
  return 3 + (n >= 12 ? 3 : n >= 8 ? 2 : n >= 4 ? 1 : 0);
}
