/**
 * Calcul des Classes (Heavy Metal, Compagnon Science-Fiction, « Calculating Class »). Règles pures.
 * La Classe n'est JAMAIS lue dans le nom de l'acteur ou de l'objet.
 *  - Arme : dégâts moyens des dés + PA, arrondi au supérieur. Les bonus fixes de la formule
 *    (le « +4 » de 3d6+4) ne sont pas comptés. Seules les armes lourdes ont une Classe.
 *    Le bonus de dégâts des armes liées n'est pas compté (il n'est pas dans system.damage).
 *  - Véhicule : Résistance totale, Armure comprise.
 */

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
export const CLASSE_RE = /\s*\((?:class|classe)\s+([IVX]+)\)\s*/i;

/** Classe d'après une valeur : jusqu'à firstMax = I, puis une Classe par tranche de 10, VII au plus. */
export function classeFromValue(value, firstMax) {
  if (!Number.isFinite(value) || value < 1) return null;
  const index = value <= firstMax ? 0 : Math.min(6, Math.ceil((value - firstMax) / 10));
  return ROMAN[index];
}

/** Moyenne des dés d'une formule de dégâts simple (NdX ± constantes, constantes ignorées). null si non reconnue. */
export function averageDamage(formula) {
  const f = String(formula ?? "").replace(/\s+/g, "").toLowerCase();
  if (!f) return null;
  const terms = f.match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const dice = body.match(/^(\d*)d(\d+)$/);
    if (dice) total += sign * (Number(dice[1] || 1) * (Number(dice[2]) + 1) / 2);
    else if (/^\d+$/.test(body)) continue; // bonus fixe : non compté
    else return null; // @str, x2, etc. : non gérés
  }
  return total;
}

/** Valeur de Classe d'une arme (objet avec system.damage, system.ap, system.isHeavyWeapon), ou null. */
export function weaponClasseValue(item) {
  if (!item?.system?.isHeavyWeapon) return null;
  const avg = averageDamage(item.system.damage);
  if (avg === null) return null;
  return Math.ceil(avg + (Number(item.system.ap) || 0));
}

export function computeWeaponClasse(item) {
  return classeFromValue(weaponClasseValue(item), 20);
}

/** Classe d'un véhicule d'après sa Résistance totale (Armure comprise). */
export function computeVehicleClasse(actor) {
  return classeFromValue(Number(actor?.system?.toughness?.total), 15);
}

/** Retire « (Class IV) » / « (Classe V) » du nom affiché. Affichage seulement. */
export const stripClasse = (name) => (name ?? "").replace(CLASSE_RE, " ").trim();

export const romanToInt = (r) => (r ? ROMAN.indexOf(String(r).toUpperCase()) + 1 : 0);
export const intToRoman = (n) => ROMAN[Math.min(Math.max(n, 1), 7) - 1];
