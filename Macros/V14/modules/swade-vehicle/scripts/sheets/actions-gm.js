/** Actions de la fiche réservées au MJ ou au propriétaire : états, Blessures, tables, bouclier, énergie, munitions, journal. `this` = la fiche. */

import { MODULE_ID } from "../constants.js";
import { stripClasse } from "../rules/classes.js";
import { POWER_SYSTEMS } from "../rules/energy.js";
import { toInt } from "../rules/numbers.js";
import { applyCritical, applyOutOfControl, repairCriticals } from "../services/criticals.js";
import { powerState, powerSystems, setPower } from "../services/energy.js";
import { actorFromUuid, askNumber, escapeHTML } from "../services/foundry-utils.js";
import { appendJournal } from "../services/journal.js";
import { askShieldOperator, setShieldCharges, shieldEmergencyRecharge, shieldInfo, shieldOperator, shieldSoak } from "../services/shield.js";
import { apiCrew } from "../services/vehicle.js";
import { setVehicleWounds, vehicleWoundsValue } from "../services/wounds.js";

export async function onToggleStatus(event, target) {
  if (!game.user.isGM) return;
  const key = target.dataset.key;
  const current = !!this.document.system.status?.[key];
  await this.document.update({ [`system.status.${key}`]: !current });
}

export async function onWound(event, target) {
  if (!game.user.isGM) return;
  await setVehicleWounds(this.document, vehicleWoundsValue(this.document) + toInt(target.dataset.delta), "MJ");
}

export async function onOutOfControl() {
  if (game.user.isGM) await applyOutOfControl(this.document);
}

export async function onCritical() {
  if (game.user.isGM) await applyCritical(this.document);
}

export async function onRepair() {
  if (!game.user.isGM) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Réparer le véhicule" },
    content: "<p>Effacer toutes les Dégradations critiques (Maniabilité, Vitesse, armes détruites) ? Les Blessures ne sont pas modifiées.</p>"
  });
  if (ok) await repairCriticals(this.document);
}

/** Encaissement après des dégâts appliqués ailleurs (carte native) : retire les Blessures annulées. */
export async function onShieldSoak() {
  const v = this.document;
  if (!(game.user.isGM || v.isOwner)) return;
  const info = shieldInfo(v);
  if (!info?.value) return ui.notifications.warn("Bouclier à court de charges.");
  const wounds = await askNumber(`Bouclier · ${v.name}`, "<p>Nombre de Blessures que le véhicule vient de subir :</p>", 1);
  if (!wounds) return;
  const operator = await askShieldOperator(v, wounds, info);
  if (!operator) return;
  const remaining = await shieldSoak(v, wounds, operator);
  const negated = wounds - remaining;
  if (negated > 0) {
    await setVehicleWounds(v, vehicleWoundsValue(v) - negated, "bouclier");
  }
}

export async function onShieldEmergency() {
  const v = this.document;
  if (!(game.user.isGM || v.isOwner)) return;
  const info = shieldInfo(v);
  if (!info) return;
  if (info.value >= info.max) return ui.notifications.info("Le bouclier est déjà plein.");
  const crew = apiCrew(v).filter((m) => m.actor);
  if (!crew.length) return ui.notifications.warn("Aucun membre d'équipage.");
  const def = shieldOperator(v);
  let uuid;
  try {
    uuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Recharge d'urgence · ${v.name}` },
      content: `<div class="swv-hm-form"><p>Charges ${info.value} / ${info.max}. L'énergie est détournée de la propulsion et des armes.</p>
        <label>Opérateur (Électronique) <select name="op">${crew.map((m) => `<option value="${m.uuid}" ${m.actor === def ? "selected" : ""}>${escapeHTML(m.actor.name)}</option>`).join("")}</select></label></div>`,
      ok: { label: "Lancer le jet", callback: (ev, button) => button.form.elements.op.value }
    });
  } catch { return; }
  if (uuid) await shieldEmergencyRecharge(v, actorFromUuid(uuid));
}

