/** Bouclier (Compagnon Science-Fiction). Règles pures. */

import { woundsForSize } from "./size.js";

/** Charges max : moitié des Blessures de base du vaisseau (d'après la Taille), arrondie à l'inférieur. */
export const shieldMaxForSize = (size) => Math.floor(woundsForSize(size) / 2);

/** Blessures annulées par un jet d'encaissement : une par réussite et par Prouesse (contre 4). */
export function soakNegations(total) {
  return Number.isFinite(total) && total >= 4 ? 1 + Math.floor((total - 4) / 4) : 0;
}

/** Charges après une recharge d'urgence : réussite = moitié des charges habituelles, Prouesse = toutes. */
export function emergencyRechargeValue(value, max, outcome) {
  if (outcome === "raise") return max;
  if (outcome === "success") return Math.min(value + Math.floor(max / 2), max);
  return value;
}
