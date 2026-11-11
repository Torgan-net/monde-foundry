import { DEFAULT_IMG, MODULE_ID } from "../constants.js";
import { ROMAN, computeVehicleClasse, romanToInt, stripClasse } from "../rules/classes.js";
import { WARHEADS, resolveHeavyMetal } from "../rules/heavy-metal.js";
import { toInt } from "../rules/numbers.js";
import { postDamageCard } from "./damage-card.js";
import { powerMods } from "./energy.js";
import { escapeHTML, tokenImg } from "./foundry-utils.js";

/** Combat marqué Heavy Metal dans lequel l'acteur est engagé, sinon null. */
export function heavyMetalCombat(actor) {
  if (!actor) return null;
  for (const combat of game.combats ?? []) {
    if (!combat.getFlag(MODULE_ID, "heavyMetal")) continue;
    if (combat.combatants.some((c) => c.actorId === actor.id || c.actor?.uuid === actor.uuid)) return combat;
  }
  return null;
}

/** Premier combat (Heavy Metal ou non) dans lequel l'acteur est engagé. */
export function actorCombat(actor) {
  if (!actor) return null;
  return [...(game.combats ?? [])].find((combat) =>
    combat.combatants.some((c) => c.actorId === actor.id || c.actor?.uuid === actor.uuid)) ?? null;
}

/** Classe d'une cible : véhicule = Classe forcée ou calculée ; autre acteur = aucune. */
export function targetClasse(actor) {
  if (actor?.type !== "vehicle") return null;
  return actor.getFlag(MODULE_ID, "classeOverride") || computeVehicleClasse(actor);
}

