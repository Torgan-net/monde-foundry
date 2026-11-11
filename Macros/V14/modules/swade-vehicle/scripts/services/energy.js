import { MODULE_ID } from "../constants.js";
import { computePowerMods, powerLabel } from "../rules/energy.js";
import { aeChange } from "./foundry-utils.js";
import { appendJournal } from "./journal.js";
import { shieldInfo } from "./shield.js";

/** Systèmes présents sur le véhicule (on ne peut détourner que d'un système existant). */
export function powerSystems(vehicle) {
  const list = ["propulsion"];
  if (shieldInfo(vehicle)) list.push("shields");
  if (vehicle.items.some((i) => i.type === "weapon" && i.system?.isVehicular)) list.push("weapons");
  return list;
}

export function powerState(vehicle) {
  const st = vehicle?.getFlag(MODULE_ID, "power");
  return st && (st.boost || st.from?.length) ? st : null;
}

/** Modificateurs dérivés de l'état d'énergie. */
export function powerMods(vehicle) {
  return computePowerMods(powerState(vehicle));
}

/** Effet actif « Gestion de l'énergie » : porte le modificateur de Maniabilité. */
export async function syncPowerEffect(vehicle) {
  const { handling } = powerMods(vehicle);
  const existing = vehicle.effects.find((e) => e.getFlag(MODULE_ID, "power"));
  if (!handling) { if (existing) await existing.delete(); return; }
  const changes = [aeChange("system.handling", "add", handling)];
  if (existing) await existing.update({ changes });
  else await vehicle.createEmbeddedDocuments("ActiveEffect", [{ name: "Gestion de l'énergie", img: "icons/svg/lightning.svg", changes, flags: { [MODULE_ID]: { power: true } } }]);
}

export async function setPower(vehicle, state, who) {
  if (state) await vehicle.setFlag(MODULE_ID, "power", { ...state, by: who ?? "", t: Date.now() });
  else await vehicle.unsetFlag(MODULE_ID, "power");
  await syncPowerEffect(vehicle);
  await appendJournal(vehicle, [state ? `Énergie : ${powerLabel(state)}${who ? " (" + who + ")" : ""}` : "Énergie : répartition normale rétablie"]);
}

/* ------------------------------------------------------------------ */
/* Joker à l'initiative                                                 */
/* ------------------------------------------------------------------ */
/*
 * Quand un véhicule tire un Joker : chaque Joker (personnage) à bord des véhicules alliés
 * (même disposition de jeton) reçoit un Jeton, et seul le pilote du véhicule bénéficie du +2
 * aux jets de trait et de dégâts lancés depuis la fiche. Les personnages qui sont eux-mêmes
 * combattants sont laissés à la règle native du système.
 */
