import { MANEUVER_IDS } from "./maneuvers.js";
/**
 * Économie d'actions du tour (règle de table) :
 * - 1 action gratuite au plus (facultative) ;
 * - 1, 2 ou 3 actions standard prévues : malus d'actions multiples 0, −2 ou −4 sur les jets faits en action
 *   (transmis comme option « actions multiples » de la fenêtre de jet, pas comme modificateur) ;
 * - une action exclusive se joue seule : ni autre action, ni action gratuite, ni actions multiples ;
 * - option de table « une manœuvre » : au plus une manœuvre en action (+ une en action gratuite) ;
 * - Retenir son action (beforeAnyAction) : seulement avant toute autre action du round ;
 * - actions déclarées jouées : seule l'action gratuite reste possible (elle peut suivre l'action principale) ;
 * - tour terminé (actions déclarées + action gratuite, ou action exclusive) : tout est grisé, on passe la main ;
 * - le nombre d'actions prévues est verrouillé dès la première action engagée (sauf MJ).
 * Règles pures.
 */

export const MAX_ACTIONS = 3;
const MULTI = Object.freeze({ 1: 0, 2: -2, 3: -4 });

/** État du tour d'une unité pour le round courant (un état d'un round précédent est ignoré). */
export function currentTurn(turn, round) {
  const fresh = { round, planned: 1, free: null, standard: [], exclusive: false };
  if (!turn || turn.round !== round) return fresh;
  return {
    round,
    planned: Math.min(MAX_ACTIONS, Math.max(1, Number(turn.planned) || 1)),
    free: turn.free ?? null,
    standard: [...(turn.standard ?? [])],
    exclusive: !!turn.exclusive
  };
}

export function multiActionMod(planned) {
  const v = MULTI[planned] ?? 0;
  return v ? { label: `Actions multiples (${planned})`, value: v } : null;
}

/** Les actions déclarées (standard) sont toutes jouées ; l'action gratuite peut encore suivre. */
export function actionsSpent(turn) {
  return !!turn.exclusive || turn.standard.length >= turn.planned;
}

/**
 * Tour terminé : action exclusive jouée, ou actions déclarées ET action gratuite faites.
 * Il ne reste qu'à passer au participant suivant.
 */
export function turnDone(turn) {
  return !!turn.exclusive || (turn.standard.length >= turn.planned && !!turn.free);
}

/** Le nombre d'actions prévues ne change plus après la première action engagée (sauf correction du MJ). */
export function plannedLocked(turn) {
  return !!turn.free || turn.standard.length > 0 || !!turn.exclusive;
}

/** Nombre d'actions prévues minimal autorisé (on ne descend pas sous ce qui est déjà joué). */
export function minPlanned(turn) {
  return Math.max(1, turn.standard.length);
}

/**
 * Applique les limites du tour à la liste d'actions (copie) : retire les variantes interdites,
 * marque les jets en action avec le nombre d'actions prévues (multiAction, multiPenalty),
 * grise l'action si plus rien n'est possible.
 */
export function applyTurnLimits(actions, turn, { oneManeuver = false } = {}) {
  const used = turn.standard.length;
  const maneuverInAction = oneManeuver && turn.standard.some((id) => MANEUVER_IDS.has(id));
  const usedAny = used > 0 || !!turn.free;
  const multi = multiActionMod(turn.planned);

  const done = turnDone(turn);
  return actions.map((a) => {
    const action = { ...a, rolls: a.rolls.map((r) => ({ ...r, mods: [...r.mods] })), applies: a.applies.map((x) => ({ ...x })) };
    if (done) {
      if (action.available) {
        action.available = false;
        action.reason = "Tour terminé : actions et action gratuite faites, passez au participant suivant.";
      }
      action.rolls = []; action.applies = [];
      return action;
    }
    const hadVariants = action.rolls.length + action.applies.length > 0;
    if (action.available && action.beforeAnyAction && (usedAny || turn.exclusive)) {
      action.available = false;
      action.reason = "Seulement en début de round, avant toute autre action (même gratuite).";
      return action;
    }
    if (!action.available || !hadVariants) return action;

    let blocked = null;
    const allowed = (v) => {
      if (turn.exclusive) { blocked = "Une action exclusive a été jouée ce tour : aucune autre action possible."; return false; }
      if (action.exclusive) {
        if (usedAny) { blocked = "Action exclusive : seulement si aucune autre action (même gratuite) n'a été faite ce tour."; return false; }
        if (turn.planned > 1) { blocked = "Action exclusive : impossible avec des actions multiples (prévoyez 1 action)."; return false; }
      }
      if (v.cost === "free" && turn.free) { blocked = "Action gratuite déjà utilisée ce tour."; return false; }
      if (v.cost === "action" && action.maneuver && maneuverInAction) {
        blocked = "Une seule manœuvre en action par tour (une autre reste possible en action gratuite).";
        return false;
      }
      if (v.cost === "action" && used >= turn.planned) {
        blocked = `Toutes les actions prévues ce tour sont utilisées (${used} / ${turn.planned}).`;
        return false;
      }
      return true;
    };

    action.rolls = action.rolls.filter(allowed);
    action.applies = action.applies.filter(allowed);
    if (multi) for (const r of action.rolls) if (r.cost === "action") { r.multiAction = turn.planned; r.multiPenalty = multi.value; }

    if (!action.rolls.length && !action.applies.length) {
      action.available = false;
      action.reason = blocked ?? action.reason;
    }
    return action;
  });
}

/** Complication en attente : aucune action tant qu'elle n'est pas résolue (elle se joue avant le tour). */
export function blockForComplication(actions) {
  return actions.map((a) => ({
    ...a,
    available: false,
    reason: a.available ? "Résolvez d'abord la Complication (en haut du panneau)." : a.reason,
    rolls: [], applies: []
  }));
}

/** Ce qui reste à jouer ce tour (pour avertir avant de passer la main). */
export function remainingActions(turn) {
  if (turn.exclusive) return [];
  const out = [];
  const left = turn.planned - turn.standard.length;
  if (left > 0) out.push(`${left} action${left > 1 ? "s" : ""} sur ${turn.planned}`);
  if (!turn.free) out.push("l'action gratuite");
  return out;
}
