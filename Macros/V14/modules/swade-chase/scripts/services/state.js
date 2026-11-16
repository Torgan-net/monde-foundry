/**
 * État de la poursuite, stocké dans les flags du combat :
 *   flags.swade-chase.chase = { active, type, interval, cityStreets, rooftops }
 *   flags.swade-chase.units.<combatantId> = { mode, status, npcCrew, marks:{changedPosition, liftedFoot, evaded},
 *                                            complicationRound, offTrackAck,
 *                                            turn:{round, planned, free, standard:[], exclusive} }
 * Toutes les écritures passent par le MJ actif (voir socket.js).
 */
import { MODULE_ID, DEFAULT_CHASE, MODES } from "../constants.js";
import { deduceMode } from "../rules/mode.js";

export function getChase(combat) {
  const c = combat?.flags?.[MODULE_ID]?.chase;
  return c ? { ...DEFAULT_CHASE, ...c } : null;
}

export function isChaseActive(combat) {
  return !!getChase(combat)?.active;
}

/** Compétence de manœuvre d'un véhicule selon swade-vehicle (clé ou libellé), sinon null. */
function vehicleSkillOf(actor) {
  const mod = game.modules?.get?.("swade-vehicle");
  const api = mod?.active ? mod.api : null;
  if (typeof api?.getManeuverSkill !== "function") return null;
  const s = api.getManeuverSkill(actor);
  return s?.key ?? s?.label ?? null;
}

/** Mode déduit (réglage « Automatique »). */
export function defaultMode(combatant, mountTokenId = null) {
  const actor = combatant?.actor;
  const isVehicle = actor?.type === "vehicle";
  return deduceMode({ isVehicle, vehicleSkill: isVehicle ? vehicleSkillOf(actor) : null, hasMount: !!mountTokenId });
}

export function getUnit(combat, combatant) {
  const raw = combat?.flags?.[MODULE_ID]?.units?.[combatant.id] ?? {};
  const modeSetting = MODES[raw.mode] ? raw.mode : "auto";
  return {
    modeSetting,
    mode: modeSetting === "auto" ? defaultMode(combatant, raw.mountTokenId) : modeSetting,
    status: raw.status ?? "in",
    npcCrew: !!raw.npcCrew,
    marks: { ...(raw.marks ?? {}) },
    complicationRound: raw.complicationRound ?? null,
    offTrackAck: raw.offTrackAck ?? null,
    turn: raw.turn ?? null,
    boardedBy: raw.boardedBy ?? null,
    mountTokenId: raw.mountTokenId ?? null,
    complication: raw.complication ?? null
  };
}

/** Écriture côté MJ : patch à plat, ex. { status: "out", "marks.evaded": 3 }. */
export async function writeUnit(combat, combatantId, patch) {
  const update = {};
  for (const [k, v] of Object.entries(patch)) update[`flags.${MODULE_ID}.units.${combatantId}.${k}`] = v;
  return combat.update(update);
}

export async function writeChase(combat, patch) {
  const update = {};
  for (const [k, v] of Object.entries(patch)) update[`flags.${MODULE_ID}.chase.${k}`] = v;
  return combat.update(update);
}

/**
 * Registre des Bousculés du round : un assaillant ne Bouscule une même cible qu'une fois par tour.
 * flags.swade-chase.bumps = { round, pairs: ["attaquant>cible", …] }
 */
export function alreadyBumped(combat, attackerId, targetId) {
  const b = combat?.flags?.[MODULE_ID]?.bumps;
  return !!attackerId && b?.round === combat.round && (b.pairs ?? []).includes(`${attackerId}>${targetId}`);
}

export async function recordBump(combat, attackerId, targetId) {
  if (!attackerId) return;
  const b = combat?.flags?.[MODULE_ID]?.bumps;
  const pairs = b?.round === combat.round ? [...(b.pairs ?? [])] : [];
  pairs.push(`${attackerId}>${targetId}`);
  return combat.update({ [`flags.${MODULE_ID}.bumps`]: { round: combat.round, pairs } });
}
