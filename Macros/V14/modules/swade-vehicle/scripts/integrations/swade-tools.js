import { MODULE_ID } from "../constants.js";
import { computeWeaponClasse } from "../rules/classes.js";
import { heavyMetalCombat, openHeavyMetalDialog } from "../services/heavy-metal.js";

/**
 * Lanceur de dés « SWADE Tools » (réglage du module) : jets de compétence par game.swadetools.skill.
 * Cette API n'accepte pas de modificateurs : le total des modificateurs du véhicule est prérempli
 * dans le champ « Modificateur » de la fenêtre de SWADE Tools, avec leur détail en dessous.
 * Les armes et actions d'objets restent sur le pipeline natif (SWADE Tools ne gère que les objets
 * de l'acteur qui tire, alors que les armes appartiennent au véhicule).
 */
/**
 * Mode du lanceur : "native", "swade-tools-simple" (fenêtre de SWADE Tools) ou
 * "swade-tools-native" (jet natif avec nos modificateurs, message marqué pour la carte de SWADE Tools,
 * comme le fait SWADE Tools lui-même quand ses jets simplifiés sont désactivés).
 */
export function rollerMode() {
  let choice = "swade";
  try { choice = game.settings.get(MODULE_ID, "diceRoller"); } catch { /* réglage absent */ }
  if (choice !== "swade-tools" || !game.modules.get("swade-tools")?.active) return "native";
  let simple = false;
  try { simple = !!game.settings.get("swade-tools", "simpleRolls"); } catch { /* réglage absent */ }
  if (simple && typeof game.swadetools?.skill === "function") return "swade-tools-simple";
  return "swade-tools-native";
}

export function useSwadeTools() { return rollerMode() === "swade-tools-simple"; }

/** Marque le prochain message de jet de cet utilisateur pour que SWADE Tools l'habille (relances, etc.). */
export function tagNextRollForSwadeTools(rolltype = "skill") {
  Hooks.once("renderChatMessageHTML", (message, html, data) => {
    const author = data?.user?.id ?? message.author?.id ?? message.user?.id;
    if (author === game.user.id) message.update({ "flags.swade-tools.rolltype": rolltype });
  });
}

/** Préremplit le champ « Modificateur » de la prochaine fenêtre de SWADE Tools avec les modificateurs du véhicule. */
export function prefillSwadeToolsMods(mods) {
  const active = mods.filter((m) => m.value);
  const total = active.reduce((t, m) => t + m.value, 0);
  if (active.length) {
    const detail = active.map((m) => `${m.label} ${m.value > 0 ? "+" : "−"}${Math.abs(m.value)}`).join(", ");
    Hooks.once("renderDialog", (app, html) => {
      const root = html?.[0] ?? html;
      const input = root?.querySelector?.("#mod");
      if (!input) return;
      input.value = total ? String(total) : "";
      input.title = detail;
      const note = document.createElement("p");
      note.className = "swv-st-note";
      note.textContent = `Véhicule : ${detail}`;
      (input.closest(".swadetools-formpart") ?? input.parentElement)?.after(note);
    });
  }
}

export async function rollViaSwadeTools(actor, skill, key, mods) {
  prefillSwadeToolsMods(mods);
  await game.swadetools.skill(actor, skill?.id ?? key);
  return null; // le résultat arrive dans le chat de SWADE Tools
}

/** Tirs par SWADE Tools : disponible dès que le lanceur SWADE Tools est choisi (sa fenêtre de tir ne dépend pas des jets simplifiés). */
export function useSwadeToolsWeapons() { return rollerMode() !== "native" && typeof game.swadetools?.item === "function"; }

/**
 * Ouvre la fenêtre de tir de SWADE Tools pour une arme du véhicule. SWADE Tools fait tirer l'opérateur du
 * véhicule (system.operator) : on désigne l'occupant du poste comme opérateur le temps que SWADE Tools
 * construise sa fenêtre (synchrone), puis on rétablit l'opérateur du système.
 */
export async function fireViaSwadeTools(vehicle, weapon, shooter, mods = []) {
  prefillSwadeToolsMods(mods);
  const sys = vehicle.system;
  const own = Object.getOwnPropertyDescriptor(sys, "operator");
  let overridden = false;
  try {
    Object.defineProperty(sys, "operator", { value: shooter, configurable: true, writable: true });
    overridden = true;
  } catch (err) { console.warn(`${MODULE_ID} | opérateur non modifiable : SWADE Tools fera tirer le pilote`, err); }
  let pending;
  try { pending = game.swadetools.item(vehicle, weapon.id); }
  finally {
    if (overridden) { if (own) Object.defineProperty(sys, "operator", own); else delete sys.operator; }
  }
  await pending;
  return true;
}

/*
 * Cartes de tir de SWADE Tools : bouton « Dégâts Heavy Metal » quand l'arme vient d'un véhicule et a une Classe.
 * Drapeaux de SWADE Tools : itemroll (arme), useactor (tireur), usetarget (jetons ciblés), usevehicle (véhicule),
 * usevehicletoken (jeton du véhicule non lié).
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const f = message.flags?.["swade-tools"];
  if (!f?.itemroll || !f.usevehicle) return;
  const vehicle = (f.usevehicletoken && canvas.tokens?.get(f.usevehicletoken)?.actor) || game.actors.get(f.usevehicle);
  const weapon = vehicle?.items.get(f.itemroll);
  if (!weapon || weapon.type !== "weapon") return;
  const weaponClass = weapon.getFlag(MODULE_ID, "classe") || computeWeaponClasse(weapon);
  if (!weaponClass) return;
  const shooter = game.actors.get(f.useactor) ?? null;
  if (!(game.user.isGM || shooter?.isOwner || vehicle.isOwner)) return;
  const hm = !!heavyMetalCombat(vehicle);
  const box = document.createElement("div");
  box.className = "swv-st-hm";
  box.innerHTML = `<button type="button" class="${hm ? "is-primary" : ""}"><i class="fa-solid fa-burst"></i> Dégâts Heavy Metal · Classe ${weaponClass}</button>`;
  box.querySelector("button").addEventListener("click", () => {
    const targetActors = String(f.usetarget ?? "").split(",").map((id) => canvas.tokens?.get(id)?.actor).filter(Boolean);
    openHeavyMetalDialog({ attacker: vehicle, weapon, weaponClass, occupant: shooter, targetActors });
  });
  (html.querySelector(".message-content") ?? html).append(box);
});

/* ------------------------------------------------------------------ */
/* Fiche                                                               */
/* ------------------------------------------------------------------ */
