/**
 * Jets opposés de Manœuvre (Repousser, Éperonner, Aborder). Règles pures.
 * L'attaquant doit obtenir un Succès et battre le total du défenseur (égalité : le défenseur l'emporte) ;
 * Prouesse : 4 de plus que le défenseur.
 */

/**
 * @param {{total:number, isCritfail?:boolean}|null} attacker
 * @param {{total:number, isCritfail?:boolean}|null} defender
 * @returns {"critfail"|"lose"|"win"|"raise"|null}
 */
export function opposedOutcome(attacker, defender) {
  if (!attacker || !defender || typeof attacker.total !== "number" || typeof defender.total !== "number") return null;
  if (attacker.isCritfail) return "critfail";
  if (attacker.total < 4 || attacker.total <= defender.total) return "lose";
  return attacker.total >= defender.total + 4 ? "raise" : "win";
}

/** Repousser : victoire → Bousculé ; Prouesse → + Échec critique de Manœuvre ; Échec critique → se retourne contre l'assaillant. */
export function pushResult(outcome) {
  return {
    bumpDefender: outcome === "win" || outcome === "raise",
    defenderCritical: outcome === "raise",
    bumpAttacker: outcome === "critfail"
  };
}

/** Aborder : victoire → bord à bord ; les défenseurs désignés commencent En attente, sauf Prouesse de l'attaquant. */
export function boardResult(outcome) {
  const boarded = outcome === "win" || outcome === "raise";
  return { boarded, defendersOnHold: outcome === "win" };
}

/** Éperonner : succès → dégâts mutuels ; Prouesse → +d6 aux dégâts de l'attaquant. */
export function ramResult(outcome) {
  const hit = outcome === "win" || outcome === "raise";
  return { hit, attackerBonusD6: outcome === "raise" };
}
