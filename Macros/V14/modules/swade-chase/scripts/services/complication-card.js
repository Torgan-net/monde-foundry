/**
 * Complication : message de chat interactif.
 *   flags.swade-chase.complication = { combatId, combatantId, round, name, actionLabel, mode, suit,
 *                                      cityStreets, rooftops, state, suggested, result }
 */
import { MODULE_ID, MODES } from "../constants.js";
import { SUIT_LABELS, SUIT_SYMBOLS } from "../rules/cards.js";
import { complicationFor, criticalFailureEffect, needsCriticalDie, traitOutcome, driverWord } from "../rules/complication.js";
import { escapeHTML, modsText, modsTotal, signed } from "./util.js";
import { asGM, canControl } from "./socket.js";
import { rollManeuver, readRoll } from "./rolls.js";
import { moveUnitGM, askMove, bumpChoices } from "./movement.js";
import { mountOf, addFatigue, pilotName } from "./mount.js";

const help = (text) => `<span class="sc-help-inline" data-tooltip="${escapeHTML(text)}"><i class="fa-solid fa-circle-question"></i></span>`;

function resolveButtons(d) {
  const sugg = (o) => d.suggested === o ? " sc-suggested" : "";
  return `<div class="sc-chat-buttons"><button type="button" data-sc="complication-roll"><i class="fa-solid fa-dice"></i> Lancer le jet</button></div>
    <div class="sc-chat-resolve"><span>Résultat, après une éventuelle relance avec un Jeton :</span>
      <div class="sc-chat-buttons">
        <button type="button" data-sc="complication-resolve" data-outcome="success" class="sc-ok${sugg("success")}">Réussite</button>
        <button type="button" data-sc="complication-resolve" data-outcome="failure" class="sc-ko${sugg("failure")}">Échec</button>
      </div></div>`;
}

/** Jet de contrôle d'un véhicule touché (dégâts ≥ Résistance). */
function renderControlCard(d) {
  const lines = [
    `<header class="sc-chat-title"><i class="fa-solid fa-car-burst"></i> Perte de contrôle ? ${escapeHTML(d.name)}</header>`,
    `<p>Dégâts au moins égaux à la Résistance du véhicule : le ${driverWord(d.mode)}${d.pilot ? ` (${escapeHTML(d.pilot)})` : ""} doit réussir un jet de Manœuvre, sinon c'est une <strong>Perte de contrôle</strong> (table p. 128).</p>`
  ];
  lines.push(d.state === "resolved" ? `<div class="sc-chat-result">${d.result ?? ""}</div>` : resolveButtons(d));
  return `<div class="sc-chat sc-complication">${lines.join("")}</div>`;
}

export function renderComplicationCard(d) {
  if (d.kind === "control") return renderControlCard(d);
  const comp = complicationFor(d.suit, { cityStreets: d.cityStreets });
  const skill = MODES[d.mode]?.skill ?? "Manœuvre";
  const chase = d.suit
    ? `<span class="sc-suit sc-suit-${d.suit}">${SUIT_SYMBOLS[d.suit]} ${SUIT_LABELS[d.suit]}</span>`
    : `<em>inconnue</em>`;
  const lines = [
    `<header class="sc-chat-title"><span class="sc-suit sc-suit-clubs">♣</span> Complication : ${escapeHTML(d.name)}</header>`,
    `<p>Carte d'action <strong>${escapeHTML(d.actionLabel)}</strong> : quelque chose se passe de travers (obstacle, moteur qui cale, terrain boueux…). ${help("La carte d'action déclenche la Complication ; l'enseigne de la carte de poursuite où se trouve l'unité en fixe le modificateur et la conséquence en cas d'Échec.")}</p>`,
    `<p>Carte de poursuite : ${chase}</p>`
  ];
  if (comp) {
    lines.push(`<p>Jet de <strong>${escapeHTML(skill)}</strong> en action gratuite, à ${signed(modsTotal(comp.mods))} (${escapeHTML(modsText(comp.mods))}).</p>`);
    lines.push(`<p class="sc-chat-warn">${escapeHTML(comp.failureText)}</p>`);
  } else {
    lines.push(`<p class="sc-chat-warn">Le jeton n'est pas rattaché à la piste : l'enseigne sera demandée au moment du jet.</p>`);
  }
  if (d.state === "resolved") {
    lines.push(`<div class="sc-chat-result">${d.result ?? ""}</div>`);
  } else {
    const sugg = (o) => d.suggested === o ? " sc-suggested" : "";
    lines.push(`<div class="sc-chat-buttons"><button type="button" data-sc="complication-roll"><i class="fa-solid fa-dice"></i> Lancer le jet</button></div>`);
    lines.push(`<div class="sc-chat-resolve"><span>Résultat, après une éventuelle relance avec un Jeton :</span>
      <div class="sc-chat-buttons">
        <button type="button" data-sc="complication-resolve" data-outcome="success" class="sc-ok${sugg("success")}">Réussite</button>
        <button type="button" data-sc="complication-resolve" data-outcome="failure" class="sc-ko${sugg("failure")}">Échec</button>
      </div></div>`);
  }
  return `<div class="sc-chat sc-complication">${lines.join("")}</div>`;
}

