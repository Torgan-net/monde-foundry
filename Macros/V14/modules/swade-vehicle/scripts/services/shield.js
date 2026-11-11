import { toInt } from "../rules/numbers.js";
import { emergencyRechargeValue, shieldMaxForSize, soakNegations } from "../rules/shield.js";
import { powerMods, powerSystems, setPower } from "./energy.js";
import { actorFromUuid, askNumber, escapeHTML } from "./foundry-utils.js";
import { appendJournal } from "./journal.js";
import { rollTrait } from "./rolls.js";
import { apiCrew, apiPostes } from "./vehicle.js";

export function shieldStatKey(vehicle) {
  const stats = vehicle?.system?.additionalStats ?? {};
  return Object.keys(stats).find((k) => k.toLowerCase() === "shield")
    ?? Object.keys(stats).find((k) => /shield|bouclier/i.test(k) || /shield|bouclier/i.test(stats[k]?.label ?? ""))
    ?? null;
}

export function shieldInfo(vehicle) {
  const key = shieldStatKey(vehicle);
  if (!key) return null;
  const size = vehicle._source?.system?.size ?? vehicle.system.size;
  const max = shieldMaxForSize(size);
  const value = Math.min(Math.max(0, toInt(vehicle.system.additionalStats[key]?.value)), max);
  return { key, value, max };
}

export async function setShieldCharges(vehicle, value) {
  const info = shieldInfo(vehicle);
  if (!info) return;
  const v = Math.min(Math.max(0, value), info.max);
  await vehicle.update({
    [`system.additionalStats.${info.key}.value`]: v,
    [`system.additionalStats.${info.key}.max`]: info.max
  });
}

/** Membre d'équipage proposé pour le bouclier : occupant d'un poste lié au mod Bouclier, sinon premier membre. */
export function shieldOperator(vehicle) {
  const isShieldMod = (i) => /shield|bouclier/i.test(i.name) || /shield|bouclier/i.test(i.system?.swid ?? "");
  const poste = apiPostes(vehicle).find((p) => p.occupant && p.mods.some(isShieldMod));
  return poste?.occupant ?? apiCrew(vehicle).find((m) => m.actor)?.actor ?? null;
}

/** Choix de l'opérateur du bouclier parmi l'équipage, ou refus d'utiliser le bouclier (null). */
export async function askShieldOperator(vehicle, wounds, info) {
  const crew = apiCrew(vehicle).filter((m) => m.actor);
  if (!crew.length) { ui.notifications.warn(`${vehicle.name} : aucun membre d'équipage pour actionner le bouclier.`); return null; }
  const def = shieldOperator(vehicle);
  const opts = crew.map((m) => `<option value="${m.uuid}" ${m.actor === def ? "selected" : ""}>${escapeHTML(m.actor.name)}</option>`).join("");
  try {
    const uuid = await foundry.applications.api.DialogV2.wait({
      window: { title: `Bouclier · ${vehicle.name}` },
      content: `<div class="swv-hm-form">
        <p>${wounds} Blessure${wounds > 1 ? "s" : ""} à encaisser · charges ${info.value} / ${info.max}</p>
        <label>Opérateur (Électronique) <select name="op">${opts}</select></label>
      </div>`,
      buttons: [
        { action: "use", label: "Encaisser avec le bouclier", default: true, callback: (ev, button) => button.form.elements.op.value },
        { action: "skip", label: "Ne pas utiliser le bouclier", callback: () => "skip" }
      ]
    });
    return uuid && uuid !== "skip" ? actorFromUuid(uuid) : null;
  } catch { return null; }
}

/**
 * Boucle d'encaissement : une charge par jet d'Électronique, jusqu'à annulation des Blessures ou fin des charges.
 * Après chaque jet, le nombre de Blessures annulées est proposé (1 par réussite et par Prouesse) et reste
 * modifiable, pour tenir compte d'une relance avec un Jeton. Renvoie les Blessures restantes.
 */
