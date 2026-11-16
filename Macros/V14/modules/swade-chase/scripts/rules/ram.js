/**
 * Dégâts d'Éperonner (règles VF). Chaque participant inflige à l'autre :
 * - Échelle de celui qui les provoque : Petit d6, Normal 2d6, Grand 3d6, Énorme 4d6, Gigantesque 5d6 ;
 * - Prouesse : +d6 pour l'attaquant ;
 * - Résistance : +d6 si sa Résistance est plus élevée que celle de l'autre, +2d6 si au moins le double ;
 * - Vitesse : +d6 si sa Vitesse max est entre 90 et 180 km/h, +2d6 au-delà.
 * Règles pures.
 */

const CATEGORIES = [
  { label: "Petit", dice: 1 },
  { label: "Normal", dice: 2 },
  { label: "Grand", dice: 3 },
  { label: "Énorme", dice: 4 },
  { label: "Gigantesque", dice: 5 }
];

/**
 * Catégorie d'Échelle depuis le modificateur d'Échelle SWADE (−6 … +6 ; constaté : system.stats.scale),
 * sinon depuis la Taille (Normal −1 à +3, Grand 4 à 7, Énorme 8 à 11, Gigantesque 12+).
 */
export function scaleCategory({ scale, size } = {}) {
  if (Number.isFinite(scale)) {
    if (scale < 0) return CATEGORIES[0];
    if (scale >= 6) return CATEGORIES[4];
    if (scale >= 4) return CATEGORIES[3];
    if (scale >= 2) return CATEGORIES[2];
    return CATEGORIES[1];
  }
  if (Number.isFinite(size)) {
    if (size <= -2) return CATEGORIES[0];
    if (size >= 12) return CATEGORIES[4];
    if (size >= 8) return CATEGORIES[3];
    if (size >= 4) return CATEGORIES[2];
  }
  return CATEGORIES[1];
}

/**
 * Dégâts infligés par `dealer` à `target`.
 * @param {{dealer:{scale?:number,size?:number,toughness?:number,speedKmh?:number}, target:{toughness?:number}, raise?:boolean}} o
 * @returns {{dice:number, formula:string, parts:{label:string, dice:number}[]}}
 */
export function ramDamage({ dealer = {}, target = {}, raise = false }) {
  const cat = scaleCategory(dealer);
  const parts = [{ label: `Échelle ${cat.label}`, dice: cat.dice }];
  if (raise) parts.push({ label: "Prouesse", dice: 1 });
  const t = Number(dealer.toughness), o = Number(target.toughness);
  if (t > 0 && o > 0 && t > o) parts.push({ label: t >= 2 * o ? "Résistance (au moins double)" : "Résistance supérieure", dice: t >= 2 * o ? 2 : 1 });
  const v = Number(dealer.speedKmh);
  if (v > 180) parts.push({ label: "Vitesse (plus de 180 km/h)", dice: 2 });
  else if (v >= 90) parts.push({ label: "Vitesse (90 à 180 km/h)", dice: 1 });
  const dice = parts.reduce((s, p) => s + p.dice, 0);
  return { dice, formula: `${dice}d6`, parts };
}
