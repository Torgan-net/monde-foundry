/**
 * Mode de déplacement déduit (le MJ peut le forcer) :
 * - acteur véhicule : d'après sa compétence de manœuvre (Pilotage → avion / vaisseau, Navigation → bateau,
 *   Équitation → chariot tiré par des bêtes, sinon Conduite) ;
 * - personnage avec une monture associée : monté ;
 * - sinon : à pied.
 * Règles pures.
 */
const BY_SKILL = [
  [/^(piloting|pilotage)$/i, "air"],
  [/^(boating|navigation)$/i, "boat"],
  [/^(riding|[ée]quitation)$/i, "mounted"],
  [/^(driving|conduite)$/i, "vehicle"]
];

export function deduceMode({ isVehicle = false, vehicleSkill = null, hasMount = false } = {}) {
  if (isVehicle) {
    const key = String(vehicleSkill ?? "").trim();
    for (const [re, mode] of BY_SKILL) if (re.test(key)) return mode;
    return "vehicle";
  }
  return hasMount ? "mounted" : "foot";
}
