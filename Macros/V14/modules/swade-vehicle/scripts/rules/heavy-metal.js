/** Heavy Metal (Compagnon Science-Fiction) : résolution d'une attaque qui a touché. Règle pure. */

import { intToRoman, romanToInt } from "./classes.js";

export const WARHEADS = {
  "": "Aucune",
  ap: "Perforante (AP)",
  emp: "IEM (EMP)",
  he: "Explosive (HE)",
  nuclear: "Nucléaire",
  phase: "Phase",
  plasma: "Plasma"
};


/**
 * Résout une attaque Heavy Metal qui a touché.
 * @param {object} o
 * @param {string} o.weaponClass   Classe de l'arme (I à VII) ; en collision, Classe du véhicule qui percute
 * @param {string} o.targetClass   Classe de la cible (I à VII)
 * @param {boolean} [o.raise]      Prouesse sur le jet d'attaque (ou d'éperonnage)
 * @param {string} [o.warhead]     clé de WARHEADS
 * @param {number} [o.targetArmor] Armure de la cible (ogive perforante)
 * @param {number} [o.d3]          résultat du d3 si un d3 est nécessaire (sinon tiré ici)
 * @returns {{noEffect:boolean, wounds:number, maneuver:boolean, extraCritical:boolean,
 *            electronicsOut:boolean, steps:string[], weaponClass:string, targetClass:string}}
 */
export function resolveHeavyMetal({ weaponClass, targetClass, raise = false, warhead = "", targetArmor = 0, d3, energyWounds = 0 } = {}) {
  let w = romanToInt(weaponClass);
  let t = romanToInt(targetClass);
  if (!w || !t) throw new Error("Classe d'arme ou de cible manquante");
  const steps = [];

  if (warhead === "ap" && targetArmor >= 10 && t > 1) { t -= 1; steps.push(`ogive perforante : cible ramenée en Classe ${intToRoman(t)}`); }
  if (warhead === "phase") { w = Math.min(w + 1, 7); steps.push(`ogive à phase : arme portée en Classe ${intToRoman(w)}`); }

  const diff = w - t;
  if (warhead === "nuclear") {
    steps.push("ogive nucléaire : 10 Blessures");
    return { noEffect: false, wounds: 10, maneuver: true, extraCritical: false, electronicsOut: false,
      steps, weaponClass: intToRoman(w), targetClass: intToRoman(t) };
  }
  if (diff <= -2) {
    steps.push(`Classe ${intToRoman(w)} contre ${intToRoman(t)} : aucun effet`);
    return { noEffect: true, wounds: 0, maneuver: false, extraCritical: false, electronicsOut: false,
      steps, weaponClass: intToRoman(w), targetClass: intToRoman(t) };
  }

  let wounds = 0;
  if (diff === -1) {
    steps.push(`Classe ${intToRoman(w)} contre ${intToRoman(t)} : 0 Blessure`);
  } else {
    const roll = Number.isFinite(d3) ? d3 : Math.ceil(Math.random() * 3);
    wounds = roll + diff;
    steps.push(diff === 0
      ? `Classes égales : d3 = ${roll}`
      : `d3 = ${roll}, +${diff} (arme ${diff} Classe${diff > 1 ? "s" : ""} au-dessus)`);
  }

  if (raise) {
    const bonus = warhead === "plasma" ? 2 : 1;
    wounds += bonus;
    steps.push(`Prouesse : +${bonus}${warhead === "plasma" ? " (plasma)" : ""}`);
  }

  if (energyWounds) {
    wounds = Math.max(0, wounds + energyWounds);
    steps.push(`gestion de l'énergie : ${energyWounds > 0 ? "+" : "−"}${Math.abs(energyWounds)} Blessure${Math.abs(energyWounds) > 1 ? "s" : ""}`);
  }

  let extraCritical = false;
  if (warhead === "he") {
    wounds = Math.max(0, wounds - 1);
    extraCritical = wounds > 0;
    steps.push(`ogive explosive : −1 Blessure${extraCritical ? ", une Dégradation critique supplémentaire" : ""}`);
  }

  let electronicsOut = false;
  if (warhead === "emp" && wounds > 0) {
    electronicsOut = true;
    wounds = Math.max(0, wounds - 2);
    steps.push("ogive IEM : électronique hors service, −2 Blessures");
  }

  steps.push("le pilote de la cible doit réussir un jet de manœuvre, sinon Perte de contrôle");
  return { noEffect: false, wounds, maneuver: true, extraCritical, electronicsOut,
    steps, weaponClass: intToRoman(w), targetClass: intToRoman(t) };
}