/** Crée le message de Complication (côté MJ). */
export async function postComplication({ combat, combatant, unit, actionCard, chaseCard, chase }) {
  const data = {
    combatId: combat.id, combatantId: combatant.id, round: combat.round,
    name: combatant.name, actionLabel: actionCard?.label ?? "♣",
    mode: unit.mode, suit: chaseCard?.suit ?? null,
    cityStreets: !!chase.cityStreets, rooftops: !!chase.rooftops,
    state: "pending", suggested: null, result: null
  };
  const owners = game.users.filter((u) => !u.isGM && combatant.actor?.testUserPermission(u, "OWNER")).map((u) => u.id);
  return ChatMessage.create({
    content: renderComplicationCard(data),
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token }),
    flags: { [MODULE_ID]: { complication: data } },
    whisper: combatant.hidden ? game.users.filter((u) => u.isGM).map((u) => u.id) : [],
    sound: owners.length ? CONFIG.sounds?.notification : undefined
  });
}

/** Message de jet de contrôle d'un véhicule (côté MJ). */
export async function postControlCheck({ combat, combatant, unit }) {
  const data = {
    kind: "control", combatId: combat.id, combatantId: combatant.id, round: combat.round,
    name: combatant.name, mode: unit.mode, pilot: pilotName(combatant.actor), state: "pending", suggested: null, result: null
  };
  return ChatMessage.create({
    content: renderComplicationCard(data),
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token }),
    flags: { [MODULE_ID]: { complication: data } }
  });
}

async function updateCard(message, patch) {
  const data = { ...message.flags[MODULE_ID].complication, ...patch };
  await message.update({ content: renderComplicationCard(data), [`flags.${MODULE_ID}.complication`]: data });
  return data;
}

function findCombatant(d) {
  return game.combats.get(d.combatId)?.combatants.get(d.combatantId) ?? null;
}

async function askSuit() {
  const { DialogV2 } = foundry.applications.api;
  const suits = ["spades", "hearts", "diamonds", "clubs", "joker"];
  return DialogV2.wait({
    window: { title: "Carte de poursuite" },
    content: `<p>Sur quelle carte de poursuite se trouve l'unité ? L'enseigne fixe le modificateur et la conséquence.</p>`,
    buttons: suits.map((s) => ({ action: s, label: `${SUIT_SYMBOLS[s]} ${SUIT_LABELS[s]}` })),
    rejectClose: false
  });
}

// ---------- Côté client : boutons du message ----------

