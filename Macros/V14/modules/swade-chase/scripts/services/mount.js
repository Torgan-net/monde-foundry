/**
 * Monture d'un cavalier : jeton de la scène choisi par le MJ (unit.mountTokenId).
 */
import { getUnit } from "./state.js";

/** @returns {{tokenId:string, name:string, actor:Actor}|null} */
export function mountOf(combat, combatant, unit = getUnit(combat, combatant)) {
  if (unit.mode !== "mounted" || !unit.mountTokenId) return null;
  const scene = combat?.scene ?? canvas?.scene;
  const tok = scene?.tokens?.get(unit.mountTokenId);
  if (!tok?.actor) return null;
  return { tokenId: tok.id, name: tok.name ?? tok.actor.name, actor: tok.actor };
}

/** Jetons de la scène proposables comme monture (tous sauf le cavalier). */
export function mountCandidates(combat, combatant) {
  const scene = combat?.scene ?? canvas?.scene;
  const out = [];
  for (const tok of scene?.tokens ?? []) {
    if (!tok?.actor || tok.id === combatant.tokenId) continue;
    out.push({ value: tok.id, label: tok.name ?? tok.actor.name });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/** Ajoute un niveau de Fatigue (plafonné) ; renvoie le compte rendu. Côté MJ. */
export async function addFatigue(actor, who = "") {
  const f = actor?.system?.fatigue;
  if (!f || typeof f.value !== "number") return `Fatigue à appliquer sur la fiche${who}.`;
  const max = typeof f.max === "number" ? f.max : f.value + 1;
  if (f.value >= max) return `Déjà au maximum de Fatigue${who} : vérifiez l'Incapacité.`;
  const next = f.value + 1;   // lu avant l'update : Foundry modifie system en place
  await actor.update({ "system.fatigue.value": next });
  return `Fatigue appliquée${who} : ${next} / ${max}.`;
}

/** Pilote d'un véhicule selon swade-vehicle (nom), sinon null. */
export function pilotName(actor) {
  if (actor?.type !== "vehicle") return null;
  const mod = game.modules?.get?.("swade-vehicle");
  const api = mod?.active ? mod.api : null;
  try { return api?.getPilot?.(actor)?.name ?? null; } catch { return null; }
}