export async function openHeavyMetalDialog({ attacker, weapon, weaponClass, occupant, preset = {}, targetActors = null }) {
  const targets = targetActors?.length ? targetActors : [...game.user.targets].map((t) => t.actor).filter(Boolean);
  const romanOpts = (sel) => ROMAN.map((r) => `<option value="${r}" ${r === sel ? "selected" : ""}>${r}</option>`).join("");
  const targetOpts = targets.map((a, i) => {
    const c = targetClasse(a);
    return `<option value="${i}" ${String(i) === preset.target ? "selected" : ""}>${escapeHTML(a.name)} (${c ? "Classe " + c : "sans Classe"})</option>`;
  }).join("");
  const warhead = preset.warhead ?? weapon.getFlag(MODULE_ID, "warhead") ?? "";
  const content = `<div class="swv-hm-form">
    <p>Arme : <strong>${escapeHTML(stripClasse(weapon.name))}</strong></p>
    <label>Classe de l'arme <select name="weaponClass">${romanOpts(preset.weaponClass ?? weaponClass)}</select></label>
    <label>Cible <select name="target">${targetOpts}<option value="none" ${targets.length ? "" : "selected"}>Aucune cible : Classe à préciser</option></select></label>
    <label>Classe de la cible <select name="targetClass"><option value="">selon la cible</option>${romanOpts(preset.targetClass ?? "")}</select></label>
    <label>Armure de la cible (ogive perforante) <input type="number" name="armor" min="0" step="1" value="${preset.armor ?? ""}" placeholder="selon la cible"></label>
    <label>Ogive <select name="warhead">${Object.entries(WARHEADS).map(([k, l]) => `<option value="${k}" ${k === warhead ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>Énergie (Blessures) <input type="number" name="energy" step="1" value="${preset.energy ?? (weapon.getFlag(MODULE_ID, "energy") ? powerMods(attacker).weaponWounds : 0)}"></label>
    <label class="swv-hm-check"><input type="checkbox" name="raise" ${preset.raise ? "checked" : ""}> Prouesse sur le jet d'attaque</label>
  </div>`;

  let data;
  try {
    data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Dégâts Heavy Metal" },
      content,
      ok: {
        label: "Résoudre",
        callback: (ev, button) => {
          const f = button.form.elements;
          return { weaponClass: f.weaponClass.value, target: f.target.value, targetClass: f.targetClass.value,
            armor: f.armor.value, warhead: f.warhead.value, raise: f.raise.checked, energy: f.energy.value };
        }
      }
    });
  } catch { return; }
  if (!data) return;

  const targetActor = data.target === "none" ? null : (targets[Number(data.target)] ?? null);
  const tClass = data.targetClass || targetClasse(targetActor);
  if (!tClass) {
    ui.notifications.warn("La cible n'a pas de Classe : choisissez-la.");
    return openHeavyMetalDialog({ attacker, weapon, weaponClass, occupant, preset: data, targetActors });
  }
  const armor = data.armor !== "" ? toInt(data.armor) : (targetActor?.system?.toughness?.armor ?? 0);
  const d3 = await new Roll("1d3").evaluate();
  const r = resolveHeavyMetal({ weaponClass: data.weaponClass, targetClass: tClass, raise: data.raise,
    warhead: data.warhead, targetArmor: armor, d3: d3.total, energyWounds: toInt(data.energy) });
  const usedD3 = !r.noEffect && data.warhead !== "nuclear" && romanToInt(r.weaponClass) >= romanToInt(r.targetClass);

  const targetIsVehicle = targetActor?.type === "vehicle";
  await postDamageCard({
    mode: "hm",
    title: stripClasse(weapon.name),
    subtitle: `Heavy Metal · Classe ${r.weaponClass} contre Classe ${r.targetClass}`,
    targetUuid: targetActor?.uuid ?? null,
    targetName: targetActor?.name ?? `Cible de Classe ${r.targetClass}`,
    targetImg: targetActor ? tokenImg(targetActor.uuid) : DEFAULT_IMG,
    isVehicle: targetIsVehicle,
    noEffect: r.noEffect,
    wounds: r.wounds,
    remaining: r.wounds,
    steps: r.steps.filter((st) => !st.startsWith("le pilote de la cible")),
    extraCritical: r.extraCritical,
    electronicsOut: r.electronicsOut,
    maneuverRequired: targetIsVehicle && r.maneuver,
    applied: !targetActor || r.noEffect || r.wounds === 0,
    log: []
  }, { speaker: ChatMessage.getSpeaker({ actor: occupant ?? attacker }), rolls: usedD3 ? [d3] : [] });
}

/* ------------------------------------------------------------------ */
/* Carte de dégâts d'un véhicule                                        */
/* ------------------------------------------------------------------ */
/*
 * Une seule carte par attaque, mise à jour à chaque étape (MJ) :
 *   1. Encaisser avec le bouclier (avant l'application)  2. Appliquer les Blessures restantes
 *   3. Dégradation critique automatique s'il reste des Blessures  4. Manœuvre du pilote / Perte de contrôle.
 * Si le bouclier annule toutes les Blessures, ni Dégradation critique ni Perte de contrôle.
 * mode « hm » : Blessures à appliquer par la carte ; mode « native » : déjà appliquées par le système.
 */

/** Case « Heavy Metal pour ce combat » dans le suivi de combat (MJ), badge pour les joueurs. */
Hooks.on("renderCombatTracker", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.querySelectorAll(".swv-hm-toggle").forEach((el) => el.remove());
  const combat = app.viewed ?? game.combat;
  if (!combat) return;
  const active = !!combat.getFlag(MODULE_ID, "heavyMetal");
  let el;
  if (game.user.isGM) {
    el = document.createElement("label");
    el.innerHTML = `<input type="checkbox" ${active ? "checked" : ""}> Heavy Metal pour ce combat`;
    el.querySelector("input").addEventListener("change", (ev) => combat.setFlag(MODULE_ID, "heavyMetal", ev.currentTarget.checked));
  } else if (active) {
    el = document.createElement("div");
    el.textContent = "Heavy Metal";
  } else return;
  el.className = `swv-hm-toggle${active ? " is-active" : ""}`;
  const header = root.querySelector(".combat-tracker-header") ?? root.querySelector("header");
  console.debug(`${MODULE_ID} | case Heavy Metal insérée dans`, header?.className ?? "racine du suivi");
  if (header) header.append(el); else root.prepend(el);
});

/* ------------------------------------------------------------------ */
/* Distrait / Vulnérable : propagation à l'équipage                    */
/* ------------------------------------------------------------------ */
