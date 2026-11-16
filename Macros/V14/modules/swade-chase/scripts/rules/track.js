/**
 * Piste de poursuite : ordre des cartes et rattachement des jetons. Géométrie pure.
 * Cartes : { id, suit, value, x, y, w, h } avec x, y = coin supérieur gauche (constaté pour CCM).
 * Jetons : { x, y, w, h } en pixels.
 */

const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Ordonne la piste : on part de la carte la plus à gauche (règle : l'unité la plus en arrière
 * est sur la première carte en partant de la gauche), puis on enchaîne la plus proche.
 * @returns {Array<object & {index:number, cx:number, cy:number}>}
 */
export function orderTrack(cards) {
  if (!cards?.length) return [];
  const rest = cards.map((c) => ({ ...c, ...((p) => ({ cx: p.x, cy: p.y }))(center(c)) }));
  rest.sort((a, b) => (a.cx - b.cx) || (a.cy - b.cy));
  const ordered = [rest.shift()];
  while (rest.length) {
    const last = ordered[ordered.length - 1];
    let best = 0, bestD = Infinity;
    rest.forEach((c, i) => {
      const d = Math.hypot(c.cx - last.cx, c.cy - last.cy);
      if (d < bestD) { bestD = d; best = i; }
    });
    ordered.push(rest.splice(best, 1)[0]);
  }
  return ordered.map((c, index) => ({ ...c, index }));
}

/** Distance d'un point à un rectangle (0 s'il est dedans). */
function pointRectDistance(p, r) {
  const dx = Math.max(0, r.x - p.x, p.x - (r.x + r.w));
  const dy = Math.max(0, r.y - p.y, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Rattache un jeton à une carte de la piste. La marge dépend de la taille du jeton : un véhicule
 * (2 × 2, 3 × 3…) peut déborder de sa carte sans être considéré hors piste.
 * - Hors piste « before » / « after » : le jeton entier dépasse le bord extérieur de la première
 *   ou de la dernière carte, le long de l'axe de la piste.
 * - Hors piste « far » : le centre du jeton est à plus d'une hauteur de carte + un demi-jeton de toute carte.
 * - Carte retenue : la plus proche du centre du jeton.
 * - Ambigu : la deuxième carte la plus proche l'est presque autant (écart < 15 % de la largeur d'une carte).
 * @returns {{onTrack:boolean, reason?:string, index?:number, card?:object, ambiguous?:boolean, alternative?:number|null}}
 */
export function locateOnTrack(track, rect, { ambiguityRatio = 0.15, farRatio = 1 } = {}) {
  if (!track?.length) return { onTrack: false, reason: "no-track" };
  const p = center(rect);

  if (track.length >= 2) {
    const first = track[0], last = track[track.length - 1];
    const vx = last.cx - first.cx, vy = last.cy - first.cy;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      const ux = vx / len, uy = vy / len;
      const half = (r) => Math.abs(ux) * r.w / 2 + Math.abs(uy) * r.h / 2;
      const s = (p.x - first.cx) * ux + (p.y - first.cy) * uy;
      const margin = half(rect);
      if (s + margin < -half(first)) return { onTrack: false, reason: "before" };
      if (s - margin > len + half(last)) return { onTrack: false, reason: "after" };
    }
  }

  const dists = track.map((c) => ({ c, d: pointRectDistance(p, c) })).sort((a, b) => a.d - b.d);
  const best = dists[0], second = dists[1];
  const tokenHalf = Math.max(rect.w, rect.h) / 2;
  if (best.d > best.c.h * farRatio + tokenHalf) return { onTrack: false, reason: "far" };
  const ambiguous = !!second && (second.d - best.d) < best.c.w * ambiguityRatio;
  return {
    onTrack: true, index: best.c.index, card: best.c,
    ambiguous, alternative: ambiguous ? second.c.index : null
  };
}
