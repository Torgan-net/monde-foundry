import { MODULE_ID } from "../constants.js";
import { fireViaSwadeTools, useSwadeToolsWeapons } from "../integrations/swade-tools.js";
import { stripClasse } from "../rules/classes.js";
import { toInt } from "../rules/numbers.js";
import { actorFromUuid } from "./foundry-utils.js";
import { jokerMods } from "./joker.js";
import { nativeItemAction, rollTrait } from "./rolls.js";
import { takeSupportMods } from "./support.js";

/*
 * Tir d'une arme du véhicule, utilisé par la fiche et par l'API (fireWeapon).
 * Ordre des lanceurs : SWADE Tools (si choisi), pipeline natif de SWADE, puis calcul du module.
 */

/** Tire l'arme avec le tireur donné. Renvoie le lanceur utilisé : "swade-tools", "native" ou "module". */
export async function fireVehicleWeapon(vehicle, weapon, shooter, mods = []) {
  if (useSwadeToolsWeapons()) { await fireViaSwadeTools(vehicle, weapon, shooter, mods); return "swade-tools"; }
  if (await nativeItemAction(weapon, shooter, "formula", mods)) return "native";
  await rollTrait(shooter, weapon.system.actions?.trait || "Shooting", [
    { label: stripClasse(weapon.name), value: toInt(weapon.system.actions?.traitMod) },
    ...mods
  ], { rof: toInt(weapon.system.rof) });
  return "module";
}

/** Acteur désigné par un acteur, un jeton ou un UUID. */
function resolveActor(ref) {
  if (!ref) return null;
  if (typeof ref === "string") return actorFromUuid(ref);
  if (ref instanceof Actor) return ref;
  return ref.actor ?? null;
}

/**
 * Tir par l'API : tireur imposé ou occupant du poste qui porte l'arme. Le poste du tireur apporte
 * son bonus Joker (pilote) et ses soutiens en attente, consommés ; les modificateurs fournis s'ajoutent après.
 * @returns {Promise<{vehicle, weapon, shooter, poste, mods, via}|null>}
 */
export async function fireWeaponFor(vehicle, weaponRef, { shooter = null, mods = [] } = {}) {
  const weapon = vehicle.items.get(typeof weaponRef === "object" ? weaponRef?.id : weaponRef);
  if (!weapon || weapon.type !== "weapon") { ui.notifications.warn(`${vehicle.name} : arme introuvable.`); return null; }
  if ((vehicle.getFlag(MODULE_ID, "crits")?.destroyed ?? []).includes(weapon.id)) {
    ui.notifications.warn(`${stripClasse(weapon.name)} est détruite.`);
    return null;
  }
  const postes = vehicle.getFlag(MODULE_ID, "postes") ?? [];
  const weaponPoste = postes.find((p) => (p.weapons ?? []).includes(weapon.id)) ?? null;
  const actor = shooter ? resolveActor(shooter) : actorFromUuid(weaponPoste?.occupant);
  if (!actor) { ui.notifications.warn(`${stripClasse(weapon.name)} : aucun tireur.`); return null; }
  const poste = postes.find((p) => p.occupant && p.occupant === actor.uuid) ?? null;
  const all = [...jokerMods(vehicle, poste), ...(await takeSupportMods(vehicle, poste)), ...(mods ?? []).filter((m) => m && m.value)];
  const via = await fireVehicleWeapon(vehicle, weapon, actor, all);
  return { vehicle, weapon, shooter: actor, poste, mods: all, via };
}
