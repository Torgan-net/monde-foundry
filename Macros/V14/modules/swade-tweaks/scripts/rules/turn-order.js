/**
 * Règles pures de l'ordre de tour.
 * Aucune référence à game, foundry, ui, CONFIG ou Hooks.
 */

/**
 * Changement de tour nécessaire pour placer le curseur sur un combattant.
 * @param {string[]} turnIds  ids des combattants, dans l'ordre de tour
 * @param {number|null} currentTurn  position actuelle du curseur
 * @param {string} targetId  combattant visé
 * @param {string|null} [fallbackId]  repli si le combattant visé n'a pas de tour propre (meneur de son groupe)
 * @returns {{turn: number, direction: 1|-1}|null}  null si rien à changer
 */
export function computeTurnChange(turnIds, currentTurn, targetId, fallbackId = null) {
  let turn = turnIds.indexOf(targetId);
  if (turn < 0 && fallbackId) turn = turnIds.indexOf(fallbackId);
  if (turn < 0 || turn === currentTurn) return null;
  return { turn, direction: turn > (currentTurn ?? -1) ? 1 : -1 };
}
