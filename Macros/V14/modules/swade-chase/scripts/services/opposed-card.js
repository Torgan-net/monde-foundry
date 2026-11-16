/**
 * Jets opposés de Manœuvre (Repousser, Éperonner, Aborder) : message de chat interactif.
 *   flags.swade-chase.complication = { kind: "opposed", action, combatId, attackerId, defenderId,
 *     attackerName, defenderName, attackerRoll, defenderRoll, suggested, state, result }
 * (même clé de flag que les Complications : un seul système de messages interactifs)
 */
import { MODULE_ID, MODES } from "../constants.js";
import { opposedOutcome, pushResult, boardResult, ramResult } from "../rules/opposed.js";
import { escapeHTML } from "./util.js";
import { asGM, canControl } from "./socket.js";
import { rollManeuver, readRoll } from "./rolls.js";
import { getUnit, writeUnit, alreadyBumped, recordBump } from "./state.js";
import { moveUnitGM, askMove, bumpChoices } from "./movement.js";
import { criticalFailureGM } from "./complication-card.js";
import { ramDamage } from "../rules/ram.js";
import { ramProfile } from "./speed-reader.js";

const LABELS = { push: "Repousser", ram: "Éperonner", board: "Aborder" };
const OUTCOMES = [
  { key: "raise", label: "Prouesse de l'attaquant", cls: "sc-ok" },
  { key: "win", label: "L'attaquant l'emporte", cls: "sc-ok" },
  { key: "lose", label: "Le défenseur l'emporte", cls: "sc-ko" },
  { key: "critfail", label: "Échec critique de l'attaquant", cls: "sc-ko" }
];
const rollText = (r) => (r ? `<strong>${r.total}</strong>${r.isCritfail ? " (Échec critique)" : ""}` : "—");

export function renderOpposedCard(d) {
  const att = escapeHTML(d.attackerName), def = escapeHTML(d.defenderName);
  const lines = [
    `<header class="sc-chat-title"><i class="fa-solid fa-people-arrows"></i> ${LABELS[d.action]} : ${att} contre ${def}</header>`,
    `<p>Jet opposé de Manœuvre. L'attaquant doit réussir et battre le défenseur (égalité : le défenseur l'emporte ; Prouesse : 4 de plus).</p>`,
    `<p>${att} : ${rollText(d.attackerRoll)} · ${def} : ${rollText(d.defenderRoll)}</p>`
  ];
  if (d.state === "resolved") {
    lines.push(`<div class="sc-chat-result">${d.result ?? ""}</div>`);
  } else {
    lines.push(`<div class="sc-chat-buttons"><button type="button" data-sc="opposed-defend"><i class="fa-solid fa-shield-halved"></i> Jet opposé de ${def}</button></div>`);
    lines.push(`<div class="sc-chat-resolve"><span>Résultat (après d'éventuelles relances avec un Jeton) :</span><div class="sc-chat-buttons">${
      OUTCOMES.filter((o) => o.key !== "critfail" || d.action === "push")
        .map((o) => `<button type="button" data-sc="opposed-resolve" data-outcome="${o.key}" class="${o.cls}${d.suggested === o.key ? " sc-suggested" : ""}">${o.label}</button>`).join("")
    }</div></div>`);
  }
  return `<div class="sc-chat sc-complication">${lines.join("")}</div>`;
}

/** Crée le message après le jet de l'attaquant (client de l'attaquant). */
export async function postOpposed({ combat, attacker, defender, action, attackerRoll }) {
  const data = {
    kind: "opposed", action, combatId: combat.id,
    attackerId: attacker.id, defenderId: defender.id,
    attackerName: attacker.name, defenderName: defender.name,
    attackerRoll: attackerRoll ?? null, defenderRoll: null, suggested: null, state: "pending", result: null
  };
  return ChatMessage.create({
    content: renderOpposedCard(data),
    speaker: ChatMessage.getSpeaker({ actor: attacker.actor, token: attacker.token }),
    flags: { [MODULE_ID]: { complication: data } }
  });
}

const dataOf = (message) => message?.flags?.[MODULE_ID]?.complication;
const combatantOf = (d, id) => game.combats.get(d.combatId)?.combatants.get(id) ?? null;

