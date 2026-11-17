/**
 * Détection des dégâts pendant une poursuite : Secoué, Sonné ou Blessé → Bousculé ;
 * véhicule endommagé → Bousculé + jet de contrôle du conducteur.
 * La détection se fait sur le client qui applique la modification (un seul client), le traitement sur le MJ actif.
 */
import { damageTrigger, statusTrigger, readCondition } from "../rules/damage.js";
import { isChaseActive, getUnit, alreadyBumped, recordBump } from "./state.js";
import { asGM, onGM } from "./socket.js";
import { moveUnitGM, askMove, bumpChoices } from "./movement.js";
import { postControlCheck } from "./complication-card.js";
import { escapeHTML } from "./util.js";
import { mountOf } from "./mount.js";
import { driverWord } from "../rules/complication.js";

const pending = new Set();
const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };
/** Attend la fin des traitements en cours (tests). */
export async function settled() { while (pending.size) await Promise.allSettled([...pending]); }

const sameActor = (a, b) => !!a && !!b && (a === b || (!!a.uuid && a.uuid === b.uuid));

/** Unité concernée : l'acteur lui-même, ou la monture d'un cavalier. */
function findUnit(actor) {
  if (!actor) return null;
  for (const combat of game.combats ?? []) {
    if (!isChaseActive(combat)) continue;
    for (const c of combat.combatants) {
      if (sameActor(c.actor, actor)) return { combat, combatant: c, viaMount: false };
      if (sameActor(mountOf(combat, c)?.actor, actor)) return { combat, combatant: c, viaMount: true };
    }
  }
  return null;
}

function report(actor, trig) {
  const found = findUnit(actor);
  if (!found) return;
  const cause = found.viaMount ? `monture:${trig.cause}` : trig.cause;
  track(asGM("damageBump", { combatId: found.combat.id, combatantId: found.combatant.id, cause, control: !!trig.control && !found.viaMount }));
}

const pick = (changes, path) => {
  const flat = changes?.[`system.${path}`];
  if (flat !== undefined) return flat;
  return path.split(".").reduce((o, k) => o?.[k], changes?.system);
};

export function onPreUpdateActor(actor, changes, options, userId) {
  if (userId && userId !== game.user.id) return;
  const before = readCondition(actor.system);
  const after = { ...before };
  const w = pick(changes, "wounds.value");
  const sh = pick(changes, "status.isShaken");
  const stn = pick(changes, "status.isStunned");
  if (w !== undefined) after.wounds = Number(w) || 0;
  if (sh !== undefined) after.shaken = !!sh;
  if (stn !== undefined) after.stunned = !!stn;
  const trig = damageTrigger({ isVehicle: actor.type === "vehicle", before, after });
  if (trig) report(actor, trig);
}

export function onCreateActiveEffect(effect, options, userId) {
  if (userId && userId !== game.user.id) return;
  const actor = effect?.parent;
  if (!actor || actor.type === "vehicle") return;   // un véhicule n'est pas Secoué
  const cause = statusTrigger(effect.statuses);
  if (cause) report(actor, { bump: true, control: false, cause });
}

// ---------- Côté MJ ----------

/** Phrase d'annonce adaptée : véhicule touché, monture, décision du MJ ou personnage Secoué / Sonné / Blessé. */
function bumpSentence(name, cause, control, withBump = true, driver = "conducteur") {
  const bump = withBump ? " : il est <strong>Bousculé</strong> d'une carte de poursuite." : ".";
  if (control) return `<strong>${name}</strong> subit des dégâts au moins égaux à sa Résistance${withBump ? " : le véhicule est <strong>Bousculé</strong> d'une carte de poursuite et son ${driver} fait un jet de contrôle." : "."}`;
  if (cause === "manual") return `<strong>${name}</strong> est <strong>Bousculé</strong> d'une carte de poursuite (décision du MJ).`;
  if (cause.startsWith("monture:")) return `La monture de <strong>${name}</strong> est ${escapeHTML(cause.slice(8))}${bump}`;
  return `<strong>${name}</strong> est ${escapeHTML(cause)}${withBump ? " : il est aussi <strong>Bousculé</strong> d'une carte de poursuite." : "."}`;
}

const recent = new Map();
const DEDUP_MS = 2000;

export async function damageBumpGM({ combatId, combatantId, cause, control }) {
  const combat = game.combats.get(combatId);
  const combatant = combat?.combatants.get(combatantId);
  if (!combatant || getUnit(combat, combatant).status !== "in") return;
  const now = Date.now();
  if (now - (recent.get(combatantId) ?? 0) < DEDUP_MS) return;     // Blessure + Secoué d'un même coup
  recent.set(combatantId, now);

  const name = escapeHTML(combatant.name);
  const attackerId = combat.combatant && combat.combatant.id !== combatantId ? combat.combatant.id : null;
  const attacker = attackerId ? escapeHTML(combat.combatant.name) : null;
  if (control) await postControlCheck({ combat, combatant, unit: getUnit(combat, combatant) });
  if (alreadyBumped(combat, attackerId, combatantId)) {
    await ChatMessage.create({
      content: `<div class="sc-chat">${bumpSentence(name, cause, control, false)} Mais il a déjà été Bousculé par ${attacker} ce tour : pas de second Bousculé.</div>`,
      speaker: { alias: "Poursuite" }
    });
    return;
  }
  const steps = await askMove({
    title: `Bousculé : ${combatant.name}`,
    intro: `<p>${bumpSentence(name, cause, control, true, driverWord(getUnit(combat, combatant).mode))}</p>
      <p>${attacker ? `L'attaquant (${attacker}) choisit la direction.` : "L'attaquant choisit la direction."} Un même assaillant ne Bouscule une cible qu'une fois par tour.</p>`,
    choices: [...bumpChoices(1), { steps: 0, label: "Ne pas Bousculer (déjà Bousculé par cet assaillant ce tour)" }]
  });
  if (steps) {
    await recordBump(combat, attackerId, combatantId);
    await moveUnitGM({ combatId, combatantId, steps, why: "Bousculé" }, game.user);
  }
}

export function registerDamageWatch() {
  onGM("damageBump", damageBumpGM);
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("createActiveEffect", onCreateActiveEffect);
}
