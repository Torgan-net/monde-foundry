import { DEFAULT_TABLES, MODULE_ID } from "./constants.js";

/** Réglages du module (à appeler au hook init). */
export function registerSettings() {
  game.settings.register(MODULE_ID, "diceRoller", {
    name: "Lanceur de dés",
    hint: "Avec « SWADE Tools » : les tirs et actions d'armes ouvrent sa fenêtre de tir, au nom de l'occupant du poste ; les jets de compétence (manœuvre, postes, bouclier) passent par sa fenêtre si ses jets simplifiés sont actifs, sinon par le jet natif habillé par SWADE Tools. Les modificateurs du véhicule sont préremplis. Les dégâts Heavy Metal et les actions des mods restent sur le module et le système SWADE.",
    scope: "world", config: true, type: String, default: "swade",
    choices: { swade: "Système SWADE (natif)", "swade-tools": "SWADE Tools" }
  });
  game.settings.register(MODULE_ID, "tableOutOfControl", {
    name: "Table de Perte de contrôle",
    hint: "UUID de la table tirée pour une Perte de contrôle (ex. RollTable.xxxx ou Compendium.…). Les effets sont appliqués d'après la valeur du 2d6.",
    scope: "world", config: true, type: String, default: DEFAULT_TABLES.outOfControl
  });
  game.settings.register(MODULE_ID, "tableCritical", {
    name: "Table des Dégradations critiques",
    hint: "UUID de la table tirée pour une Dégradation critique. Les effets sont appliqués d'après la valeur du 2d6.",
    scope: "world", config: true, type: String, default: DEFAULT_TABLES.critical
  });
}