async function updateOpposed(message, patch) {
  const data = { ...dataOf(message), ...patch };
  await message.update({ content: renderOpposedCard(data), [`flags.${MODULE_ID}.complication`]: data });
  return data;
}

// ---------- Client ----------

export function bindOpposedCard(message, html) {
  const d = dataOf(message);
  if (d?.kind !== "opposed") return;
  for (const btn of html.querySelectorAll("[data-sc]")) {
    const who = btn.dataset.sc === "opposed-defend" ? d.defenderId : d.attackerId;
    if (!canControl(game.user, combatantOf(d, who))) {
      btn.disabled = true;
      btn.dataset.tooltip = btn.dataset.sc === "opposed-defend" ? "Réservé au joueur du défenseur et au MJ." : "Réservé au joueur de l'attaquant et au MJ.";
      continue;
    }
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      btn.disabled = true;
      try {
        if (btn.dataset.sc === "opposed-defend") await rollDefender(message.id);
        else await asGM("opposedResolve", { messageId: message.id, outcome: btn.dataset.outcome });
      } finally { btn.disabled = false; }
    });
  }
}

/** Jet du défenseur (client du défenseur), puis résultat proposé. */
export async function rollDefender(messageId) {
  const message = game.messages.get(messageId);
  const d = dataOf(message);
  if (!d || d.state === "resolved") return;
  const combat = game.combats.get(d.combatId);
  const defender = combatantOf(d, d.defenderId);
  if (!defender) return;
  const mode = getUnit(combat, defender).mode;
  const res = await rollManeuver(defender, mode, [], `${LABELS[d.action]} : jet opposé`);
  const roll = readRoll(res?.roll);
  if (roll) await asGM("opposedPatch", { messageId, patch: { defenderRoll: roll } });
}

// ---------- MJ ----------

export async function patchOpposed({ messageId, patch }, user) {
  const message = game.messages.get(messageId);
  const d = dataOf(message);
  if (d?.kind !== "opposed" || d.state === "resolved") return;
  const clean = {};
  if (patch.defenderRoll && canControl(user, combatantOf(d, d.defenderId))) {
    clean.defenderRoll = { total: Number(patch.defenderRoll.total), isCritfail: !!patch.defenderRoll.isCritfail };
  }
  const next = { ...d, ...clean };
  const suggested = opposedOutcome(next.attackerRoll, next.defenderRoll);
  if (suggested) clean.suggested = suggested === "critfail" && d.action !== "push" ? "lose" : suggested;
  if (Object.keys(clean).length) await updateOpposed(message, clean);
}

