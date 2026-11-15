/**
 * swade-tweaks — point d'entrée : hooks, API.
 * La logique est dans rules/ (pure) et services/ (accès Foundry).
 */
import { MODULE_ID, VERSION, WRITE_FLAG } from "./constants.js";
import { syncGroup, syncAllGroups, groupOf, groupsToSyncForCombatant } from "./services/groups.js";
import { buildApi } from "./api.js";

const COMBATANT_FIELDS = ["group", "name", "img"];

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | v${VERSION}`);
});

// Création d'un groupe (le meneur peut ne pas être encore rangé : rattrapé par createCombatant)
Hooks.on("createCombatantGroup", (group) => syncGroup(group));

// Changement de meneur
Hooks.on("updateCombatantGroup", (group, changes, options) => {
  if (options?.[WRITE_FLAG]) return;
  if (foundry.utils.hasProperty(changes, "system.leader")) return syncGroup(group);
});

// Combattant ajouté au combat, éventuellement directement dans un groupe
Hooks.on("createCombatant", (combatant) => {
  const group = groupOf(combatant);
  if (group) return syncGroup(group);
});

// Combattant qui change de groupe, de nom ou d'image
Hooks.on("updateCombatant", async (combatant, changes) => {
  if (!COMBATANT_FIELDS.some((k) => k in changes)) return;
  for (const group of groupsToSyncForCombatant(combatant)) await syncGroup(group);
});

Hooks.once("ready", () => {
  const api = buildApi();
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll(`${MODULE_ID}.ready`, api);
  syncAllGroups();
});

// Tests d'intégration, chargés seulement si Quench est actif
Hooks.on("quenchReady", async (quench) => {
  const { registerQuenchTests } = await import("../tests/quench/groups.quench.js");
  registerQuenchTests(quench);
});
