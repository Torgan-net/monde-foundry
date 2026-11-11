import { DEFAULT_IMG, MODULE_ID } from "../constants.js";
import { applyCritical, applyOutOfControl } from "./criticals.js";
import { actorFromUuid, escapeHTML, isResponsibleGM, plural } from "./foundry-utils.js";
import { vehicleHasJoker } from "./joker.js";
import { rollTrait } from "./rolls.js";
import { askShieldOperator, shieldInfo, shieldSoak } from "./shield.js";
import { apiPilot } from "./vehicle.js";
import { addVehicleWounds, setVehicleWounds, vehicleWoundsValue } from "./wounds.js";

export function damageCardHTML(d) {
  const target = d.targetUuid ? actorFromUuid(d.targetUuid) : null;
  const shield = d.isVehicle && target ? shieldInfo(target) : null;
  const allSoaked = d.wounds > 0 && d.remaining === 0;
  const tone = d.noEffect || allSoaked ? "none" : d.remaining > 0 ? "hit" : "light";
  const result = d.noEffect ? "Aucun effet"
    : allSoaked ? "Toutes les Blessures encaissées"
    : d.remaining > 0 ? plural(d.remaining, "Blessure") + (d.remaining < d.wounds ? ` (sur ${d.wounds})` : "")
    : "0 Blessure";
  const needManeuver = d.maneuverRequired && !d.noEffect && !allSoaked;
  const btn = (act, label, icon, primary = false) =>
    `<button type="button" class="swv-card-btn${primary ? " is-primary" : ""}" data-swv-dmg="${act}"><i class="fa-solid ${icon}"></i> ${label}</button>`;

  const actions = [];
  if (!d.noEffect && !d.done) {
    if (!d.applied && d.remaining > 0) {
      if (shield?.value > 0 && !d.soakDone) actions.push(btn("soak", `Encaisser · bouclier ${shield.value}/${shield.max}`, "fa-shield-halved"));
      actions.push(btn("apply", `Appliquer ${plural(d.remaining, "Blessure")}`, "fa-burst", true));
    } else if (d.mode === "native" && !d.validated && d.remaining > 0) {
      if (shield?.value > 0 && !d.soakDone) actions.push(btn("soak", `Encaisser · bouclier ${shield.value}/${shield.max}`, "fa-shield-halved"));
      actions.push(btn("validate", "Valider les Blessures", "fa-check", true));
    } else if (needManeuver && !d.maneuverDone) {
      actions.push(btn("maneuver", "Jet de manœuvre du pilote", "fa-dice-d20"));
      actions.push(btn("maneuverOk", "Réussi", "fa-circle-check"));
      actions.push(btn("ooc", "Raté : Perte de contrôle", "fa-tornado", true));
    }
  }
  const pending = actions.length > 0;
  return `<div class="swv-card">
    <header class="swv-card-head">
      <img src="${d.targetImg || DEFAULT_IMG}" alt="">
      <div><strong>${escapeHTML(d.targetName)}</strong><span>${escapeHTML(d.title)}${d.subtitle ? " · " + escapeHTML(d.subtitle) : ""}</span></div>
    </header>
    <div class="swv-card-result is-${tone}">${escapeHTML(result)}</div>
    ${d.steps?.length ? `<details class="swv-card-calc"><summary>Détail du calcul</summary><ul>${d.steps.map((st) => `<li>${escapeHTML(st)}</li>`).join("")}</ul></details>` : ""}
    ${d.log?.length ? `<ul class="swv-card-log">${d.log.map((l) => `<li><i class="fa-solid fa-check"></i> ${escapeHTML(l)}</li>`).join("")}</ul>` : ""}
    ${pending ? `<div class="swv-card-actions">${actions.join("")}</div>` : ""}
    ${pending ? `<p class="swv-card-hint">Boutons réservés au MJ.</p>` : ""}
  </div>`;
}

export async function postDamageCard(state, { speaker, rolls = [], whisper } = {}) {
  const d = { v: 1, done: false, soakDone: false, maneuverDone: false, validated: false, ...state };
  return ChatMessage.create({
    speaker, rolls, whisper,
    content: damageCardHTML(d),
    flags: { [MODULE_ID]: { dmg: d } }
  });
}

export async function updateDamageCard(message, d, line) {
  if (line) d.log = [...(d.log ?? []), line];
  await message.update({ content: damageCardHTML(d), [`flags.${MODULE_ID}.dmg`]: d });
}

/** Après l'application (ou la validation) : Dégradation critique s'il reste des Blessures. */
export async function damageAfterWounds(target, d) {
  if (!d.isVehicle || d.remaining <= 0) return;
  if (target.system?.status?.isWrecked) { d.log.push("Véhicule détruit : épave"); return; }
  await applyCritical(target);
  d.log.push("Dégradation critique tirée");
  if (d.extraCritical) { await applyCritical(target); d.log.push("Dégradation critique supplémentaire (ogive explosive)"); }
  if (d.electronicsOut) d.log.push("Électronique hors service (ogive IEM)");
}

