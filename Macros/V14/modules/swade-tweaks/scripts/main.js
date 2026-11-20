/**
 * swade-tweaks — point d'entrée : hooks, API.
 * La logique est dans rules/ (pure) et services/ (accès Foundry).
 */
import { MODULE_ID, VERSION, WRITE_FLAG } from "./constants.js";
import { syncGroup, syncAllGroups, groupOf, groupsToSyncForCombatant } from "./services/groups.js";
import { addMenuEntry, patchTrackerMenus } from "./services/turns.js";
import { registerHudSettings, refreshHudFixes, stopPaletteClamp } from "./services/hud-fixes.js";
import { buildApi } from "./api.js";

const COMBATANT_FIELDS = ["group", "name", "img"];

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | v${VERSION}`);
  registerHudSettings();
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

// Clic droit dans le suivi de combat : redéfinir le combattant actif.
// 1) Directement dans la classe du suivi (celle de SWADE, fixée à son init)
Hooks.once("setup", () => {
  const patched = patchTrackerMenus(CONFIG.ui?.combat);
  console.log(`${MODULE_ID} | menus du suivi enveloppés :`, patched);
});
// 2) Par les hooks de menu, au cas où ; pas de doublon
for (const hook of ["getCombatantContextOptions", "getCombatantGroupContextOptions"]) {
  Hooks.on(hook, (tracker, menuItems) => addMenuEntry(tracker, menuItems));
}

Hooks.once("ready", () => {
  const api = buildApi();
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll(`${MODULE_ID}.ready`, api);
  syncAllGroups();
  refreshHudFixes();
});

// Le HUD peut être recréé avec le canevas (changement de scène)
Hooks.on("canvasReady", () => {
  stopPaletteClamp();
  refreshHudFixes();
});

// Tests d'intégration, chargés seulement si Quench est actif
Hooks.on("quenchReady", async (quench) => {
  const { registerQuenchTests } = await import("../tests/quench/groups.quench.js");
  const { registerTurnQuenchTests } = await import("../tests/quench/turns.quench.js");
  registerQuenchTests(quench);
  const { registerHudQuenchTests } = await import("../tests/quench/hud.quench.js");
  registerTurnQuenchTests(quench);
  registerHudQuenchTests(quench);
});
