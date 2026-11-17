/**
 * Complication au début du tour du participant (règle : avant toute action).
 * État : combat.flags.swade-chase.units.<id>.complication = { round, suit, state, suggested, result }
 * Le panneau de poursuite porte le jet et le résultat ; le chat reçoit l'annonce puis le résultat.
 */
import { MODES } from "../constants.js";
import { triggersComplication, SUIT_LABELS, SUIT_SYMBOLS, chaseCardLabel } from "../rules/cards.js";
import { complicationFor, traitOutcome } from "../rules/complication.js";
import { isChaseActive, getUnit, writeUnit } from "./state.js";
import { computeChaseView, chaseCardOf } from "./chase.js";
import { asGM, broadcast, canControl } from "./socket.js";
import { rollManeuver, readRoll } from "./rolls.js";
import { complicationConsequenceGM } from "./complication-card.js";
import { pilotName } from "./mount.js";
import { driverWord, VEHICLE_MODES } from "../rules/complication.js";
import { modsPhrase } from "../rules/wording.js";
import { escapeHTML, modsText, modsTotal, signed } from "./util.js";

const SUITS = ["spades", "hearts", "diamonds", "clubs", "joker"];
const isActiveGM = () => !!game.users.activeGM?.isSelf;

/** « du pilote X » pour un véhicule (swade-vehicle), sinon rien. */
function rollerPhrase(combatant, mode) {
  if (combatant?.actor?.type !== "vehicle") return "";
  const name = pilotName(combatant.actor);
  const word = VEHICLE_MODES.includes(mode) ? driverWord(mode) : "conducteur";
  return name ? ` du ${word} ${escapeHTML(name)}` : ` du ${word}`;
}

/** Complication en attente pour ce round ? */
export function pendingComplication(unit, round) {
  const c = unit?.complication;
  return c && c.round === round && c.state !== "resolved" ? c : null;
}

/** Ouvre la Complication du participant actif s'il a tiré un trèfle (une fois par round). Côté MJ. */
export async function startComplicationGM(combat) {
  if (!isActiveGM() || !isChaseActive(combat) || !combat.started) return;
  const current = combat.combatant;
  if (!current) return;
  const view = computeChaseView(combat);
  const u = view?.units.get(current.id);
  if (!u || u.unit.status !== "in" || !triggersComplication(u.actionCard)) return;
  if (u.unit.complication?.round === combat.round) return;

  const chaseCard = chaseCardOf(view, current.id);
  const c = { round: combat.round, suit: chaseCard?.suit ?? null, state: "pending", suggested: null, result: null };
  await writeUnit(combat, current.id, { complication: c, complicationRound: combat.round });

  const comp = complicationFor(c.suit, { cityStreets: view.chase.cityStreets, mode: u.unit.mode, rooftops: view.chase.rooftops });
  const skill = MODES[u.unit.mode]?.skill ?? "Manœuvre";
  const who = rollerPhrase(current, u.unit.mode);
  const where = chaseCard ? `carte de poursuite <strong>${chaseCardLabel(chaseCard)}</strong> (${SUIT_LABELS[chaseCard.suit]})` : "carte de poursuite à préciser";
  await ChatMessage.create({
    content: `<div class="sc-chat"><header class="sc-chat-title"><span class="sc-suit sc-suit-clubs">♣</span> Complication : ${escapeHTML(current.name)}</header>
      <p>Carte d'action <strong>${escapeHTML(u.actionCard.label)}</strong>, ${where}.${comp ? ` Avant d'agir : jet de ${escapeHTML(skill)}${who} ${modsPhrase(comp.mods)}, en action gratuite. ${escapeHTML(comp.failureText)}` : ""}</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor: current.actor, token: current.token })
  });

  if (c.suit) {
    const player = game.users.find((usr) => usr.active && !usr.isGM && current.actor?.testUserPermission(usr, "OWNER"));
    await broadcast("promptUnitComplication", { combatId: combat.id, combatantId: current.id, userId: (player ?? game.user).id });
  }
}

