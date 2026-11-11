import { MODULE_ID } from "../constants.js";
import { crewActors } from "./crew.js";
import { escapeHTML, isResponsibleGM } from "./foundry-utils.js";
import { appendJournal } from "./journal.js";
import { apiPilot } from "./vehicle.js";

export function combatantHasJoker(c) { return !!(c?.hasJoker ?? c?.getFlag?.("swade", "hasJoker")); }

export function vehicleCombatants(vehicle) {
  const out = [];
  for (const combat of game.combats ?? []) {
    for (const c of combat.combatants) if (c.actor === vehicle || c.actor?.uuid === vehicle?.uuid || c.actorId === vehicle?.id) out.push(c);
  }
  return out;
}

export function vehicleHasJoker(vehicle) { return vehicleCombatants(vehicle).some(combatantHasJoker); }

export async function giveBenny(actor) {
  if (typeof actor.getBenny === "function") return actor.getBenny();
  const b = actor.system?.bennies;
  if (b) return actor.update({ "system.bennies.value": (b.value ?? 0) + 1 });
}

export async function awardJokerBennies(combat, combatant) {
  try { if (game.settings.settings.has("swade.jokersWild") && !game.settings.get("swade", "jokersWild")) return; } catch { /* réglage absent */ }
  const key = `${combat.round}.${combatant.id}`;
  const done = combat.getFlag(MODULE_ID, "jokerAwards") ?? [];
  if (done.includes(key)) return;
  await combat.setFlag(MODULE_ID, "jokerAwards", [...done, key].slice(-50));

  const disposition = combatant.token?.disposition;
  const combatantActors = new Set(combat.combatants.map((c) => c.actor?.uuid).filter(Boolean));
  const vehicles = combat.combatants
    .filter((c) => c.actor?.type === "vehicle" && c.token?.disposition === disposition)
    .map((c) => c.actor);
  const seen = new Set();
  const names = [];
  for (const v of vehicles) {
    for (const { actor } of crewActors(v)) {
      if (seen.has(actor.uuid) || combatantActors.has(actor.uuid)) continue;
      seen.add(actor.uuid);
      if (!(actor.isWildcard ?? actor.system?.wildcard)) continue;
      await giveBenny(actor);
      names.push(actor.name);
    }
  }
  const pilot = apiPilot(combatant.actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
    content: `<div class="swv-group-card"><h3>Joker · ${escapeHTML(combatant.actor.name)}</h3>
      <p>${names.length ? `Un Jeton pour : ${names.map(escapeHTML).join(", ")}.` : "Aucun Joker à bord des véhicules alliés."}</p>
      <p>${pilot ? `${escapeHTML(pilot.name)} (pilote) bénéficie du +2 du Joker ce round.` : "Pas de pilote pour le +2 du Joker."}</p></div>`
  });
  await appendJournal(combatant.actor, [`Joker à l'initiative : ${names.length} Jeton${names.length > 1 ? "s" : ""} distribué${names.length > 1 ? "s" : ""}${pilot ? ", +2 pour " + pilot.name : ""}`]);
}

Hooks.on("updateCombatant", (combatant, changes) => {
  if (!isResponsibleGM() || combatant.actor?.type !== "vehicle") return;
  if (!foundry.utils.hasProperty(changes, "flags.swade") && !foundry.utils.hasProperty(changes, "initiative")) return;
  if (!combatantHasJoker(combatant)) return;
  awardJokerBennies(combatant.combat ?? combatant.parent, combatant).catch((err) => console.error(`${MODULE_ID} | Joker`, err));
});

/* ------------------------------------------------------------------ */
/* Jet de groupe du soutien                                             */
/* ------------------------------------------------------------------ */
