/**
 * Tables de Perte de contrôle et de Dégradations critiques (livre de base). Règles pures.
 * Les effets sont décidés d'après le total du 2d6, indépendamment du texte de la table.
 */

/** Cumul maximal : Maniabilité −4 ; Vitesse −40 % (plancher à 60 %). */
export const CRIT_MAX = { handling: 4, speed: 4 };

/** Dégradations critiques : 2 égratignure, 3 guidage, 4–5 propulsion, 6–8 châssis, 9–10 équipage, 11 arme, 12 système. */
export function criticalOutcome(total) {
  if (total <= 2) return "scratch";
  if (total === 3) return "handling";
  if (total <= 5) return "speed";
  if (total <= 8) return "chassis";
  if (total <= 10) return "crew";
  if (total === 11) return "weapon";
  return "system";
}

/** Perte de contrôle : 2 collision majeure, 3–4 collision mineure, 5–9 Distrait, 10–11 Vulnérable, 12 avarie. */
export function outOfControlOutcome(total) {
  if (total <= 2) return "majorCollision";
  if (total <= 4) return "minorCollision";
  if (total <= 9) return "distracted";
  if (total <= 11) return "vulnerable";
  return "glitch";
}

/** Nouvel état cumulé des Dégradations après un résultat (« handling », « speed » ou « weapon » + id). */
export function addCritical(crits, outcome, weaponId) {
  const c = { handling: crits?.handling ?? 0, speed: crits?.speed ?? 0, destroyed: [...(crits?.destroyed ?? [])] };
  if (outcome === "handling" && c.handling < CRIT_MAX.handling) c.handling += 1;
  if (outcome === "speed" && c.speed < CRIT_MAX.speed) c.speed += 1;
  if (outcome === "weapon" && weaponId && !c.destroyed.includes(weaponId)) c.destroyed.push(weaponId);
  return c;
}

/** Multiplicateur de Vitesse pour n Dégradations de propulsion (−10 % chacune). */
export const speedMultiplier = (speed) => Math.round((1 - Math.min(speed, CRIT_MAX.speed) / 10) * 100) / 100;
