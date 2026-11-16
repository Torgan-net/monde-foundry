/**
 * Complications et Échecs critiques de Manœuvre (SWADE VF, Poursuites). Règles pures.
 */
import { SUIT_LABELS } from "./cards.js";

/** Table des Complications : l'enseigne de la CARTE DE POURSUITE fixe le modificateur et la conséquence. */
export const COMPLICATION_TABLE = Object.freeze({
  spades: { mod: 0, failure: "critical", cards: 0 },
  hearts: { mod: 0, failure: "bumped", cards: 1 },
  diamonds: { mod: -2, failure: "bumped", cards: 1 },
  clubs: { mod: -2, failure: "critical", cards: 0 },
  joker: { mod: 2, failure: "bumped", cards: 2 }
});

export const VEHICLE_MODES = Object.freeze(["vehicle", "boat", "air"]);

/**
 * @param {string|null} chaseSuit enseigne de la carte de poursuite de l'unité
 * @param {{cityStreets?:boolean}} [options]
 * @returns {{suit:string, mods:{label:string,value:number}[], failure:"critical"|"bumped", cards:number, failureText:string}|null}
 */
export function complicationFor(chaseSuit, { cityStreets = false } = {}) {
  const row = COMPLICATION_TABLE[chaseSuit];
  if (!row) return null;
  const mods = [];
  if (row.mod) mods.push({ label: `Carte de poursuite (${SUIT_LABELS[chaseSuit]})`, value: row.mod });
  if (cityStreets && chaseSuit !== "joker") mods.push({ label: "Rues de la ville", value: -2 });
  const failureText = row.failure === "critical"
    ? "Échec : traitez comme un Échec critique au jet de Manœuvre."
    : (row.cards === 2
      ? "Échec : l'unité est Bousculée de deux cartes de poursuite."
      : "Échec : l'unité est Bousculée d'une carte de poursuite.");
  return { suit: chaseSuit, mods, failure: row.failure, cards: row.cards, failureText };
}

/** Le résultat d'un Échec critique demande-t-il un dé ? (non pour les véhicules : table des Pertes de contrôle) */
export function needsCriticalDie(mode) {
  return !VEHICLE_MODES.includes(mode);
}

/**
 * Conséquence d'un Échec critique de Manœuvre selon le mode de déplacement.
 * @param {string} mode foot | mounted | vehicle | boat | air
 * @param {number|null} die résultat du dé (d6) ; ignoré pour un véhicule
 * @param {{rooftops?:boolean}} [options]
 * @returns {{key:string, text:string, loseTurn?:boolean, fatigue?:"self"|"mount", outOfControl?:boolean, fall?:boolean}}
 */
export function criticalFailureEffect(mode, die, { rooftops = false } = {}) {
  if (VEHICLE_MODES.includes(mode)) {
    return { key: "outOfControl", outOfControl: true,
      text: "Le conducteur fait un jet sur la table des Pertes de contrôle." };
  }
  if (mode === "mounted") {
    if (die <= 2) return { key: "loseTurn", loseTurn: true, text: "Le cavalier passe son tour." };
    if (die <= 4) return { key: "mountFatigue", fatigue: "mount",
      text: "La monture subit un niveau de Fatigue (il s'applique aussi aux jets d'Équitation du cavalier)." };
    return { key: "riderFatigue", fatigue: "self",
      text: "Le cavalier subit un niveau de Fatigue (mauvais rebond, obstacle bas ou effort excessif)." };
  }
  if (rooftops) {
    if (die <= 2) return { key: "loseTurn", loseTurn: true, text: "Le coureur perd son tour." };
    if (die <= 4) return { key: "fatigue", fatigue: "self", text: "Le coureur subit un niveau de Fatigue." };
    return { key: "fall", fall: true,
      text: "Il dégringole par-dessus le bord : jet d'Athlétisme en action gratuite. Succès : il se rattrape et peut se hisser avec un jet de Force (action gratuite chaque round). Échec : coincé pour le tour. Échec critique : chute de d6 × 10 étages." };
  }
  if (die % 2 === 0) return { key: "loseTurn", loseTurn: true,
    text: "Il perd le reste de son tour (il trébuche, négocie un obstacle ou prend un mauvais virage)." };
  return { key: "fatigue", fatigue: "self", text: "Il subit un niveau de Fatigue." };
}

/**
 * Résultat d'un jet de Trait.
 * @param {{total:number, isCritfail?:boolean, target?:number}|null} roll
 * @returns {"critfail"|"failure"|"success"|"raise"|null}
 */
export function traitOutcome(roll) {
  if (!roll || typeof roll.total !== "number") return null;
  if (roll.isCritfail) return "critfail";
  const target = roll.target ?? 4;
  if (roll.total < target) return "failure";
  if (roll.total >= target + 4) return "raise";
  return "success";
}

/** Fatigue de la monture : elle s'applique aussi aux jets d'Équitation du cavalier (−1 par niveau). */
export function mountFatigueMod(level) {
  const n = Number(level) || 0;
  return n > 0 ? { label: "Fatigue de la monture", value: -n } : null;
}
