/**
 * Déplacement des jetons le long de la piste (exécuté par le MJ actif) et choix du déplacement.
 */
import { moveIndex, shiftPosition, moveChoices, freeSpot } from "../rules/movement.js";
import { writeChase } from "./state.js";
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
    const grid = tok.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
    const size = (t) => ({ w: (t.width ?? 1) * grid, h: (t.height ?? 1) * grid });
    const wanted = { ...shiftPosition({ x: tok.x, y: tok.y }, from, view.track[index]), ...size(tok) };
    const others = (tok.parent?.tokens ? [...tok.parent.tokens] : [...combat.combatants].map((c) => c.token))
      .filter((t) => t && t.id !== tok.id && !t.hidden)
      .map((t) => ({ x: t.x, y: t.y, ...size(t) }));
    const first = view.track[0], last = view.track[view.track.length - 1];
    const len = Math.hypot(last.cx - first.cx, last.cy - first.cy) || 1;
    const along = { x: (last.cx - first.cx) / len, y: (last.cy - first.cy) / len };
    await tok.update(freeSpot(wanted, others, { step: grid, along }));
    const to = view.track[index];
    await ChatMessage.create({
      content: `<div class="sc-chat"><strong>${name}</strong>${why ? ` (${escapeHTML(why)})` : ""} : ${steps > 0 ? "avance" : "recule"} de ${plural(Math.abs(index - me.loc.index))}, sur le <strong>${chaseCardLabel(to)}</strong> (${index + 1} / ${view.track.length}).</div>`,
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: tok })
    });
  }
  if (overflow && side === "after") {
    const { DialogV2 } = foundry.applications.api;
    const end = await DialogV2.confirm({
      window: { title: "Fin de la piste", icon: "fa-solid fa-flag-checkered" },
      content: `<p><strong>${name}</strong> dépasse la dernière carte de la piste de ${plural(overflow)}.</p><p>Mettre fin à la poursuite ? (Sinon, ajoutez des cartes à droite de la piste.)</p>`,
      rejectClose: false
    });
    if (end) {
      await writeChase(combat, { active: false });
      await ChatMessage.create({
        content: `<div class="sc-chat"><strong>Fin de la poursuite</strong> : ${name} a dépassé la dernière carte de la piste.</div>`,
        speaker: { alias: "Poursuite" }
      });
      return;
    }
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
