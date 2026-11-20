/**
 * Règles pures : catalogue des corrections d'affichage (HUD des états, suivi de combat)
 * et calcul des classes CSS à poser sur <body>.
 */

export const MLD_ID = "monks-little-details";

/**
 * @typedef {object} HudFix
 * @property {string} key  clé du réglage
 * @property {string|null} cssClass  classe posée sur <body>, ou null si la correction est en JS
 * @property {string|null} requires  module requis, ou null
 * @property {string} name
 * @property {string} hint
 */

/** @type {HudFix[]} */
export const HUD_FIXES = Object.freeze([
  {
    key: "fixMldHeight",
    cssClass: "swade-tweaks--mld-height",
    requires: MLD_ID,
    name: "HUD des états : cadre à la bonne hauteur",
    hint: "Monk's Little Details fixe la hauteur du panneau des états : avec beaucoup d'états, les dernières lignes débordent sous le cadre. Le cadre s'adapte au contenu."
  },
  {
    key: "fixMldNames",
    cssClass: "swade-tweaks--mld-names",
    requires: MLD_ID,
    name: "HUD des états : noms lisibles",
    hint: "Noms des états en pleine opacité, et en sombre sur le thème clair."
  },
  {
    key: "fixMldHighlight",
    cssClass: "swade-tweaks--mld-highlight",
    requires: MLD_ID,
    name: "HUD des états : icônes nettes et état actif en surbrillance",
    hint: "Icônes en pleine opacité ; un état actif est signalé par une case orange et un nom en gras, sans altérer les couleurs de l'icône."
  },
  {
    key: "fixStatusColors",
    cssClass: "swade-tweaks--status-colors",
    requires: null,
    name: "Icônes d'état : couleurs d'origine",
    hint: "En thème clair, Foundry inverse les couleurs des icônes d'état (HUD et suivi de combat). Les icônes SWADE en couleur gardent leurs vraies couleurs ; le crâne blanc de Foundry reste inversé pour rester visible."
  },
  {
    key: "fixTrackerOpacity",
    cssClass: "swade-tweaks--tracker-opacity",
    requires: null,
    name: "Suivi de combat : icônes d'état opaques",
    hint: "Retire le voile (opacité 30 %) sur les icônes d'état du suivi de combat."
  },
  {
    key: "fixPaletteClamp",
    cssClass: null,
    requires: null,
    name: "HUD des états : toujours dans l'écran",
    hint: "Décale le panneau des états s'il dépasse en bas, à droite (barre latérale comprise), à gauche ou en haut de l'écran."
  }
]);

/** Une correction est proposée si elle n'a pas de prérequis, ou si son module est actif */
export function isFixAvailable(fix, isModuleActive) {
  return !fix.requires || Boolean(isModuleActive(fix.requires));
}

/**
 * Classes CSS à poser sur <body>.
 * @param {HudFix[]} fixes
 * @param {(key:string) => boolean} getValue  valeur du réglage
 * @param {(id:string) => boolean} isModuleActive
 * @returns {string[]}
 */
export function activeFixClasses(fixes, getValue, isModuleActive) {
  return fixes
    .filter((f) => f.cssClass && isFixAvailable(f, isModuleActive) && getValue(f.key))
    .map((f) => f.cssClass);
}