export async function resolveOpposed({ messageId, outcome }, user) {
  const message = game.messages.get(messageId);
  const d = dataOf(message);
  if (d?.kind !== "opposed" || d.state === "resolved") return;
  const combat = game.combats.get(d.combatId);
  const attacker = combatantOf(d, d.attackerId);
  const defender = combatantOf(d, d.defenderId);
  if (!combat || !attacker || !defender || !canControl(user, attacker)) return;
  const att = escapeHTML(d.attackerName), def = escapeHTML(d.defenderName);
  const out = [];

  if (d.action === "push") {
    const r = pushResult(outcome);
    if (r.bumpDefender && alreadyBumped(combat, attacker.id, defender.id)) {
      out.push(`<p>${att} l'emporte, mais ${def} a déjà été Bousculé par ${att} ce tour : pas de second Bousculé (une fois par tour et par assaillant).</p>`);
      if (r.defenderCritical) out.push(await criticalFailureGM(defender, getUnit(combat, defender).mode, { rooftops: !!combat.flags?.[MODULE_ID]?.chase?.rooftops }));
    } else if (r.bumpDefender) {
      out.push(`<p class="sc-ok-text">${att} repousse ${def} : <strong>Bousculé</strong>.</p>`);
      await updateOpposed(message, { state: "resolved", result: out.join("") });
      const steps = await askMove({
        title: `Repousser : ${d.defenderName}`,
        intro: `<p>${att} choisit la direction dans laquelle ${def} est Bousculé.</p>`,
        choices: bumpChoices(1)
      });
      await recordBump(combat, attacker.id, defender.id);
      if (steps) await moveUnitGM({ combatId: combat.id, combatantId: defender.id, steps, why: `Bousculé par ${d.attackerName}` }, game.user);
      if (r.defenderCritical) {
        out.push(await criticalFailureGM(defender, getUnit(combat, defender).mode, { rooftops: !!combat.flags?.[MODULE_ID]?.chase?.rooftops }));
      }
    } else if (r.bumpAttacker) {
      out.push(`<p class="sc-ko-text">Échec critique : la manœuvre se retourne contre ${att}, qui est <strong>Bousculé</strong>.</p>`);
      await updateOpposed(message, { state: "resolved", result: out.join("") });
      const steps = await askMove({
        title: `Repousser raté : ${d.attackerName}`,
        intro: `<p>La manœuvre se retourne contre ${att} : ${def} choisit la direction.</p>`,
        choices: bumpChoices(1)
      });
      if (steps) await moveUnitGM({ combatId: combat.id, combatantId: attacker.id, steps, why: "Repousser raté" }, game.user);
    } else {
      out.push(`<p>${def} résiste : rien ne se passe.</p>`);
    }
  } else if (d.action === "board") {
    const r = boardResult(outcome);
    if (r.boarded) {
      await writeUnit(combat, defender.id, { boardedBy: { id: attacker.id, name: attacker.name } });
      out.push(`<p class="sc-ok-text">Bord à bord : l'équipage de ${att} peut passer à l'abordage de ${def}.</p>`);
      out.push(r.defendersOnHold
        ? `<p>Les défenseurs désignés pour repousser l'abordage (et non occupés ailleurs) commencent <strong>En attente</strong>.</p>`
        : `<p>Prouesse : les défenseurs ne commencent pas En attente.</p>`);
      out.push(`<p>Le commandant de ${def} ne peut plus que tenter de Changer de position (−4 avec grappins, rayon tracteur…).</p>`);
    } else {
      out.push(`<p>${def} évite l'abordage.</p>`);
    }
  } else if (d.action === "ram") {
    const r = ramResult(outcome);
    if (r.hit) {
      out.push(`<p class="sc-ok-text">Collision : les deux participants s'infligent des dégâts.</p>`);
      const pa = ramProfile(attacker.actor), pd = ramProfile(defender.actor);
      for (const [dealer, target, prof, other, raise] of [
        [attacker, defender, pa, pd, r.attackerBonusD6],
        [defender, attacker, pd, pa, false]
      ]) {
        const dmg = ramDamage({ dealer: prof, target: other, raise });
        const detail = dmg.parts.map((p) => `${p.label} ${p.dice}d6`).join(" + ");
        const roll = await new Roll(dmg.formula).evaluate();
        await roll.toMessage({
          flavor: `Éperonner : dégâts de ${escapeHTML(dealer.name)} sur ${escapeHTML(target.name)} (${escapeHTML(detail)})`,
          speaker: ChatMessage.getSpeaker({ actor: dealer.actor })
        });
        out.push(`<p>${escapeHTML(dealer.name)} inflige <strong>${dmg.formula}</strong> à ${escapeHTML(target.name)} (${escapeHTML(detail)}) : <strong>${roll.total}</strong>.</p>`);
      }
      out.push(`<p class="sc-muted">Appliquez les dégâts sur les fiches (Encaissement possible). Un véhicule qui subit des dégâts au moins égaux à sa Résistance est Bousculé et son conducteur fait un jet de contrôle.</p>`);
    } else {
      out.push(`<p>${def} évite le choc.</p>`);
    }
  }
  if (dataOf(message).state !== "resolved" || out.length > 1) await updateOpposed(message, { state: "resolved", result: out.join("") });
}

/** Commandant abordé : effet de Changer de position (côté MJ). */
export async function setBoardedGM({ combatId, combatantId, by }, user) {
  const combat = game.combats.get(combatId);
  const combatant = combat?.combatants.get(combatantId);
  if (!combatant || !canControl(user, combatant)) return;
  await writeUnit(combat, combatantId, { boardedBy: by ?? null });
}

export const OPPOSED_ACTIONS = new Set(Object.keys(LABELS));
export const modeLabel = (mode) => MODES[mode]?.skill ?? "Manœuvre";
