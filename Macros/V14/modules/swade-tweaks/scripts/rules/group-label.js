/**
 * Règles pures des groupes du Combat Tracker.
 * Aucune référence à game, foundry, ui, CONFIG ou Hooks.
 */

const VOWEL = /^[aeiouyàâäéèêëîïôöùûü]/i;
const AUTO_NAME = /^Groupe d(e |')/;
const VIDEO = /\.(webm|mp4|m4v|ogv)(\?.*)?$/i;

/**
 * Libellé « Groupe de X » avec élision devant voyelle.
 * Pas d'élision devant h : muet ou aspiré, indécidable automatiquement.
 * @param {string|null|undefined} name
 * @returns {string|null}
 */
export function groupLabel(name) {
  const n = (name ?? "").trim();
  if (!n) return null;
  return VOWEL.test(n) ? `Groupe d'${n}` : `Groupe de ${n}`;
}

/**
 * Vrai pour un libellé automatique (défaut SWADE ou généré par le module).
 * Un nom saisi à la main n'est jamais réécrit.
 * @param {string|null|undefined} name
 */
export function isAutoName(name) {
  return !name || AUTO_NAME.test(name);
}

/**
 * Première image utilisable : non vide et pas une vidéo.
 * @param {...(string|null|undefined)} candidates
 * @returns {string|null}
 */
export function pickImage(...candidates) {
  return candidates.find((src) => src && !VIDEO.test(src)) ?? null;
}

/**
 * Changements à écrire sur un groupe d'après son meneur.
 * @param {{name: string, img: string}} group  état actuel du groupe
 * @param {{name: string, images: string[]}|null} leader  meneur (images par ordre de préférence) ou null
 * @param {string} defaultIcon  icône SWADE par défaut
 * @returns {{name?: string, img?: string}}  objet vide si rien à écrire
 */
export function computeGroupUpdates(group, leader, defaultIcon) {
  const updates = {};

  const img = (leader && pickImage(...leader.images)) || defaultIcon;
  if (img && group.img !== img) updates.img = img;

  if (leader && isAutoName(group.name)) {
    const name = groupLabel(leader.name);
    if (name && group.name !== name) updates.name = name;
  }

  return updates;
}