export async function handleDamageAction(message, action) {
  const d = foundry.utils.deepClone(message.getFlag(MODULE_ID, "dmg"));
  const target = d.targetUuid ? actorFromUuid(d.targetUuid) : null;
  if (!target && action !== "maneuverOk") return ui.notifications.warn("Cible introuvable.");
  d.log ??= [];

  if (action === "soak") {
    const operator = await askShieldOperator(target, d.remaining, shieldInfo(target));
    if (!operator) return;
    const before = d.remaining;
    d.remaining = await shieldSoak(target, d.remaining, operator);
    d.soakDone = true;
    const negated = before - d.remaining;
    if (d.mode === "native" && negated > 0) await setVehicleWounds(target, vehicleWoundsValue(target) - negated, "bouclier");
    if (d.remaining === 0) d.done = true;
    return updateDamageCard(message, d, `Bouclier (${operator.name}) : ${plural(negated, "Blessure")} annulée${negated > 1 ? "s" : ""}`);
  }
  if (action === "apply") {
    if (d.isVehicle) await addVehicleWounds(target, d.remaining, d.mode === "hm" ? "Heavy Metal" : "dégâts");
    else {
      const w = target.system?.wounds ?? {};
      await target.update({ "system.wounds.value": Math.min((w.value ?? 0) + d.remaining, w.max ?? Infinity) });
    }
    d.applied = true;
    d.log.push(`${plural(d.remaining, "Blessure")} appliquée${d.remaining > 1 ? "s" : ""}`);
    await damageAfterWounds(target, d);
    if (!d.maneuverRequired || target.system?.status?.isWrecked) d.done = true;
    return updateDamageCard(message, d);
  }
  if (action === "validate") {
    d.validated = true;
    d.log.push(`${plural(d.remaining, "Blessure")} conservée${d.remaining > 1 ? "s" : ""}`);
    await damageAfterWounds(target, d);
    if (!d.maneuverRequired || target.system?.status?.isWrecked) d.done = true;
    return updateDamageCard(message, d);
  }
  if (action === "maneuver") {
    const pilot = apiPilot(target);
    const skill = target.system?.driver?.skill;
    if (!pilot || !skill) return ui.notifications.warn(`${target.name} : pas de pilote ou pas de compétence de manœuvre.`);
    const joker = vehicleHasJoker(target) ? [{ label: "Joker", value: 2 }] : [];
    await rollTrait(pilot, skill, [...apiManeuverModifiers(target), ...joker]);
    return; // le MJ indique ensuite Réussi ou Raté
  }
  if (action === "maneuverOk") {
    d.maneuverDone = true; d.done = true;
    return updateDamageCard(message, d, "Manœuvre réussie : le véhicule reste sous contrôle");
  }
  if (action === "ooc") {
    d.maneuverDone = true; d.done = true;
    await updateDamageCard(message, d, "Manœuvre ratée : Perte de contrôle");
    await applyOutOfControl(target);
  }
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(MODULE_ID, "dmg")) return;
  const buttons = html.querySelectorAll?.("[data-swv-dmg]") ?? [];
  html.querySelector?.(".swv-card-hint")?.toggleAttribute("hidden", game.user.isGM);
  for (const b of buttons) {
    if (!game.user.isGM) { b.disabled = true; continue; }
    b.addEventListener("click", async () => {
      html.querySelectorAll("[data-swv-dmg]").forEach((x) => { x.disabled = true; });
      try { await handleDamageAction(message, b.dataset.swvDmg); }
      finally { if (message.getFlag(MODULE_ID, "dmg")) html.querySelectorAll("[data-swv-dmg]").forEach((x) => { x.disabled = false; }); }
    });
  }
});

/*
 * Dégâts appliqués par le système SWADE (carte de dégâts native, fiche native) : carte de suivi au MJ
 * pour encaisser avec le bouclier, puis Dégradation critique et manœuvre.
 */
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (actor.type !== "vehicle" || options.swvReason) return;
  if (foundry.utils.hasProperty(changes, "system.wounds.value")) options.swvOldWounds = actor.system?.wounds?.value ?? 0;
});

Hooks.on("updateActor", (actor, changes, options) => {
  if (actor.type !== "vehicle" || options.swvReason || options.swvOldWounds === undefined || !isResponsibleGM()) return;
  const delta = (actor.system?.wounds?.value ?? 0) - options.swvOldWounds;
  if (delta <= 0) return;
  postDamageCard({
    mode: "native",
    title: "Dégâts appliqués par le système",
    subtitle: "",
    targetUuid: actor.uuid,
    targetName: actor.name,
    targetImg: actor.img,
    isVehicle: true,
    noEffect: false,
    wounds: delta,
    remaining: delta,
    steps: [],
    maneuverRequired: true,
    applied: true,
    log: []
  }, { speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id) })
    .catch((err) => console.error(`${MODULE_ID} | carte de dégâts`, err));
});
