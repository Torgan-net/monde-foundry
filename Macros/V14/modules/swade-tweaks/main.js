console.log("Ferremont | main.js chargé");

/** Combattant meneur d'un groupe SWADE */
function getLeader(group) {
  const leaderId = group.system?.leader;
  return leaderId ? group.parent?.combatants.get(leaderId) ?? null : null;
}

/** "Groupe de Brann" / "Groupe d'Elharn" (élision devant voyelle) */
function groupLabel(name) {
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? `Groupe d'${name}` : `Groupe de ${name}`;
}

/** Ne renomme que les libellés automatiques (défaut SWADE ou générés par ce script) */
function isAutoName(name) {
  return !name || /^Groupe d(e |')/.test(name);
}

/** Met à jour l'image et le nom d'un groupe d'après son meneur */
async function syncGroup(group) {
  if (!game.user.isActiveGM) return;
  const leader = getLeader(group);
  const updates = {};

  const img = leader
    ? (leader.img || leader.token?.texture?.src || leader.actor?.img)
    : CONFIG.SWADE.combat.group.icon;
  if (img && group.img !== img) updates.img = img;

  if (leader && isAutoName(group.name)) {
    const name = groupLabel(leader.name);
    if (group.name !== name) updates.name = name;
  }

  if (!foundry.utils.isEmpty(updates)) await group.update(updates);
}

/** Groupe d'un combattant (selon la version, le champ renvoie l'id ou le document) */
function groupOf(combatant) {
  const g = combatant.group;
  if (!g) return null;
  return typeof g === "string" ? combatant.parent?.groups.get(g) ?? null : g;
}

// Création d'un groupe
Hooks.on("createCombatantGroup", (group) => syncGroup(group));

// Changement de meneur
Hooks.on("updateCombatantGroup", (group, changes) => {
  if (foundry.utils.hasProperty(changes, "system.leader")) syncGroup(group);
});

// Un combattant est ajouté au combat (éventuellement directement dans un groupe)
Hooks.on("createCombatant", (combatant) => {
  const group = groupOf(combatant);
  if (group) syncGroup(group);
});

// Un combattant change de groupe, de nom ou d'image
Hooks.on("updateCombatant", (combatant, changes) => {
  if (!("group" in changes || "name" in changes || "img" in changes)) return;
  const group = groupOf(combatant);
  if (group) syncGroup(group);
  // S'il quitte un groupe, on resynchronise aussi l'ancien
  for (const g of combatant.parent?.groups ?? []) {
    if (g.system?.leader === combatant.id && g !== group) syncGroup(g);
  }
});

// Rattrape les groupes existants au chargement du monde
Hooks.once("ready", () => {
  for (const combat of game.combats) {
    for (const group of combat.groups) syncGroup(group);
  }
});

// Accès depuis la console pour les tests (supprimable ensuite)
globalThis.swadeTweaksSync = syncGroup;