import { MODULE_ID, maneuverLabel } from "./constants.js";
import { computeVehicleClasse, computeWeaponClasse } from "./rules/classes.js";
import { powerLabel } from "./rules/energy.js";
import { WARHEADS, resolveHeavyMetal } from "./rules/heavy-metal.js";
import { toInt } from "./rules/numbers.js";
import { applyCritical, applyOutOfControl } from "./services/criticals.js";
import { powerMods, powerState, powerSystems } from "./services/energy.js";
import { heavyMetalCombat, targetClasse } from "./services/heavy-metal.js";
import { vehicleHasJoker } from "./services/joker.js";
import { appendJournal } from "./services/journal.js";
import { rollTrait } from "./services/rolls.js";
import { shieldInfo } from "./services/shield.js";
import { apiCrew, apiCurrentHandling, apiManeuverModifiers, apiPilot, apiPostes, apiWeapons, apiWoundPenalty, asVehicle } from "./services/vehicle.js";
import { setVehicleWounds, vehicleWoundsValue } from "./services/wounds.js";

export const API_VERSION = 1;

export const api = {
  version: API_VERSION,
  // Identification et équipage
  isVehicle: (ref) => !!asVehicle(ref),
  getVehicle: asVehicle,
  getPostes: apiPostes,
  getCrew: apiCrew,
  getPilot: apiPilot,
  getManeuverSkill: (ref) => {
    const key = asVehicle(ref)?.system.driver?.skill || null;
    return key ? { key, label: maneuverLabel(key) } : null;
  },
  // Caractéristiques actuelles
  getCurrentHandling: apiCurrentHandling,
  getWoundPenalty: apiWoundPenalty,
  getManeuverModifiers: apiManeuverModifiers,
  getTopSpeed: (ref) => {
    const v = asVehicle(ref);
    return v ? { value: Number(v.system.topspeed?.value) || 0, unit: v.system.topspeed?.unit || "" } : null;
  },
  getToughness: (ref) => {
    const v = asVehicle(ref);
    return v ? { total: toInt(v.system.toughness?.total), armor: toInt(v.system.toughness?.armor) } : null;
  },
  getWounds: (ref) => {
    const v = asVehicle(ref);
    const w = v?.system.wounds;
    return w ? { value: vehicleWoundsValue(v), max: w.max ?? 0, ignored: w.ignored ?? 0, wrecked: !!v.system.status?.isWrecked } : null;
  },
  setWounds: (ref, value, reason) => { const v = asVehicle(ref); return v ? setVehicleWounds(v, value, reason) : null; },
  hasJoker: (ref) => { const v = asVehicle(ref); return v ? vehicleHasJoker(v) : false; },
  getEnergy: (ref) => {
    const e = asVehicle(ref)?.system.energy;
    return e ? { enabled: !!e.enabled, value: e.value ?? 0, max: e.max ?? 0 } : null;
  },
  getStatus: (ref) => ({ ...(asVehicle(ref)?.system.status ?? {}) }),
  getShield: (ref) => { const v = asVehicle(ref); return v ? shieldInfo(v) : null; },
  getPower: (ref) => {
    const v = asVehicle(ref);
    return v ? { state: powerState(v), label: powerLabel(powerState(v)), mods: powerMods(v), systems: powerSystems(v) } : null;
  },
  getCriticals: (ref) => {
    const c = asVehicle(ref)?.getFlag(MODULE_ID, "crits") ?? {};
    return { handling: c.handling ?? 0, speed: c.speed ?? 0, destroyed: [...(c.destroyed ?? [])] };
  },
  // Classes et armement
  getClasse: (ref) => { const v = asVehicle(ref); return v ? targetClasse(v) : null; },
  getWeapons: apiWeapons,
  getWeaponClasse: (item) => item?.getFlag?.(MODULE_ID, "classe") || computeWeaponClasse(item),
  computeVehicleClasse,
  computeWeaponClasse,
  // Heavy Metal
  isHeavyMetal: (ref) => !!heavyMetalCombat(asVehicle(ref)),
  getHeavyMetalCombat: (ref) => heavyMetalCombat(asVehicle(ref)),
  resolveHeavyMetal,
  WARHEADS,
  // Actions (écrivent sur le véhicule : MJ ou propriétaire)
  rollManeuver: async (ref, { mods = [] } = {}) => {
    const v = asVehicle(ref);
    if (!v) return null;
    const pilot = apiPilot(v);
    const skill = v.system.driver?.skill;
    if (!pilot) { ui.notifications.warn(`${v.name} n'a pas de pilote.`); return null; }
    if (!skill) { ui.notifications.warn(`${v.name} : compétence de manœuvre non définie.`); return null; }
    return rollTrait(pilot, skill, [...apiManeuverModifiers(v), ...mods]);
  },
  applyOutOfControl: (ref) => { const v = asVehicle(ref); return v ? applyOutOfControl(v) : null; },
  applyCritical: (ref, options) => { const v = asVehicle(ref); return v ? applyCritical(v, options) : null; },
  appendJournal: (ref, texts) => { const v = asVehicle(ref); return v ? appendJournal(v, [].concat(texts)) : null; }
};

/* ------------------------------------------------------------------ */
/* Bouclier (Compagnon Science-Fiction)                                 */
/* ------------------------------------------------------------------ */
/*
 * Charges stockées dans la stat additionnelle « shield » du véhicule (si elle existe).
 * Maximum = moitié des Blessures de base (d'après la Taille, avant toute modification), arrondi à l'inférieur.
 * Encaissement : un membre d'équipage dépense une charge par jet d'Électronique, jusqu'à annulation
 * de toutes les Blessures ou épuisement des charges. Recharge d'urgence : jet d'Électronique,
 * réussite = moitié des charges habituelles, Prouesse = toutes.
 */
