/**
 * Jets de Manœuvre : jet natif SWADE (Jetons, Joker, malus de blessures conservés) ou SWADE Tools.
 * Véhicule : swade-vehicle (Maniabilité et Blessures du véhicule incluses).
 */
import { MODULE_ID, MODES } from "../constants.js";
import { rollerMode, rollSkillWithSwadeTools, tagNextRoll } from "../integrations/swade-tools.js";
import { armMultiAction, disarm } from "../integrations/roll-dialog.js";
import { mountFatigueMod } from "../rules/complication.js";
import { mountOf } from "./mount.js";

export function findManeuverSkill(actor, mode) {
  const def = MODES[mode] ?? MODES.foot;
  const skills = actor?.items?.filter((i) => i.type === "skill") ?? [];
  return skills.find((i) => i.system?.swid === def.swid)
    ?? skills.find((i) => def.names.some((n) => n.localeCompare(i.name, "fr", { sensitivity: "base" }) === 0))
    ?? null;
}

/**
 * Lance le jet de Manœuvre d'un combattant.
 * @param {Combatant} combatant
 * @param {string} mode
 * @param {{label:string, value:number}[]} mods
 * @param {string} title libellé du jet (rappel au lanceur)
 * @param {{multiAction?:number}} [options] nombre d'actions prévues : coché dans la fenêtre de jet
 * @returns {Promise<{roll:any, via:string}|null>}
 */
export async function rollManeuver(combatant, mode, mods = [], title = "Jet de Manœuvre", { multiAction = 1 } = {}) {
  let res = null;
  try {
    res = await doRoll(combatant, mode, mods, title, multiAction);
    return res;
  } finally {
    // SWADE Tools peut rendre la main avant d'avoir dessiné sa fenêtre : on laisse alors le premier
    // rendu (ou le délai maximal) désarmer l'ajout des modificateurs.
    if (res?.via !== "swade-tools") disarm();
  }
}

async function doRoll(combatant, mode, mods, title, multiAction) {
  if (mode === "mounted" && combatant?.parent) {
    const fm = mountFatigueMod(mountOf(combatant.parent, combatant)?.actor?.system?.fatigue?.value);
    if (fm) mods = [...mods, fm];
  }
  const actor = combatant?.actor;
  if (!actor) { ui.notifications.warn("Ce combattant n'a pas d'acteur."); return null; }
  if (!actor.isOwner) { ui.notifications.warn("Seul le propriétaire du personnage (ou le MJ) peut lancer ce jet."); return null; }

  const launcher = game.settings.get(MODULE_ID, "launcher");
  const st = (launcher === "swade-tools" || launcher === "auto") ? rollerMode() : "native";

  armMultiAction(multiAction);
  if (actor.type === "vehicle") {
    const api = game.modules.get("swade-vehicle")?.active ? game.modules.get("swade-vehicle").api : null;
    if (api?.rollManeuver) {
      // swade-vehicle lance un jet natif : on le marque pour que SWADE Tools l'habille (ses boutons).
      if (st !== "native") tagNextRoll("skill");
      const roll = await api.rollManeuver(actor, { mods });
      return { roll, via: "swade-vehicle" };
    }
    ui.notifications.warn("Véhicule : lancez le jet de Manœuvre depuis la fiche du pilote (module swade-vehicle absent).");
    return null;
  }

  const skill = findManeuverSkill(actor, mode);
  if (skill && st !== "native") {
    const r = await rollSkillWithSwadeTools(actor, skill, mods, title, multiAction);
    if (r) return r;
    armMultiAction(multiAction);
  }

  if (st !== "native") tagNextRoll("skill");   // jet natif (sans compétence, ou repli) habillé par SWADE Tools
  if (!skill) {
    ui.notifications.info(`${actor.name} n'a pas la compétence ${MODES[mode]?.skill ?? ""} : jet sans compétence (d4−2).`);
    if (typeof actor.makeUnskilledAttempt === "function") {
      const roll = await actor.makeUnskilledAttempt({ additionalMods: mods });
      return { roll, via: "native" };
    }
    return null;
  }
  const roll = await actor.rollSkill(skill.id, { additionalMods: mods });
  return { roll, via: "native" };
}

/** Lit un jet SWADE renvoyé par le pipeline natif, si possible (sinon null : le joueur choisit le résultat). */
export function readRoll(roll) {
  if (!roll || typeof roll.total !== "number") return null;
  return { total: roll.total, isCritfail: !!roll.isCritfail };
}
