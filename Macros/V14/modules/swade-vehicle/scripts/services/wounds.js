import { MODULE_ID } from "../constants.js";
import { clampVehicleWounds } from "../rules/wounds.js";
import { escapeHTML } from "./foundry-utils.js";

/** Blessures affichées : la valeur système, ou le dépassement mémorisé si le système a plafonné la valeur. */
export function vehicleWoundsValue(vehicle) {
  const stored = vehicle?.system?.wounds?.value ?? 0;
  const over = vehicle?.getFlag?.(MODULE_ID, "woundsOverflow");
  return Number.isFinite(over) && over > stored ? over : stored;
}

/**
 * Fixe les Blessures d'un véhicule. Au-delà du maximum (ex. 6 / 5), le véhicule devient une Épave.
 * La valeur va au plus jusqu'à max + 1. Si le système plafonne la valeur au maximum,
 * le dépassement est mémorisé dans un flag pour l'affichage.
 */
export async function setVehicleWounds(vehicle, value, reason) {
  const w = vehicle.system?.wounds ?? {};
  const max = w.max ?? 0;
  const target = clampVehicleWounds(value, max);
  const wasWrecked = !!vehicle.system?.status?.isWrecked;
  const update = { "system.wounds.value": target };
  if (target > max && !wasWrecked) update["system.status.isWrecked"] = true;
  await vehicle.update(update, { swvReason: reason });
  if (target > max && (vehicle.system?.wounds?.value ?? 0) < target) await vehicle.setFlag(MODULE_ID, "woundsOverflow", target);
  else if (vehicle.getFlag(MODULE_ID, "woundsOverflow") !== undefined) await vehicle.unsetFlag(MODULE_ID, "woundsOverflow");
  if (target > max && !wasWrecked) {
    ui.notifications.warn(`${vehicle.name} est détruit (${target} / ${max} Blessures).`);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: vehicle }),
      content: `<div class="swv-group-card"><h3>${escapeHTML(vehicle.name)} est une épave</h3><p>${target} Blessures pour un maximum de ${max}.</p></div>`
    });
  }
}

export async function addVehicleWounds(vehicle, count, reason) {
  await setVehicleWounds(vehicle, vehicleWoundsValue(vehicle) + count, reason);
}
