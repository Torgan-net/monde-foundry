/**
 * Vue calculée d'une poursuite : piste, position de chaque unité, adversaires, actions possibles.
 * Lecture seule.
 */
import { MODULE_ID } from "../constants.js";
import { readActionCard, isOnHold } from "../rules/cards.js";
import { buildActions } from "../rules/maneuvers.js";
import { applyTurnLimits, currentTurn, blockForComplication } from "../rules/turn.js";
import { autoSpeedBonus } from "../rules/speed.js";
import { unitSpeed } from "./speed-reader.js";
import { mountOf } from "./mount.js";
import { getChase, getUnit } from "./state.js";
import { readSceneTrack, locateCombatant } from "./track-reader.js";

/**
 * @returns {{chase:object, track:object[], round:number, units:Map<string, {combatant, unit, loc, actionCard, side}>}|null}
 */
export function computeChaseView(combat) {
  const chase = getChase(combat);
  if (!combat || !chase) return null;
  const track = readSceneTrack(combat.scene ?? canvas?.scene);
  const units = new Map();
  for (const combatant of combat.combatants) {
    if (combatant.isDefeated) continue;
    const unit = getUnit(combat, combatant);
    const mount = mountOf(combat, combatant, unit);
    units.set(combatant.id, {
      mount,
      combatant, unit,
      loc: locateCombatant(track, combatant),
      actionCard: readActionCard(combatant.system),
      onHold: isOnHold(combatant.system),
      speed: unitSpeed(combatant.actor, unit.mode, mount?.actor),
      isVehicle: combatant.actor?.type === "vehicle",
      side: combatant.token?.disposition ?? 0
    });
  }
  return { chase, track, round: combat.round ?? 0, units };
}

/** Adversaires « dans la poursuite » d'une unité, avec l'écart en cartes (null si inconnu). */
export function opponentsOf(view, combatantId) {
  const me = view.units.get(combatantId);
  if (!me) return [];
  const out = [];
  for (const [id, u] of view.units) {
    if (id === combatantId || u.side === me.side || u.unit.status !== "in") continue;
    const gap = (me.loc.onTrack && u.loc.onTrack) ? Math.abs(me.loc.index - u.loc.index) : null;
    out.push({ id, name: u.combatant.name, gap, speed: u.speed });
  }
  return out;
}

/**
 * Bonus de vitesse calculé face au plus rapide des assaillants : Vitesse max entre véhicules,
 * Allure entre personnages à pied (null si les grandeurs diffèrent ou si une valeur manque).
 */
export function autoSpeedFor(view, combatantId) {
  const me = view.units.get(combatantId);
  if (!me) return null;
  return autoSpeedBonus(me.speed, opponentsOf(view, combatantId).map((o) => o.speed));
}

/** @param {{speedBonus?:number}} [options] bonus de vitesse choisi à la main ; sinon calcul automatique */
export function actionsFor(view, combatantId, { speedBonus } = {}) {
  const me = view.units.get(combatantId);
  if (!me) return [];
  if (speedBonus == null) speedBonus = autoSpeedFor(view, combatantId)?.bonus ?? 0;
  const actions = buildActions({
    status: me.unit.status,
    mode: me.unit.mode,
    npcCrew: me.unit.npcCrew,
    round: view.round,
    marks: me.unit.marks,
    opponents: opponentsOf(view, combatantId),
    interval: view.chase.interval,
    speedBonus,
    onHold: me.onHold,
    boardedBy: me.unit.boardedBy?.name ?? null
  });
  const limited = applyTurnLimits(actions, currentTurn(me.unit.turn, view.round), { oneManeuver: view.chase.oneManeuver === true });
  const c = me.unit.complication;
  return c && c.round === view.round && c.state !== "resolved" ? blockForComplication(limited) : limited;
}

export function turnOf(view, combatantId) {
  const me = view.units.get(combatantId);
  return currentTurn(me?.unit.turn, view.round);
}

export function chaseCardOf(view, combatantId) {
  const me = view.units.get(combatantId);
  if (!me?.loc?.onTrack) return null;
  return view.track[me.loc.index] ?? null;
}

export const flagScope = MODULE_ID;