export function bindComplicationCard(message, html) {
  const d = message.flags?.[MODULE_ID]?.complication;
  if (!d || d.kind === "opposed") return;
  const combatant = findCombatant(d);
  const allowed = canControl(game.user, combatant);
  for (const btn of html.querySelectorAll("[data-sc]")) {
    if (!allowed) { btn.disabled = true; btn.dataset.tooltip = "Réservé au joueur de ce participant et au MJ."; continue; }
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      btn.disabled = true;
      try {
        if (btn.dataset.sc === "complication-roll") await onRoll(message, d, combatant);
        else if (btn.dataset.sc === "complication-resolve") await asGM("complicationResolve", { messageId: message.id, outcome: btn.dataset.outcome });
      } finally { btn.disabled = false; }
    });
  }
}

async function onRoll(message, d, combatant) {
  if (d.kind === "control") {
    const res = await rollManeuver(combatant, d.mode, [], "Jet de contrôle");
    const outcome = traitOutcome(readRoll(res?.roll));
    if (outcome) await asGM("complicationPatch", { messageId: message.id, patch: { suggested: outcome === "success" || outcome === "raise" ? "success" : "failure" } });
    return;
  }
  let suit = d.suit;
  if (!suit) {
    suit = await askSuit();
    if (!suit) return;
    await asGM("complicationPatch", { messageId: message.id, patch: { suit } });
  }
  const comp = complicationFor(suit, { cityStreets: d.cityStreets });
  const res = await rollManeuver(combatant, d.mode, comp.mods, `Complication (${SUIT_LABELS[suit]})`);
  const outcome = traitOutcome(readRoll(res?.roll));
  if (outcome) {
    await asGM("complicationPatch", { messageId: message.id, patch: { suggested: outcome === "success" || outcome === "raise" ? "success" : "failure" } });
  }
}

/** Lance automatiquement le jet de Complication sur ce client (début du tour du participant). */
export async function promptComplicationRoll(messageId) {
  const message = game.messages.get(messageId);
  const d = message?.flags?.[MODULE_ID]?.complication;
  if (!d || d.state === "resolved") return;
  const combatant = findCombatant(d);
  if (!canControl(game.user, combatant)) return;
  ui.notifications.info(`${d.name} : Complication avant d'agir, jet de Manœuvre en action gratuite.`);
  await onRoll(message, d, combatant);
}

/** Message de Complication en attente pour un combattant et un round, s'il existe. */
export function pendingComplication(combatId, combatantId, round) {
  return game.messages.contents.findLast?.((m) => {
    const d = m.flags?.[MODULE_ID]?.complication;
    return d && d.combatId === combatId && d.combatantId === combatantId && d.round === round && d.state !== "resolved";
  }) ?? null;
}

/** Marque le message comme proposé (côté MJ). */
export async function markPrompted(message) {
  return updateCard(message, { prompted: true });
}

// ---------- Côté MJ : résolution ----------

export async function resolveComplication({ messageId, outcome }, user) {
  const message = game.messages.get(messageId);
  const d = message?.flags?.[MODULE_ID]?.complication;
  if (!d || d.state === "resolved") return;
  const combatant = findCombatant(d);
  if (!canControl(user, combatant)) return;
  if (d.kind === "control") {
    if (outcome === "success") {
      return updateCard(message, { state: "resolved", result: `<p class="sc-ok-text"><i class="fa-solid fa-check"></i> Le ${driverWord(d.mode)} garde le contrôle.</p>` });
    }
    const applied = await applyCriticalEffect({ outOfControl: true }, combatant);
    return updateCard(message, { state: "resolved", result: `<p class="sc-ko-text"><i class="fa-solid fa-car-burst"></i> <strong>Perte de contrôle</strong>.</p><p class="sc-applied">${applied}</p>` });
  }
  await updateCard(message, { state: "resolved", result: "<p>…</p>" });
  const html = await complicationConsequenceGM({ ...d, combatant, outcome });
  return updateCard(message, { state: "resolved", result: html });
}

/**
 * Conséquence d'une Complication (côté MJ) : rien sur un Succès ; Bousculé (direction choisie par le
 * camp adverse, jeton déplacé) ou Échec critique de Manœuvre selon l'enseigne de la carte de poursuite.
 * @returns {Promise<string>} compte rendu HTML
 */
