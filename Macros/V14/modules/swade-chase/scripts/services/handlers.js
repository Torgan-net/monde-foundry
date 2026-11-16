/**
 * Traitements exécutés par le MJ actif (via socket.js) et actions lancées depuis le panneau.
 */
import { MODULE_ID, CHASE_TYPES, MODES, STATUS } from "../constants.js";
import { onGM, onAll, asGM, broadcast, canControl } from "./socket.js";
import { writeChase, writeUnit, getChase, getUnit } from "./state.js";
import { currentTurn, minPlanned, MAX_ACTIONS, multiActionMod, turnDone, plannedLocked } from "../rules/turn.js";
import { computeChaseView, actionsFor } from "./chase.js";
import { rollManeuver } from "./rolls.js";
import { armMultiAction } from "../integrations/roll-dialog.js";
import { moveUnitGM, askMove, bumpChoices } from "./movement.js";
import { moveChoices } from "../rules/movement.js";
import { traitOutcome } from "../rules/complication.js";
import { readRoll } from "./rolls.js";
import { postOpposed, patchOpposed, resolveOpposed, setBoardedGM, OPPOSED_ACTIONS } from "./opposed-card.js";
import { opponentsOf } from "./chase.js";
import { resolveComplication, patchComplication, promptComplicationRoll } from "./complication-card.js";
import { checkComplications, checkOffTrack } from "./watchers.js";
import { startComplicationGM, patchUnitComplicationGM, resolveUnitComplicationGM, rollUnitComplication } from "./complication-flow.js";
import { escapeHTML, modsText, signed } from "./util.js";

const MARK_KEYS = new Set(["changedPosition", "liftedFoot", "evaded"]);

