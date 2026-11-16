/**
 * Déplacement des jetons le long de la piste (exécuté par le MJ actif) et choix du déplacement.
 */
import { moveIndex, shiftPosition, moveChoices } from "../rules/movement.js";
import { chaseCardLabel } from "../rules/cards.js";
import { canControl } from "./socket.js";
import { computeChaseView } from "./chase.js";
import { escapeHTML } from "./util.js";

const gmIds = () => game.users.filter((u) => u.isGM).map((u) => u.id);
const plural = (n) => (n > 1 ? `${n} cartes` : "1 carte");

/**
 * Déplace l'unité de `steps` cartes (positif : vers l'avant). Côté MJ.
 * @param {{combatId:string, combatantId:string, steps:number, why?:string, force?:boolean}} payload
 *   force : déplacement imposé par un autre (Bousculé) — réservé au MJ.
 */
export async function moveUnitGM({ combatId, combatantId, steps, why = "" }, user) {
  const combat = game.combats.get(combatId);
  const combatant = combat?.combatants.get(combatantId);
  if (!combatant || !canControl(user, combatant)) return;
  steps = Math.trunc(Number(steps) || 0);
  if (!steps) return;
  const view = computeChaseView(combat);
  const me = view?.units.get(combatantId);
  const tok = combatant.token;
  if (!me || !tok) return;
  const name = escapeHTML(combatant.name);

  if (!me.loc.onTrack) {
    return ChatMessage.create({
      content: `<div class="sc-chat"><strong>${name}</strong> : position sur la piste inconnue, déplacez le jeton à la main (${plural(Math.abs(steps))} ${steps > 0 ? "vers l'avant" : "vers l'arrière"}).</div>`,
      whisper: gmIds(), speaker: { alias: "Poursuite" }
    });
  }

  const from = view.track[me.loc.index];
  const { index, overflow, side } = moveIndex(view.track.length, me.loc.index, steps);
  if (index !== me.loc.index) {
    await tok.update(shiftPosition({ x: tok.x, y: tok.y }, from, view.track[index]));
    const to = view.track[index];
    await ChatMessage.create({
      content: `<div class="sc-chat"><strong>${name}</strong>${why ? ` (${escapeHTML(why)})` : ""} : ${steps > 0 ? "avance" : "recule"} de ${plural(Math.abs(index - me.loc.index))}, sur le <strong>${chaseCardLabel(to)}</strong> (${index + 1} / ${view.track.length}).</div>`,
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: tok })
    });
  }
  if (overflow) {
    await ChatMessage.create({
      content: `<div class="sc-chat sc-chat-warn"><strong>Piste trop courte</strong> : ${name} doit aller ${plural(overflow)} plus ${side === "after" ? "loin que la dernière" : "en arrière que la première"} carte. Ajoutez ${plural(overflow)} ${side === "after" ? "à droite" : "à gauche"} de la piste, puis déplacez le jeton.</div>`,
      whisper: gmIds(), speaker: { alias: "Poursuite" }
    });
  }
}

/**
 * Demande un déplacement (fenêtre) ; renvoie le nombre de cartes (signé) ou null.
 * @param {{title:string, intro:string, choices:{steps:number,label:string}[], suggested?:number}} o
 */
export async function askMove({ title, intro, choices, suggested = null }) {
  const { DialogV2 } = foundry.applications.api;
  const answer = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-arrows-left-right" },
    content: `<div class="sc-dialog">${intro}</div>`,
    buttons: choices.map((c) => ({
      action: `m${c.steps}`, label: c.label,
      icon: c.steps > 0 ? "fa-solid fa-arrow-right" : (c.steps < 0 ? "fa-solid fa-arrow-left" : "fa-solid fa-xmark"),
      default: c.steps === suggested
    })),
    rejectClose: false
  });
  if (typeof answer !== "string" || !answer.startsWith("m")) return null;
  return Number(answer.slice(1));
}

/** Choix « exactement n cartes » dans un sens ou l'autre (Bousculé). */
export function bumpChoices(n) {
  return moveChoices({ max: n, stay: false }).filter((c) => Math.abs(c.steps) === n);
}
