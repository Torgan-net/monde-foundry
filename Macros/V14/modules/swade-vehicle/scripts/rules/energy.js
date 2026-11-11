/**
 * Gestion de l'énergie (Compagnon Science-Fiction, « Energy Management »). Règles pures.
 * L'opérateur renforce un système et détourne l'énergie d'un ou deux autres :
 *  - Propulsion renforcée : Maniabilité +2 (une source) ou +4 (deux) ; propulsion détournée : −4.
 *  - Boucliers renforcés : encaissement +2 / +4 ; boucliers détournés : −4.
 *  - Armes renforcées : dégâts des armes à énergie +4 / +8 (Heavy Metal : +1 / +2 Blessures) ;
 *    armes détournées : dégâts −4 (Heavy Metal : −1 Blessure).
 * La recharge d'urgence du bouclier détourne l'énergie de la propulsion et des armes (boost « recharge »).
 */

export const POWER_SYSTEMS = { propulsion: "Propulsion", shields: "Boucliers", weapons: "Armes" };

/** Modificateurs d'une répartition { boost, from: [] } (null = répartition normale). */
export function computePowerMods(state) {
  const out = { handling: 0, soak: 0, weaponDamage: 0, weaponWounds: 0 };
  if (!state) return out;
  const n = Math.min(state.from?.length ?? 0, 2);
  const from = new Set(state.from ?? []);
  if (state.boost === "propulsion") out.handling += 2 * n;
  if (from.has("propulsion")) out.handling -= 4;
  if (state.boost === "shields") out.soak += 2 * n;
  if (from.has("shields")) out.soak -= 4;
  if (state.boost === "weapons") { out.weaponDamage += 4 * n; out.weaponWounds += n; }
  if (from.has("weapons")) { out.weaponDamage -= 4; out.weaponWounds -= 1; }
  return out;
}

export function powerLabel(state) {
  if (!state) return null;
  const boosted = { propulsion: "Propulsion renforcée", shields: "Boucliers renforcés", weapons: "Armes renforcées", recharge: "Recharge d'urgence du bouclier" };
  const from = (state.from ?? []).map((k) => (POWER_SYSTEMS[k] ?? k).toLowerCase()).join(" et ");
  return `${boosted[state.boost] ?? state.boost}${from ? ", énergie détournée : " + from : ""}`;
}