export function registerHandlers({ openPanel }) {
  onGM("setChase", async ({ combatId, patch }, user) => {
    if (!user?.isGM) return;
    const combat = game.combats.get(combatId);
    if (!combat) return;
    const clean = {};
    if ("active" in patch) clean.active = !!patch.active;
    if ("type" in patch && CHASE_TYPES[patch.type]) {
      clean.type = patch.type;
      if (CHASE_TYPES[patch.type].interval) clean.interval = CHASE_TYPES[patch.type].interval;
    }
    if ("interval" in patch && Number(patch.interval) > 0) clean.interval = Math.round(Number(patch.interval));
    if ("cityStreets" in patch) clean.cityStreets = !!patch.cityStreets;
    if ("rooftops" in patch) clean.rooftops = !!patch.rooftops;
    if ("oneManeuver" in patch) clean.oneManeuver = !!patch.oneManeuver;
    await writeChase(combat, clean);
    if (clean.active) {
      await checkOffTrack(combat);
      await startComplicationGM(combat);
    }
  });

  onGM("setUnit", async ({ combatId, combatantId, patch }, user) => {
    if (!user?.isGM) return;
    const combat = game.combats.get(combatId);
    if (!combat?.combatants.get(combatantId)) return;
    const clean = {};
    if ("mode" in patch && (MODES[patch.mode] || patch.mode === "auto")) clean.mode = patch.mode === "auto" ? null : patch.mode;
    if ("status" in patch && STATUS[patch.status]) { clean.status = patch.status; clean.offTrackAck = null; }
    if ("npcCrew" in patch) clean.npcCrew = !!patch.npcCrew;
    if ("mountTokenId" in patch) clean.mountTokenId = patch.mountTokenId || null;
    await writeUnit(combat, combatantId, clean);
    if (clean.status === "in") await startComplicationGM(combat);
  });

  onGM("markUnit", async ({ combatId, combatantId, key }, user) => {
    const combat = game.combats.get(combatId);
    const combatant = combat?.combatants.get(combatantId);
    if (!MARK_KEYS.has(key) || !canControl(user, combatant)) return;
    await writeUnit(combat, combatantId, { [`marks.${key}`]: combat.round });
  });

  onGM("useAction", async ({ combatId, combatantId, actionId, cost, exclusive }, user) => {
    const combat = game.combats.get(combatId);
    const combatant = combat?.combatants.get(combatantId);
    if (!canControl(user, combatant) || !["free", "action"].includes(cost)) return;
    const turn = currentTurn(getUnit(combat, combatant).turn, combat.round);
    if (cost === "free") {
      if (turn.free) return;
      turn.free = actionId;
    } else {
      if (turn.standard.length >= turn.planned) return;
      turn.standard.push(actionId);
    }
    if (exclusive) turn.exclusive = true;
    await writeUnit(combat, combatantId, { turn });
  });

  onGM("setPlanned", async ({ combatId, combatantId, planned }, user) => {
    const combat = game.combats.get(combatId);
    const combatant = combat?.combatants.get(combatantId);
    if (!canControl(user, combatant)) return;
    const turn = currentTurn(getUnit(combat, combatant).turn, combat.round);
    if (turn.exclusive) return;
    if (plannedLocked(turn) && !user.isGM) return;   // verrouillé après la première action (correction MJ seulement)
    turn.planned = Math.min(MAX_ACTIONS, Math.max(minPlanned(turn), Number(planned) || 1));
    await writeUnit(combat, combatantId, { turn });
  });

  onGM("resetTurn", async ({ combatId, combatantId }, user) => {
    const combat = game.combats.get(combatId);
    if (!user?.isGM || !combat?.combatants.get(combatantId)) return;
    await writeUnit(combat, combatantId, { turn: currentTurn(null, combat.round) });
  });

  onGM("setHold", async ({ combatId, combatantId }, user) => {
    const combat = game.combats.get(combatId);
    const combatant = combat?.combatants.get(combatantId);
    if (!canControl(user, combatant)) return;
    // API du système si elle existe, sinon le champ constaté par dump.
    if (typeof combatant.setRoundHeld === "function") await combatant.setRoundHeld(combat.round);
    else await combatant.update({ "system.roundHeld": combat.round });
  });

  onGM("moveUnit", moveUnitGM);
  onGM("unitComplicationPatch", patchUnitComplicationGM);
  onGM("unitComplicationResolve", resolveUnitComplicationGM);
  onAll("promptUnitComplication", ({ combatId, combatantId, userId }) => {
    if (userId === game.user.id) return rollUnitComplication(game.combats.get(combatId), combatantId);
  });
  onGM("opposedPatch", patchOpposed);
  onGM("opposedResolve", resolveOpposed);
  onGM("setBoarded", setBoardedGM);

  onGM("fled", async ({ combatId, combatantId }, user) => {
    const combat = game.combats.get(combatId);
    const combatant = combat?.combatants.get(combatantId);
    if (!canControl(user, combatant)) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Fuite réussie" },
      content: `<p><strong>${escapeHTML(combatant.name)}</strong> s'échappe. Le retirer de la poursuite ?</p>`,
      rejectClose: false
    });
    if (!ok) return;
    await writeUnit(combat, combatantId, { status: "out", offTrackAck: null });
    await ChatMessage.create({
      content: `<div class="sc-chat"><strong>${escapeHTML(combatant.name)}</strong> s'échappe : hors poursuite.</div>`,
      speaker: { alias: "Poursuite" }
    });
  });

  onGM("nextTurn", async ({ combatId, combatantId }, user) => {
    const combat = game.combats.get(combatId);
    const combatant = combat?.combatants.get(combatantId);
    if (!canControl(user, combatant) || combat.combatant?.id !== combatantId) return;
    await combat.nextTurn();
  });

  onGM("complicationResolve", resolveComplication);
  onGM("complicationPatch", patchComplication);

  onAll("promptComplication", ({ messageId, userId }) => {
    if (userId === game.user.id) return promptComplicationRoll(messageId);
  });

  onAll("openPanel", () => {
    if (game.settings.get(MODULE_ID, "autoOpen")) openPanel();
  });
}

