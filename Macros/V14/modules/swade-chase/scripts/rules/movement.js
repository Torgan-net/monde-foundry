/**
 * Déplacements le long de la piste de poursuite. Règles pures.
 * Sens : « vers l'avant » = vers la fin de la piste (index croissant), « vers l'arrière » = vers son début.
 */

/**
 * Carte cible d'un déplacement de `steps` cartes (positif : avant, négatif : arrière).
 * Si la piste est trop courte, on s'arrête au bout et on signale le nombre de cartes à ajouter.
 * @returns {{index:number, overflow:number, side?:"before"|"after"}}
 */
export function moveIndex(length, from, steps) {
  const target = from + steps;
  if (target > length - 1) return { index: length - 1, overflow: target - (length - 1), side: "after" };
  if (target < 0) return { index: 0, overflow: -target, side: "before" };
  return { index: target, overflow: 0 };
}

/** Nouvelle position du jeton : il garde le même décalage par rapport au centre de sa carte. */
export function shiftPosition(pos, fromCard, toCard) {
  return {
    x: Math.round(pos.x + (toCard.cx - fromCard.cx)),
    y: Math.round(pos.y + (toCard.cy - fromCard.cy))
  };
}

const plural = (n) => (n > 1 ? "cartes" : "carte");

/**
 * Choix proposés au joueur : de 1 à `max` cartes vers l'avant et/ou l'arrière, plus « ne pas bouger ».
 * @returns {{steps:number, label:string}[]}
 */
export function moveChoices({ max, forward = true, backward = true, stay = true }) {
  const out = [];
  if (forward) for (let n = max; n >= 1; n--) out.push({ steps: n, label: `Vers l'avant : ${n} ${plural(n)}` });
  if (backward) for (let n = 1; n <= max; n++) out.push({ steps: -n, label: `Vers l'arrière : ${n} ${plural(n)}` });
  if (stay) out.push({ steps: 0, label: "Ne pas bouger" });
  return out;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Place libre la plus proche de `target` (rectangle du jeton déplacé) : on teste la cible, puis des
 * décalages d'une case (`step`) en anneaux croissants. On préfère les décalages perpendiculaires à la
 * piste (`along` : vecteur unitaire de la piste) pour ne pas glisser vers la carte voisine.
 * @returns {{x:number, y:number}}
 */
export function freeSpot(target, occupied, { step = 100, maxRing = 4, along = { x: 1, y: 0 } } = {}) {
  const fits = (x, y) => !occupied.some((o) => overlaps({ x, y, w: target.w, h: target.h }, o));
  if (fits(target.x, target.y)) return { x: target.x, y: target.y };
  const drift = ([dx, dy]) => Math.abs(dx * along.x + dy * along.y);
  for (let r = 1; r <= maxRing; r++) {
    const cands = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cands.push([dx, dy]);
    }
    cands.sort((a, b) => (drift(a) - drift(b)) || (a[1] - b[1]) || (Math.hypot(...a) - Math.hypot(...b)));
    for (const [dx, dy] of cands) {
      const x = target.x + dx * step, y = target.y + dy * step;
      if (fits(x, y)) return { x, y };
    }
  }
  return { x: target.x, y: target.y };
}
