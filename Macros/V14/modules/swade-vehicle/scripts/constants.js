/** Constantes partagées du module : identifiant, version, rôles et types de postes, états, tables par défaut. */
export const MODULE_ID = "swade-vehicle";

export const VERSION = "0.6.5";

export const ROLE_BY_TYPE = { pilote: "operator", artilleur: "gunner", autre: "other" };

export const TYPE_BY_ROLE = { operator: "pilote", gunner: "artilleur", other: "autre" };

export const TYPE_LABEL = { pilote: "Pilote", artilleur: "Artilleur", autre: "Autre" };

export const ROLE_PRIORITY = { operator: 3, gunner: 2, other: 1 };

export const STATUS = [
  ["isOutOfControl", "Hors de contrôle"],
  ["isWrecked", "Épave"],
  ["isDistracted", "Distrait"],
  ["isVulnerable", "Vulnérable"]
];

export const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/** Caractéristiques modifiables depuis l'onglet Conception : chemin système → type de valeur. */
export const TECH_FIELDS = {
  "classification": "text",
  "size": "int",
  "scale": "signed",
  "handling": "signed",
  "topspeed.value": "int",
  "topspeed.unit": "text",
  "toughness.total": "int",
  "toughness.armor": "int",
  "wounds.max": "int",
  "cost": "int"
};

/** Compétences de manœuvre : valeur stockée dans system.driver.skill (nom anglais natif) → libellé VF. */
/** Libellés VF des compétences courantes des soutiens (affichage). */
export const SKILL_LABELS = { Shooting: "Tir", Electronics: "Électronique", Repair: "Réparation", Notice: "Perception", Fighting: "Combat", Athletics: "Athlétisme" };

export const MANEUVER_SKILLS = { Piloting: "Pilotage", Driving: "Conduite", Boating: "Navigation" };

export function maneuverLabel(skill) { return skill ? (MANEUVER_SKILLS[skill] ?? SKILL_LABELS[skill] ?? skill) : null; }

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/** États du véhicule propagés à chaque membre d'équipage (system.crew.members). */
export const CREW_STATUS = {
  isDistracted: ["distracted", "distr"],
  isVulnerable: ["vulnerable", "vuln"]
};

export const JOURNAL_MAX = 200;

export const DEFAULT_TABLES = { outOfControl: "RollTable.9HXQfcM65ad4bD8M", critical: "RollTable.ocXkPAdHHDF3gwCb" };
