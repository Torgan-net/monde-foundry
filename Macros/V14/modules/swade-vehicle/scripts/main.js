/**
 * SWADE Vehicle – Fiche véhicule
 * Foundry VTT v14 uniquement · système SWADE 6.x
 *
 * Point d'entrée : assemble le module, sans logique propre.
 *  - rules/        règles de jeu pures (testées en Node : npm test)
 *  - services/     accès aux documents Foundry, effets, chat, automatismes
 *  - integrations/ modules tiers (SWADE Tools)
 *  - sheets/       fiche ApplicationV2
 *  - api.js        API publique (voir API.md)
 *
 * Écritures sur les données : voir README.md, section « Ce que le module écrit ».
 */

import { api } from "./api.js";
import { MODULE_ID, VERSION } from "./constants.js";
import { patchVehicleScale } from "./services/scale-patch.js";
import { registerSettings } from "./settings.js";
import { SwadeVehicleSheet } from "./sheets/vehicle-sheet.js";

// Modules qui enregistrent leurs hooks à l'import (chat, combat, propagation des états, journal…)
import "./services/journal.js";
import "./services/crew.js";
import "./services/damage-card.js";
import "./services/heavy-metal.js";
import "./services/joker.js";
import "./services/support.js";
import "./services/instances.js";
import "./integrations/swade-tools.js";

// Tests d'intégration (actifs seulement si le module Quench est installé)
import "./quench-batches.js";

Hooks.once("init", () => {
  registerSettings();
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, SwadeVehicleSheet, {
    types: ["vehicle"],
    makeDefault: false,
    label: "Fiche véhicule SWADE Vehicle (test)"
  });
  game.modules.get(MODULE_ID).api = api;
  console.log(`${MODULE_ID} | v${VERSION} | fiche véhicule enregistrée`);
});

Hooks.once("setup", patchVehicleScale);

/* API prête : les macros et modules peuvent écouter Hooks.once("swade-vehicle.ready", (api) => …). */
Hooks.once("ready", () => Hooks.callAll(`${MODULE_ID}.ready`, api));
