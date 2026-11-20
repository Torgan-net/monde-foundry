/**
 * Règle pure : décalage à appliquer au panneau des états du HUD pour qu'il reste à l'écran.
 * Aucune référence à game, foundry, ui, CONFIG, Hooks ni au DOM.
 */

/**
 * @param {object} p
 * @param {{left:number, top:number, right:number, bottom:number}} p.rect  position du panneau (px écran)
 * @param {{width:number, height:number}} p.viewport  taille de la fenêtre
 * @param {number} [p.rightLimit]  bord droit utilisable (ex. bord gauche de la barre latérale)
 * @param {number} [p.margin=8]  marge minimale avec les bords
 * @param {number} [p.topMargin=40]  place réservée en haut (onglet « effacer tout » de Monk's Little Details)
 * @returns {{dx:number, dy:number}} décalage en px écran
 */
export function computePaletteShift({ rect, viewport, rightLimit, margin = 8, topMargin = 40 }) {
  const right = Math.min(viewport.width, rightLimit ?? viewport.width);
  const bottom = viewport.height;

  let dx = 0;
  let dy = 0;
  if (rect.right > right - margin) dx = right - margin - rect.right;
  if (rect.left + dx < margin) dx = margin - rect.left;          // le bord gauche l'emporte
  if (rect.bottom > bottom - margin) dy = bottom - margin - rect.bottom;
  if (rect.top + dy < topMargin) dy = topMargin - rect.top;      // le haut l'emporte

  return { dx, dy };
}

/**
 * Convertit un décalage écran en valeur CSS `translate` dans le repère du panneau,
 * qui peut être mis à l'échelle (zoom du canevas, Token HUD Scale).
 * @returns {string} "Xpx Ypx", ou "" si aucun décalage
 */
export function toLocalTranslate({ dx, dy }, scale) {
  if (!dx && !dy) return "";
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return `${dx / s}px ${dy / s}px`;
}