export async function complicationConsequenceGM({ combatId, combatantId, combatant, name, mode, suit, cityStreets, rooftops, outcome }) {
  const comp = complicationFor(suit, { cityStreets, mode, rooftops });
  if (outcome === "success" || !comp) {
    return `<p class="sc-ok-text"><i class="fa-solid fa-check"></i> Complication surmontée.</p>`;
  }
  if (comp.failure === "bumped") {
    const n = comp.cards === 2 ? "deux cartes" : "une carte";
    const steps = await askMove({
      title: `Bousculé : ${name}`,
      intro: `<p><strong>${escapeHTML(name)}</strong> est Bousculé de ${n}. Le camp adverse choisit la direction.</p>`,
      choices: bumpChoices(comp.cards)
    });
    if (steps) await moveUnitGM({ combatId, combatantId, steps, why: "Bousculé" }, game.user);
    return `<p class="sc-ko-text"><i class="fa-solid fa-arrows-left-right"></i> ${escapeHTML(name)} est <strong>Bousculé</strong> de ${n} de poursuite (direction choisie par le camp adverse).</p>`;
  }
  return criticalFailureGM(combatant, mode, { rooftops, name });
}

/** Échec critique de Manœuvre : dé si besoin, effet appliqué ; renvoie le compte rendu (HTML). Côté MJ. */
export async function criticalFailureGM(combatant, mode, { rooftops = false, name = combatant?.name } = {}) {
  let die = null;
  if (needsCriticalDie(mode)) {
    const roll = await new Roll("1d6").evaluate();
    die = roll.total;
    await roll.toMessage({
      flavor: `Échec critique de Manœuvre : ${escapeHTML(name)}`,
      speaker: ChatMessage.getSpeaker({ actor: combatant?.actor })
    });
  }
  const eff = criticalFailureEffect(mode, die, { rooftops });
  const applied = await applyCriticalEffect(eff, combatant);
  return `<p class="sc-ko-text"><i class="fa-solid fa-triangle-exclamation"></i> <strong>Échec critique</strong> de ${escapeHTML(name)}${die != null ? ` (dé : ${die})` : ""} : ${escapeHTML(eff.text)}</p>${applied ? `<p class="sc-applied">${applied}</p>` : ""}`;
}

/** Applique ce qui peut l'être ; renvoie un texte décrivant ce qui a été fait (HTML). */
async function applyCriticalEffect(eff, combatant) {
  const actor = combatant?.actor;
  if (eff.fatigue === "self" && actor) return addFatigue(actor);
  if (eff.fatigue === "mount") {
    const mount = combatant?.parent ? mountOf(combatant.parent, combatant) : null;
    return mount ? addFatigue(mount.actor, ` à la monture (${mount.name})`) : "Fatigue à appliquer sur la fiche de la monture (aucune monture associée dans les réglages).";
  }
  if (eff.outOfControl) {
    const api = game.modules.get("swade-vehicle")?.active ? game.modules.get("swade-vehicle").api : null;
    if (actor?.type === "vehicle" && api?.applyOutOfControl) {
      const total = await api.applyOutOfControl(actor);
      return `Table des Pertes de contrôle tirée (${total}) et appliquée par swade-vehicle.`;
    }
    return "Tirez 2d6 sur la table des Pertes de contrôle (p. 128).";
  }
  return "";
}

export async function patchComplication({ messageId, patch }, user) {
  const message = game.messages.get(messageId);
  const d = message?.flags?.[MODULE_ID]?.complication;
  if (!d || d.state === "resolved") return;
  if (!canControl(user, findCombatant(d))) return;
  const allowed = {};
  if ("suit" in patch && ["spades", "hearts", "diamonds", "clubs", "joker"].includes(patch.suit)) allowed.suit = patch.suit;
  if ("suggested" in patch && ["success", "failure"].includes(patch.suggested)) allowed.suggested = patch.suggested;
  if (Object.keys(allowed).length) await updateCard(message, allowed);
}