/** Démarre la poursuite sur le combat courant (MJ). */
export async function startChase(combat) {
  await asGM("setChase", { combatId: combat.id, patch: { active: true, type: getChase(combat)?.type ?? "ground" } });
  await broadcast("openPanel");
}

export async function endChase(combat) {
  await asGM("setChase", { combatId: combat.id, patch: { active: false } });
}

async function note(combatant, html) {
  return ChatMessage.create({
    content: `<div class="sc-chat">${html}</div>`,
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token })
  });
}

/** Bouton « jet » d'une action du panneau. */
export async function runActionRoll(combat, combatantId, actionId, rollKey, { speedBonus } = {}) {
  const view = computeChaseView(combat);
  const me = view?.units.get(combatantId);
  if (!me) return;
  const action = actionsFor(view, combatantId, { speedBonus }).find((a) => a.id === actionId);
  const roll = action?.rolls.find((r) => r.key === rollKey);
  if (!action?.available || !roll) {
    ui.notifications.warn(action?.reason || "Action indisponible.");
    return;
  }
  const name = escapeHTML(me.combatant.name);
  let target = null;
  if (roll.opposed) {
    target = await pickTarget(view, combatantId, action.label);
    if (!target) return;
  }
  const opposed = target ? ` Jet opposé contre ${escapeHTML(target.name)}.` : "";
  await note(me.combatant, `<strong>${name}</strong> : ${escapeHTML(action.label)} (${escapeHTML(roll.label)}). ${escapeHTML(action.summary)}${opposed}<br><span class="sc-muted">Modificateurs : ${escapeHTML(modsText(roll.mods))}${roll.multiAction ? ` ; actions multiples : ${roll.multiAction} (${signed(roll.multiPenalty)})` : ""}</span>`);
  const res = await rollManeuver(me.combatant, me.unit.mode, roll.mods, `${action.label} (${roll.label})`, { multiAction: roll.multiAction ?? 1 });
  if (!res) return;
  const outcome = traitOutcome(readRoll(res.roll));
  if (target && OPPOSED_ACTIONS.has(actionId)) {
    await postOpposed({ combat, attacker: me.combatant, defender: target.combatant, action: actionId, attackerRoll: readRoll(res.roll) });
  }
  if (actionId === "changePosition" && me.unit.boardedBy) {
    await asGM("markUnit", { combatId: combat.id, combatantId, key: "changedPosition" });
    await afterBoardedChangePosition(combat, combatantId, outcome);
  } else if (actionId === "changePosition") {
    await asGM("markUnit", { combatId: combat.id, combatantId, key: "changedPosition" });
    await afterChangePosition(combat, combatantId, outcome);
  } else if (actionId === "flee") {
    await afterFlee(combat, combatantId, outcome);
  }
  await consume(combat, combatantId, action, roll.cost);
}

const OUTCOME_LABEL = { critfail: "Échec critique", failure: "Échec", success: "Succès", raise: "Prouesse" };
const resultLine = (outcome) => outcome
  ? `<p>Résultat lu : <strong>${OUTCOME_LABEL[outcome]}</strong>. Si vous relancez avec un Jeton, choisissez d'après le nouveau jet.</p>`
  : `<p>Choisissez d'après le résultat du jet (après une éventuelle relance avec un Jeton).</p>`;

/** Cible d'une manœuvre de contact : adversaire sur la même carte (choix s'il y en a plusieurs). */
async function pickTarget(view, combatantId, label) {
  const same = opponentsOf(view, combatantId).filter((o) => o.gap === 0)
    .map((o) => ({ ...o, combatant: view.units.get(o.id).combatant }));
  if (same.length <= 1) return same[0] ?? null;
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: `${label} : cible` },
    content: `<p>Plusieurs adversaires sur votre carte : lequel visez-vous ?</p>`,
    buttons: same.map((o) => ({ action: `t:${o.id}`, label: o.name })),
    rejectClose: false
  });
  return typeof answer === "string" ? same.find((o) => `t:${o.id}` === answer) ?? null : null;
}

