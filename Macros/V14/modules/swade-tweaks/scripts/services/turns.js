/**
 * Accès Foundry pour le curseur du Combat Tracker :
 * redéfinir à la main le combattant actif.
 */
import { computeTurnChange } from "../rules/turn-order.js";
import { getLeader, groupOf } from "./groups.js";
import { WRITE_FLAG } from "../constants.js";

export const MENU_LABEL = "Définir comme combattant actif";
const MENU_ICON = '<i class="fa-solid fa-location-crosshairs"></i>';

/** Changement de tour pour ce combattant, ou null s'il n'y a rien à faire */
function turnChangeFor(combatant) {
  const combat = combatant?.parent;
  if (!combat?.started) return null;
  return computeTurnChange(
    combat.turns.map((c) => c.id),
    combat.turn,
    combatant.id,
    getLeader(groupOf(combatant))?.id ?? null
  );
}

/**
 * Combattant désigné par un élément du suivi de combat :
 * sa ligne, ou le meneur pour un en-tête de groupe.
 * @param {Combat} combat
 * @param {HTMLElement} row
 * @returns {Combatant|null}
 */
export function combatantFromRow(combat, row) {
  const combatantId = row?.closest?.("[data-combatant-id]")?.dataset.combatantId;
  if (combatantId) return combat?.combatants.get(combatantId) ?? null;
  const groupId = row?.closest?.("[data-group-id]")?.dataset.groupId
    ?? row?.querySelector?.("[data-group-id]")?.dataset.groupId;
  return groupId ? getLeader(combat?.groups.get(groupId)) : null;
}

/**
 * Le MJ peut-il placer le curseur sur ce combattant ?
 * @param {Combatant|null} combatant
 */
export function canSetActive(combatant) {
  return !!game.user.isGM && turnChangeFor(combatant) !== null;
}

/**
 * Place le curseur sur un combattant (MJ uniquement).
 * @param {Combatant} combatant
 * @returns {Promise<boolean>}  vrai si le curseur a été déplacé
 */
export async function setActiveCombatant(combatant) {
  if (!game.user.isGM) return false;
  const change = turnChangeFor(combatant);
  if (!change) return false;
  await combatant.parent.update(
    { turn: change.turn },
    { direction: change.direction, [WRITE_FLAG]: true }
  );
  return true;
}

/**
 * Entrée de menu contextuel du suivi de combat.
 * @param {CombatTracker} tracker
 * @returns {ContextMenuEntry}
 */
export function activeCombatantMenuEntry(tracker) {
  return {
    label: MENU_LABEL,
    icon: MENU_ICON,
    visible: (row) => canSetActive(combatantFromRow(tracker.viewed, row)),
    onClick: (_event, row) => setActiveCombatant(combatantFromRow(tracker.viewed, row))
  };
}

/** Ajoute l'entrée à une liste de menu si elle n'y est pas déjà */
export function addMenuEntry(tracker, menuItems) {
  if (!Array.isArray(menuItems)) return menuItems;
  if (!menuItems.some((e) => (e?.label ?? e?.name) === MENU_LABEL)) {
    menuItems.push(activeCombatantMenuEntry(tracker));
  }
  return menuItems;
}

const PATCHED = Symbol.for("swade-tweaks.menuPatched");

/**
 * Enveloppe les méthodes de menu contextuel des combattants et des groupes
 * de la classe du suivi de combat (et de ses parents), sans dépendre du nom du hook.
 * Le menu du combat lui-même (`_getCombatContextOptions`) n'est pas touché.
 * @param {Function|null} TrackerClass  CONFIG.ui.combat
 * @returns {string[]}  noms des méthodes enveloppées
 */
export function patchTrackerMenus(TrackerClass) {
  if (!TrackerClass?.prototype) return [];
  const names = new Set();
  for (let proto = TrackerClass.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (/^_get\w*ContextOptions$/.test(name) && name !== "_getCombatContextOptions") names.add(name);
    }
  }
  const patched = [];
  for (const name of names) {
    const original = TrackerClass.prototype[name];
    if (typeof original !== "function") continue;
    if (original[PATCHED]) { patched.push(name); continue; }
    const wrapper = function (...args) {
      return addMenuEntry(this, original.apply(this, args));
    };
    wrapper[PATCHED] = true;
    TrackerClass.prototype[name] = wrapper;
    patched.push(name);
  }
  return patched;
}