export async function shieldSoak(vehicle, wounds, operator) {
  let info = shieldInfo(vehicle);
  if (!info || !operator || wounds <= 0) return wounds;
  let charges = info.value;
  let remaining = wounds;
  let attempt = 0;
  const log = [];
  while (remaining > 0 && charges > 0) {
    attempt += 1;
    charges -= 1;
    const soakMod = powerMods(vehicle).soak;
    const roll = await rollTrait(operator, "Electronics", soakMod ? [{ label: "Gestion de l'énergie", value: soakMod }] : [], {});
    const total = Number(roll?.total);
    const suggested = soakNegations(total);
    const negated = await askNumber(`Bouclier · jet ${attempt}`,
      `<p>${escapeHTML(operator.name)} a obtenu ${Number.isFinite(total) ? total : "?"} (charge dépensée, reste ${charges}).</p>
       <p>Blessures à encaisser : ${remaining}. Combien en annuler ? (une par réussite et par Prouesse ; corriger en cas de relance)</p>`,
      Math.min(suggested, remaining));
    if (negated === null) { log.push(`Bouclier : jet ${attempt} interrompu`); break; }
    remaining = Math.max(0, remaining - negated);
    log.push(`Bouclier : jet ${attempt} de ${operator.name}, ${negated} Blessure${negated > 1 ? "s" : ""} annulée${negated > 1 ? "s" : ""} (charges restantes ${charges})`);
  }
  if (remaining > 0 && charges === 0) log.push("Bouclier épuisé");
  await setShieldCharges(vehicle, charges);
  await appendJournal(vehicle, log);
  return remaining;
}

/** Recharge d'urgence : jet d'Électronique ; réussite = moitié des charges habituelles, Prouesse = toutes. */
export async function shieldEmergencyRecharge(vehicle, operator) {
  const info = shieldInfo(vehicle);
  if (!info || !operator) return;
  const from = powerSystems(vehicle).filter((k) => k === "propulsion" || k === "weapons");
  await setPower(vehicle, { boost: "recharge", from }, operator.name);
  const roll = await rollTrait(operator, "Electronics", [], {});
  const total = Number(roll?.total);
  const guess = !Number.isFinite(total) ? "fail" : total >= 8 ? "raise" : total >= 4 ? "success" : "fail";
  let outcome;
  try {
    outcome = await foundry.applications.api.DialogV2.wait({
      window: { title: `Recharge d'urgence · ${vehicle.name}` },
      content: `<p>${escapeHTML(operator.name)} a obtenu ${Number.isFinite(total) ? total : "?"}. Résultat retenu (corriger en cas de relance) :</p>`,
      buttons: [
        { action: "fail", label: "Échec", default: guess === "fail" },
        { action: "success", label: `Réussite (+${Math.floor(info.max / 2)})`, default: guess === "success" },
        { action: "raise", label: "Prouesse (toutes)", default: guess === "raise" }
      ]
    });
  } catch { return; }
  if (!outcome) return;
  const value = emergencyRechargeValue(info.value, info.max, outcome);
  await setShieldCharges(vehicle, value);
  await appendJournal(vehicle, [`Bouclier : recharge d'urgence par ${operator.name}, ${outcome === "fail" ? "échec" : outcome === "raise" ? "Prouesse, charges pleines" : "réussite"} (${Math.min(value, info.max)} / ${info.max}) ; énergie détournée de la propulsion et des armes`]);
}

/* ------------------------------------------------------------------ */
/* Gestion de l'énergie (Compagnon Science-Fiction, « Energy Management ») */
/* ------------------------------------------------------------------ */
/*
 * L'opérateur choisit un système à renforcer et détourne l'énergie d'un ou deux autres systèmes.
 * L'état dure jusqu'à la fin du tour suivant de l'opérateur : il est levé à la main (bouton Rétablir).
 *  - Propulsion renforcée : Maniabilité +2 (une source) ou +4 (deux) ; propulsion détournée : −4.
 *  - Boucliers renforcés : encaissement +2 / +4 ; boucliers détournés : −4.
 *  - Armes renforcées : dégâts des armes à énergie +4 / +8 (Heavy Metal : +1 / +2 Blessures) ;
 *    armes détournées : dégâts −4 (Heavy Metal : −1 Blessure).
 * La recharge d'urgence du bouclier détourne l'énergie de la propulsion et des armes (boost « recharge »).
 */