/** Commandant d'un vaisseau abordé : Succès → plus retenu ; Prouesse → libéré et déplacé d'une carte. */
async function afterBoardedChangePosition(combat, combatantId, outcome) {
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: "Se dégager de l'abordage" },
    content: `<div class="sc-dialog">${resultLine(outcome)}</div>`,
    buttons: [
      { action: "failure", label: "Échec : toujours retenu", icon: "fa-solid fa-link", default: outcome === "failure" || outcome === "critfail" },
      { action: "success", label: "Succès : n'est plus retenu", icon: "fa-solid fa-link-slash", default: outcome === "success" },
      { action: "raise", label: "Prouesse : libéré, + 1 carte", icon: "fa-solid fa-arrows-left-right", default: outcome === "raise" }
    ],
    rejectClose: false
  });
  if (answer !== "success" && answer !== "raise") return;
  await asGM("setBoarded", { combatId: combat.id, combatantId, by: null });
  await ChatMessage.create({
    content: `<div class="sc-chat"><strong>${escapeHTML(combat.combatants.get(combatantId).name)}</strong> n'est plus retenu par l'abordage${answer === "raise" ? " et se dégage" : " (des assaillants peuvent rester à bord)"}.</div>`,
    speaker: { alias: "Poursuite" }
  });
  if (answer === "raise") {
    const steps = await askMove({ title: "Se dégager", intro: "<p>Prouesse : déplacez-vous d'une carte dans la direction de votre choix.</p>", choices: bumpChoices(1) });
    if (steps) await asGM("moveUnit", { combatId: combat.id, combatantId, steps, why: "se dégage de l'abordage" });
  }
}

/** Changer de position : Succès 1 carte, Prouesse jusqu'à 2, dans le sens choisi. */
async function afterChangePosition(combat, combatantId, outcome) {
  const max = outcome === "success" ? 1 : 2;
  const steps = await askMove({
    title: "Changer de position",
    intro: `${resultLine(outcome)}<p>Succès : 1 carte. Prouesse : jusqu'à 2 cartes. Échec : pas de déplacement.</p>`,
    choices: moveChoices({ max }),
    suggested: outcome === "failure" || outcome === "critfail" ? 0 : null
  });
  if (steps) await asGM("moveUnit", { combatId: combat.id, combatantId, steps, why: "Changer de position" });
}

/** Fuir : en cas de Succès, le MJ confirme et l'unité quitte la poursuite. */
async function afterFlee(combat, combatantId, outcome) {
  const { DialogV2 } = foundry.applications.api;
  const answer = await DialogV2.wait({
    window: { title: "Fuir" },
    content: `<div class="sc-dialog">${resultLine(outcome)}</div>`,
    buttons: [
      { action: "success", label: "Succès : il s'échappe", icon: "fa-solid fa-person-running", default: outcome === "success" || outcome === "raise" },
      { action: "failure", label: "Échec : il reste dans la poursuite", icon: "fa-solid fa-xmark", default: outcome === "failure" || outcome === "critfail" }
    ],
    rejectClose: false
  });
  if (answer === "success") await asGM("fled", { combatId: combat.id, combatantId });
}

async function consume(combat, combatantId, action, cost) {
  if (cost !== "free" && cost !== "action") return;
  const combatant = combat.combatants.get(combatantId);
  // État prévu après cette action (l'écriture réelle passe par le MJ, de façon asynchrone).
  const turn = currentTurn(getUnit(combat, combatant).turn, combat.round);
  if (cost === "free") turn.free = action.id; else turn.standard.push(action.id);
  if (action.exclusive) turn.exclusive = true;
  await asGM("useAction", { combatId: combat.id, combatantId, actionId: action.id, cost, exclusive: !!action.exclusive });
  if (turnDone(turn)) await offerEndTurn(combat, combatantId);
}

