/**
 * Accès Foundry pour les groupes du Combat Tracker :
 * lit les documents, appelle les règles, écrit.
 */
import { computeGroupUpdates } from "../rules/group-label.js";
import { WRITE_FLAG } from "../constants.js";

/** Le client qui fait les automatismes : le MJ actif uniquement */
function isAutomationClient() {
  return !!game.users.activeGM?.isSelf;
}

/**
 * Combattant meneur d'un groupe SWADE (`system.leader` = id de combattant).
 * @param {CombatantGroup} group
 * @returns {Combatant|null}
 */
export function getLeader(group) {
  const id = group?.system?.leader;
  return id ? group.parent?.combatants.get(id) ?? null : null;
}

/**
 * Groupe d'un combattant ; le champ peut contenir l'id ou le document.
 * @param {Combatant} combatant
 * @returns {CombatantGroup|null}
 */
export function groupOf(combatant) {
  const g = combatant?.group;
  if (!g) return null;
  return typeof g === "string" ? combatant.parent?.groups.get(g) ?? null : g;
}

/**
 * Groupes à resynchroniser quand un combattant change :
 * son groupe actuel et ceux qu'il mène encore (cas d'un meneur qui part).
 * @param {Combatant} combatant
 * @returns {CombatantGroup[]}
 */
export function groupsToSyncForCombatant(combatant) {
  const result = new Set();
  const current = groupOf(combatant);
  if (current) result.add(current);
  for (const g of combatant.parent?.groups ?? []) {
    if (g.system?.leader === combatant.id) result.add(g);
  }
  return [...result];
}

/** Données du meneur utiles aux règles (images par ordre de préférence) */
function leaderData(leader) {
  if (!leader) return null;
  return {
    name: leader.name,
    images: [leader.img, leader.token?.texture?.src, leader.actor?.img]
  };
}

/**
 * Met le nom et l'image d'un groupe en accord avec son meneur.
 * N'écrit rien si rien ne change ou si ce client n'est pas le MJ actif.
 * @param {CombatantGroup} group
 */
export async function syncGroup(group) {
  if (!group || !isAutomationClient()) return;
  const updates = computeGroupUpdates(
    { name: group.name, img: group.img },
    leaderData(getLeader(group)),
    CONFIG.SWADE?.combat?.group?.icon
  );
  if (foundry.utils.isEmpty(updates)) return;
  await group.update(updates, { [WRITE_FLAG]: true });
}

/** Resynchronise tous les groupes de tous les combats du monde */
export async function syncAllGroups() {
  for (const combat of game.combats ?? []) {
    for (const group of combat.groups ?? []) await syncGroup(group);
  }
}
