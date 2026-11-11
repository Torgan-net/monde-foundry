import { MODULE_ID } from "../constants.js";
import { rollViaSwadeTools, rollerMode, tagNextRollForSwadeTools, useSwadeTools } from "../integrations/swade-tools.js";
import { findSkill } from "./foundry-utils.js";

export async function rollTrait(actor, key, mods = [], { rof } = {}) {
  if (!actor) return ui.notifications.warn("Aucun occupant à ce poste.");
  const additionalMods = mods
    .filter((m) => m.value)
    .map((m) => ({ label: m.label, value: m.value }));
  const skill = findSkill(actor, key);
  if (!(rof > 1) && useSwadeTools()) return rollViaSwadeTools(actor, skill, key, mods);
  if (rollerMode() === "swade-tools-native") tagNextRollForSwadeTools("skill");
  const options = { additionalMods };
  if (rof > 1) options.rof = rof;
  if (skill) return actor.rollSkill(skill.id, options);
  if (typeof actor.makeUnskilledAttempt === "function") {
    ui.notifications.info(`${actor.name} n'a pas la compétence « ${key} » : jet sans compétence.`);
    return actor.makeUnskilledAttempt({ additionalMods });
  }
  ui.notifications.warn(`${actor.name} n'a pas la compétence « ${key} ».`);
}

/**
 * Action d'objet par le pipeline natif de SWADE (celui des cartes d'objet du chat) :
 * cadence (dés de Tir), munitions consommées, modificateurs et surcharges de l'action,
 * jets de dégâts. L'occupant du poste sert d'acteur, l'objet reste celui du véhicule.
 * actionId : "formula" (action principale), "damage" (dégâts) ou clé de actions.additional.
 * Renvoie false si le pipeline n'est pas disponible, pour basculer sur le calcul du module.
 */
export async function nativeItemAction(item, actor, actionId, mods = []) {
  warnAmmoSetting(item);
  const helper = game.swade?.itemChatCardHelper ?? game.swade?.ItemChatCardHelper;
  if (!actor || typeof helper?.handleAction !== "function") return false;
  try {
    // 4e argument obligatoire (SWADE 6 lit options.additionalMods).
    await helper.handleAction(item, actor, actionId, { additionalMods: mods });
    console.debug(`${MODULE_ID} | action « ${actionId} » de ${item.name} jouée par le pipeline SWADE pour ${actor.name}`);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | pipeline SWADE en échec pour « ${actionId} », calcul du module à la place`, err);
    return false;
  }
}

/** Décompte de munitions pour le calcul de repli (le pipeline natif s'en charge lui-même). */
/** Réglage « Gestion des munitions » de SWADE (true si absent, pour ne pas bloquer). */
export function ammoManagementOn() {
  try { return game.settings.settings.has("swade.ammoManagement") ? !!game.settings.get("swade", "ammoManagement") : true; }
  catch { return true; }
}

export let ammoWarned = false;

export function warnAmmoSetting(item) {
  if (ammoWarned || !game.user.isGM || !item?.system?.shots || ammoManagementOn()) return;
  ammoWarned = true;
  ui.notifications.info("Les munitions ne sont pas décomptées : activez « Gestion des munitions » (Ammo Management) dans les paramètres du système SWADE.", { permanent: true });
}

export async function consumeShots(item, count) {
  const s = item.system;
  if (!count || !s.shots || !ammoManagementOn()) return true;
  if ((s.currentShots ?? 0) < count) {
    ui.notifications.warn(`${item.name} : munitions insuffisantes (${s.currentShots ?? 0} pour ${count}).`);
    return false;
  }
  await item.update({ "system.currentShots": s.currentShots - count });
  return true;
}
