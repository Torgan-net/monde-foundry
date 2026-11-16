/**
 * Automatismes côté MJ actif : détection des Complications (trèfle) et des jetons hors piste.
 */
import { OFF_TRACK_REASONS, STATUS } from "../constants.js";
import { isChaseActive, writeUnit } from "./state.js";
import { computeChaseView, chaseCardOf } from "./chase.js";
import { startComplicationGM } from "./complication-flow.js";
import { escapeHTML } from "./util.js";

const isActiveGM = () => !!game.users.activeGM?.isSelf;

/** Compatibilité : la Complication ne s'ouvre plus à la distribution, mais au début du tour du participant. */
export async function checkComplications(combat) {
  return startComplicationGM(combat);
}

export async function promptComplicationAtTurn(combat) {
  return startComplicationGM(combat);
}

let offTrackBusy = false;

/** Propose au MJ de sortir de la poursuite les jetons hors piste (une question par position). */
export async function checkOffTrack(combat) {
  if (!isActiveGM() || !isChaseActive(combat) || offTrackBusy) return;
  offTrackBusy = true;
  try {
    const view = computeChaseView(combat);
    if (!view?.track.length) return;
    for (const [id, u] of view.units) {
      if (u.unit.status !== "in" || u.loc.onTrack) continue;
      if (!["before", "after", "far"].includes(u.loc.reason)) continue;
      const tok = u.combatant.token;
      const key = `${Math.round(tok.x)},${Math.round(tok.y)}`;
      if (u.unit.offTrackAck === key) continue;
      const choice = await askOffTrack(u.combatant.name, OFF_TRACK_REASONS[u.loc.reason]);
      if (!choice) continue;
      if (choice === "stay") await writeUnit(combat, id, { offTrackAck: key });
      else await writeUnit(combat, id, { status: choice, offTrackAck: key });
      if (choice !== "stay") {
        await ChatMessage.create({
          content: `<div class="sc-chat"><strong>${escapeHTML(u.combatant.name)}</strong> : ${escapeHTML(STATUS[choice])}.</div>`,
          speaker: { alias: "Poursuite" }
        });
      }
    }
  } finally {
    offTrackBusy = false;
  }
}

async function askOffTrack(name, where) {
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({
    window: { title: "Jeton hors piste", icon: "fa-solid fa-person-running" },
    content: `<p><strong>${escapeHTML(name)}</strong> est ${escapeHTML(where)}.</p>
      <p>Que faire ?</p>
      <ul class="sc-dialog-list">
        <li><strong>Hors poursuite</strong> : plus aucune action liée à la poursuite.</li>
        <li><strong>Soutien et Épreuve</strong> : il reste actif pour aider ses alliés ou éprouver un adversaire, sans manœuvre ni Complication.</li>
        <li><strong>Laisser</strong> : erreur de placement, il reste dans la poursuite.</li>
      </ul>`,
    buttons: [
      { action: "out", label: "Hors poursuite", icon: "fa-solid fa-flag-checkered" },
      { action: "support", label: "Soutien et Épreuve", icon: "fa-solid fa-hands-helping" },
      { action: "stay", label: "Laisser", icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false
  });
}