/** Répartition de l'énergie : un système renforcé, une ou deux sources détournées. */
export async function onDivertPower() {
  const v = this.document;
  if (!(game.user.isGM || v.isOwner)) return;
  const systems = powerSystems(v);
  if (systems.length < 2) return ui.notifications.warn("Il faut au moins deux systèmes (propulsion, boucliers, armes) pour détourner l'énergie.");
  const st = powerState(v);
  const radios = systems.map((k) => `<label class="swv-hm-check"><input type="radio" name="boost" value="${k}" ${(st?.boost ?? systems[0]) === k ? "checked" : ""}> ${POWER_SYSTEMS[k]}</label>`).join("");
  const checks = systems.map((k) => `<label class="swv-hm-check"><input type="checkbox" name="from" value="${k}" ${st?.from?.includes(k) ? "checked" : ""}> ${POWER_SYSTEMS[k]}</label>`).join("");
  let data;
  try {
    data = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Gestion de l'énergie · ${v.name}` },
      content: `<div class="swv-hm-form">
        <p><strong>Système renforcé</strong></p>${radios}
        <p><strong>Énergie détournée de</strong> (un ou deux autres systèmes)</p>${checks}
        <p class="swv-hint">Action gratuite limitée ; dure jusqu'à la fin du tour suivant de l'opérateur.</p>
      </div>`,
      ok: { label: "Appliquer", callback: (ev, button) => {
        const f = button.form;
        return { boost: f.querySelector("input[name=boost]:checked")?.value,
          from: [...f.querySelectorAll("input[name=from]:checked")].map((i) => i.value) };
      } }
    });
  } catch { return; }
  if (!data?.boost) return;
  const from = data.from.filter((k) => k !== data.boost).slice(0, 2);
  if (!from.length) return ui.notifications.warn("Choisissez au moins un système dont l'énergie est détournée.");
  await setPower(v, { boost: data.boost, from }, game.user.name);
}

export async function onRestorePower() {
  const v = this.document;
  if (!(game.user.isGM || v.isOwner)) return;
  await setPower(v, null);
}

/** Recharge complète (10 minutes hors combat), MJ. */
export async function onShieldFull() {
  if (!game.user.isGM) return;
  const info = shieldInfo(this.document);
  if (!info) return;
  await setShieldCharges(this.document, info.max);
  await appendJournal(this.document, [`Bouclier rechargé (${info.max} / ${info.max})`]);
}

/** Dépense d'Énergie : montant et motif, refusée si la réserve est insuffisante. */
export async function onSpendEnergy() {
  const actor = this.document;
  if (!(game.user.isGM || actor.isOwner)) return;
  const current = actor.system.energy?.value ?? 0;
  let data;
  try {
    data = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Dépenser de l'Énergie · ${actor.name}` },
      content: `<div class="swv-hm-form">
        <p>Réserve : <strong>${current} / ${actor.system.energy?.max ?? 0}</strong></p>
        <label>Montant <input type="number" name="amount" min="1" step="1" value="1" autofocus></label>
        <label>Motif <input type="text" name="reason" placeholder="ex. bouclier, saut, détournement"></label>
      </div>`,
      ok: { label: "Dépenser", callback: (ev, button) => ({ amount: toInt(button.form.elements.amount.value), reason: button.form.elements.reason.value.trim() }) }
    });
  } catch { return; }
  if (!data || data.amount <= 0) return;
  if (data.amount > current) return ui.notifications.warn(`Énergie insuffisante : ${current} disponible pour ${data.amount} demandés.`);
  const reason = data.reason || "dépense";
  await actor.update({ "system.energy.value": current - data.amount }, { swvReason: reason });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p><strong>${escapeHTML(actor.name)}</strong> dépense ${data.amount} Énergie (${escapeHTML(reason)}) · reste ${current - data.amount} / ${actor.system.energy?.max ?? 0}</p>`
  });
}

/** Recharge (MJ) : jusqu'au maximum, ou d'un montant donné. */
export async function onRechargeEnergy() {
  if (!game.user.isGM) return;
  const actor = this.document;
  const { value = 0, max = 0 } = actor.system.energy ?? {};
  let amount;
  try {
    amount = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Recharger l'Énergie · ${actor.name}` },
      content: `<div class="swv-hm-form">
        <p>Réserve : <strong>${value} / ${max}</strong></p>
        <label>Montant à recharger <input type="number" name="amount" min="1" step="1" value="${Math.max(max - value, 0)}"></label>
      </div>`,
      ok: { label: "Recharger", callback: (ev, button) => toInt(button.form.elements.amount.value) }
    });
  } catch { return; }
  if (!amount || amount <= 0) return;
  await actor.update({ "system.energy.value": Math.min(value + amount, max) }, { swvReason: "recharge" });
}

export async function onReloadWeapon(event, target) {
  const weapon = this.document.items.get(target.dataset.itemId);
  if (!weapon || !(game.user.isGM || this.document.isOwner)) return;
  if (typeof weapon.reload === "function") {
    try { await weapon.reload(); return; } catch (err) { console.warn(`${MODULE_ID} | reload natif en échec`, err); }
  }
  await weapon.update({ "system.currentShots": weapon.system.shots });
  await appendJournal(this.document, [`${stripClasse(weapon.name)} rechargée (${weapon.system.shots})`]);
}

export async function onClearJournal() {
  if (!game.user.isGM) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Vider le journal" },
    content: "<p>Effacer tout le journal de ce véhicule ? Cette action est définitive.</p>"
  });
  if (ok) await this.document.unsetFlag(MODULE_ID, "journal");
}