/** Toutes les actions sont faites : propose de passer au participant suivant (si c'est bien son tour). */
export async function offerEndTurn(combat, combatantId) {
  if (combat.combatant?.id !== combatantId) return;
  const name = escapeHTML(combat.combatant.name);
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Fin du tour", icon: "fa-solid fa-forward" },
    content: `<p><strong>${name}</strong> a fait toutes ses actions ce tour.</p><p>Passer au participant suivant ?</p>`,
    rejectClose: false
  });
  if (ok) await endTurn(combat, combatantId);
}

export async function endTurn(combat, combatantId) {
  return asGM("nextTurn", { combatId: combat.id, combatantId });
}

/** Bouton sans jet d'une action du panneau. */
export async function runActionApply(combat, combatantId, actionId, applyKey) {
  const view = computeChaseView(combat);
  const me = view?.units.get(combatantId);
  if (!me) return;
  const action = actionsFor(view, combatantId).find((a) => a.id === actionId);
  const apply = action?.applies.find((a) => a.key === applyKey);
  if (!action?.available || !apply) {
    ui.notifications.warn(action?.reason || "Action indisponible.");
    return;
  }
  // Lever le pied : l'action n'est comptée qu'une fois le recul choisi (annulable).
  if (applyKey !== "liftFoot") await consume(combat, combatantId, action, apply.cost);
  const name = escapeHTML(me.combatant.name);
  switch (applyKey) {
    case "declare": {
      const turn = currentTurn(me.unit.turn, combat.round);
      const n = turn.standard.length + 1;
      const multi = multiActionMod(turn.planned);
      if (multi) armMultiAction(turn.planned);
      return note(me.combatant, `<strong>${name}</strong> : ${escapeHTML(action.label)} (action ${n} / ${turn.planned}).${multi ? ` Actions multiples : <strong>${turn.planned} (${signed(multi.value)})</strong>, réglées dans la prochaine fenêtre de jet ouverte depuis la fiche.` : ""}`);
    }
    case "liftFoot": {
      const steps = await askMove({
        title: "Lever le pied",
        intro: "<p>Reculez d'une ou deux cartes de poursuite, sans jet (cela compte comme une action). Vous ne pourrez plus Changer de position ce tour.</p>",
        choices: moveChoices({ max: 2, forward: false, stay: false })
      });
      if (!steps) return;
      await asGM("markUnit", { combatId: combat.id, combatantId, key: "liftedFoot" });
      await asGM("moveUnit", { combatId: combat.id, combatantId, steps, why: "lève le pied" });
      return consume(combat, combatantId, action, apply.cost);
    }
    case "evadeFree":
      await asGM("markUnit", { combatId: combat.id, combatantId, key: "evaded" });
      return note(me.combatant, `<strong>${name}</strong> se dérobe (action gratuite) : −2 aux attaques contre lui, son véhicule et ses passagers, et −2 à leurs propres attaques, jusqu'à son prochain tour.`);
    case "evadeAction":
      await asGM("markUnit", { combatId: combat.id, combatantId, key: "evaded" });
      return note(me.combatant, `<strong>${name}</strong> se dérobe (action) : −4 aux attaques contre lui, son véhicule et ses passagers, et −4 à leurs propres attaques, jusqu'à son prochain tour.`);
    case "hold":
      await asGM("setHold", { combatId: combat.id, combatantId });
      return note(me.combatant, `<strong>${name}</strong> passe En attente : il pourra interrompre un adversaire (jet opposé ${me.unit.mode === "mounted" ? "d'Équitation" : (me.unit.mode === "foot" ? "d'Athlétisme" : "choisi par le MJ")}).`);
    case "steady":
      return note(me.combatant, `<strong>${name}</strong> stabilise : ignore Plateforme instable et Course ; les attaques contre lui sont à +2 jusqu'à son prochain tour.`);
  }
}