/** Jet de Complication (client du joueur ou du MJ). */
export async function rollUnitComplication(combat, combatantId) {
  const combatant = combat?.combatants.get(combatantId);
  if (!combatant || !canControl(game.user, combatant)) return;
  const unit = getUnit(combat, combatant);
  const c = pendingComplication(unit, combat.round);
  if (!c?.suit) return;
  const chase = combat.flags?.["swade-chase"]?.chase ?? {};
  const comp = complicationFor(c.suit, { cityStreets: !!chase.cityStreets, mode: unit.mode });
  const res = await rollManeuver(combatant, unit.mode, comp.mods, `Complication (${SUIT_LABELS[c.suit]})`);
  const outcome = traitOutcome(readRoll(res?.roll));
  if (outcome) {
    await asGM("unitComplicationPatch", { combatId: combat.id, combatantId,
      patch: { suggested: outcome === "success" || outcome === "raise" ? "success" : "failure" } });
  }
}

export async function patchUnitComplicationGM({ combatId, combatantId, patch }, user) {
  const combat = game.combats.get(combatId);
  const combatant = combat?.combatants.get(combatantId);
  if (!combatant || !canControl(user, combatant)) return;
  const c = pendingComplication(getUnit(combat, combatant), combat.round);
  if (!c) return;
  const next = { ...c };
  if (SUITS.includes(patch?.suit)) next.suit = patch.suit;
  if (["success", "failure"].includes(patch?.suggested)) next.suggested = patch.suggested;
  await writeUnit(combat, combatantId, { complication: next });
}

export async function resolveUnitComplicationGM({ combatId, combatantId, outcome }, user) {
  const combat = game.combats.get(combatId);
  const combatant = combat?.combatants.get(combatantId);
  if (!combatant || !canControl(user, combatant) || !["success", "failure"].includes(outcome)) return;
  const unit = getUnit(combat, combatant);
  const c = pendingComplication(unit, combat.round);
  if (!c?.suit) return;
  await writeUnit(combat, combatantId, { complication: { ...c, state: "resolving" } });
  const chase = combat.flags?.["swade-chase"]?.chase ?? {};
  const html = await complicationConsequenceGM({
    combatId, combatantId, combatant, name: combatant.name, mode: unit.mode, suit: c.suit,
    cityStreets: !!chase.cityStreets, rooftops: !!chase.rooftops, outcome
  });
  await writeUnit(combat, combatantId, { complication: { ...c, state: "resolved", result: outcome } });
  await ChatMessage.create({
    content: `<div class="sc-chat"><strong>Complication de ${escapeHTML(combatant.name)}</strong> (${SUIT_SYMBOLS[c.suit]} ${SUIT_LABELS[c.suit]}) : ${outcome === "success" ? "réussite" : "échec"}.${html}</div>`,
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token })
  });
}

/** Contexte du bloc Complication du panneau. */
export function complicationBlock(combat, combatant, unit, canAct) {
  const c = pendingComplication(unit, combat.round);
  if (!c) return null;
  const chase = combat.flags?.["swade-chase"]?.chase ?? {};
  const comp = c.suit ? complicationFor(c.suit, { cityStreets: !!chase.cityStreets, mode: unit.mode, rooftops: !!chase.rooftops }) : null;
  return {
    suit: c.suit, suitLabel: c.suit ? SUIT_LABELS[c.suit] : null, symbol: c.suit ? SUIT_SYMBOLS[c.suit] : null,
    red: c.suit === "hearts" || c.suit === "diamonds",
    total: comp ? modsPhrase(comp.mods) : null,
    roller: rollerPhrase(combatant, unit.mode),
    modsText: comp?.mods.length ? modsText(comp.mods) : "",
    failureText: comp?.failureText ?? "",
    skill: MODES[unit.mode]?.skill ?? "Manœuvre",
    needSuit: !c.suit,
    suits: SUITS.map((s) => ({ value: s, label: `${SUIT_SYMBOLS[s]} ${SUIT_LABELS[s]}` })),
    suggestedSuccess: c.suggested === "success", suggestedFailure: c.suggested === "failure",
    busy: c.state === "resolving",
    canAct
  };
}
