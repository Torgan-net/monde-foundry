import { MODULE_ID } from "../constants.js";
import { stripClasse } from "../rules/classes.js";
import { CRIT_MAX, addCritical, criticalOutcome, outOfControlOutcome, speedMultiplier } from "../rules/tables.js";
import { crewActors } from "./crew.js";
import { aeChange, escapeHTML, gmNote, statusIdFor } from "./foundry-utils.js";
import { appendJournal } from "./journal.js";
import { addVehicleWounds } from "./wounds.js";

/**
 * Tire sur la table réglée et renvoie le total du 2d6 RÉELLEMENT utilisé par la table :
 * c'est ce total qui décide des effets, pour qu'ils correspondent toujours au texte affiché.
 * Sans table utilisable, le module lance lui-même 2d6.
 */
export async function drawVehicleTable(settingKey, vehicle, flavor) {
  const uuid = game.settings.get(MODULE_ID, settingKey);
  let table = null;
  try { table = uuid ? await fromUuid(uuid) : null; } catch { table = null; }
  if (table instanceof RollTable) {
    if (String(table.formula ?? "").replace(/\s+/g, "").toLowerCase() !== "2d6") {
      ui.notifications.warn(`La table « ${table.name} » n'utilise pas 2d6 (${table.formula}) : les effets risquent de ne pas correspondre.`);
    }
    try {
      const draw = await table.draw({ displayChat: true });
      const total = draw?.roll?.total;
      if (Number.isFinite(total)) return total;
      console.warn(`${MODULE_ID} | tirage sur ${uuid} sans total exploitable`, draw);
    } catch (err) {
      console.warn(`${MODULE_ID} | tirage sur ${uuid} impossible`, err);
    }
  } else {
    ui.notifications.warn(`Table introuvable (${uuid || "non réglée"}) : jet affiché sans texte.`);
  }
  const roll = await new Roll("2d6").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flavor: `${flavor} · ${vehicle.name}` });
  return roll.total;
}

/** Pose un état natif sur chaque membre d'équipage (durée gérée par SWADE). */
export async function crewToggleStatus(vehicle, statusId) {
  if (!statusId) return [];
  const names = [];
  for (const { actor } of crewActors(vehicle)) {
    if (actor.statuses?.has(statusId)) continue;
    await actor.toggleStatusEffect(statusId, { active: true });
    names.push(actor.name);
  }
  return names;
}

/** Effet actif unique qui porte les malus cumulés de Maniabilité et de Vitesse. */
export async function syncCritEffect(vehicle) {
  const crits = vehicle.getFlag(MODULE_ID, "crits") ?? {};
  const handling = Math.min(crits.handling ?? 0, CRIT_MAX.handling);
  const speed = Math.min(crits.speed ?? 0, CRIT_MAX.speed);
  const changes = [];
  if (handling) changes.push(aeChange("system.handling", "add", -handling));
  if (speed) changes.push(aeChange("system.topspeed.value", "multiply", speedMultiplier(speed)));
  const existing = vehicle.effects.find((e) => e.getFlag(MODULE_ID, "crit"));
  if (!changes.length) {
    if (existing) await existing.delete();
    return;
  }
  const data = { name: "Dégradations critiques", img: "icons/svg/hazard.svg", changes, flags: { [MODULE_ID]: { crit: true } } };
  if (existing) await existing.update({ changes });
  else await vehicle.createEmbeddedDocuments("ActiveEffect", [data]);
}

/**
 * Une Dégradation critique.
 * @param {object} [o]
 * @param {boolean} [o.collision]   cause = collision (Équipage : occupants Secoués)
 * @param {boolean} [o.rerollCrew]  relancer les résultats « Équipage » (Perte de contrôle, 12)
 */
export async function applyCritical(vehicle, { collision = false, rerollCrew = false } = {}) {
  let total = await drawVehicleTable("tableCritical", vehicle, "Dégradation critique");
  while (rerollCrew && criticalOutcome(total) === "crew") total = await drawVehicleTable("tableCritical", vehicle, "Dégradation critique (relance)");

  let crits = addCritical(vehicle.getFlag(MODULE_ID, "crits"), null);
  const log = [];
  const chassis = (why) => log.push(`Dégradation critique (${total}) : châssis${why ? ", " + why : ""}, sans effet particulier`);
  const outcome = criticalOutcome(total);

  if (outcome === "scratch") log.push(`Dégradation critique (${total}) : égratignure, sans dégât permanent`);
  else if (outcome === "handling") {
    crits = addCritical(crits, "handling");
    log.push(`Dégradation critique (${total}) : guidage, Maniabilité −${crits.handling} au total`);
  } else if (outcome === "speed") {
    crits = addCritical(crits, "speed");
    log.push(`Dégradation critique (${total}) : propulsion, Vitesse max −${crits.speed * 10} % au total`);
  } else if (outcome === "chassis") chassis();
  else if (outcome === "crew") {
    if (collision) {
      const names = await crewToggleStatus(vehicle, statusIdFor("shaken"));
      log.push(`Dégradation critique (${total}) : équipage, collision : occupants Secoués${names.length ? " (" + names.join(", ") + ")" : ""}`);
    } else {
      const crew = crewActors(vehicle);
      const victim = crew.length ? crew[Math.floor(Math.random() * crew.length)].actor : null;
      log.push(`Dégradation critique (${total}) : équipage, ${victim ? victim.name + " touché" : "aucun membre d'équipage"}`);
      await gmNote(vehicle, `<h3>Dégradation critique · équipage</h3>
        <p>${victim ? `<strong>${escapeHTML(victim.name)}</strong> est touché.` : "Aucun membre d'équipage à toucher."}</p>
        <p>Dégâts directs : retrancher l'Armure du véhicule si la position de la victime s'y prête. Arme à effet de zone : tous les occupants de la section choisie par le MJ.</p>`);
    }
  } else if (outcome === "weapon") {
    const intact = vehicle.items.filter((i) => i.type === "weapon" && i.system?.isVehicular && !crits.destroyed.includes(i.id));
    if (!intact.length) chassis("aucune arme à détruire");
    else {
      const w = intact[Math.floor(Math.random() * intact.length)];
      crits = addCritical(crits, "weapon", w.id);
      log.push(`Dégradation critique (${total}) : arme détruite, ${stripClasse(w.name)}`);
    }
  } else {
    log.push(`Dégradation critique (${total}) : système perdu, au choix du MJ`);
    await gmNote(vehicle, `<h3>Dégradation critique · système</h3><p>${escapeHTML(vehicle.name)} perd un système électronique ou un équipement au choix du MJ. Sans équipement particulier : effet Châssis.</p>`);
  }

  await vehicle.setFlag(MODULE_ID, "crits", crits);
  await syncCritEffect(vehicle);
  await appendJournal(vehicle, log);
  return total;
}

export async function applyOutOfControl(vehicle) {
  const total = await drawVehicleTable("tableOutOfControl", vehicle, "Perte de contrôle");
  const log = [];
  const crewNames = () => { const n = crewActors(vehicle).map((c) => c.actor.name); return n.length ? ` (${n.join(", ")})` : ""; };
  const outcome = outOfControlOutcome(total);
  if (outcome === "majorCollision") {
    await vehicle.update({ "system.status.isDistracted": true });
    const d4 = (await new Roll("1d4").evaluate()).total;
    log.push(`Perte de contrôle (${total}) : collision majeure, ${d4} Blessure${d4 > 1 ? "s" : ""}, véhicule et équipage Distraits${crewNames()} (à lever par le MJ)`);
    await appendJournal(vehicle, log);
    await addVehicleWounds(vehicle, d4, "collision majeure");
    await applyCritical(vehicle, { collision: true });
    return total;
  }
  if (outcome === "minorCollision") {
    await appendJournal(vehicle, [`Perte de contrôle (${total}) : collision mineure, 1 Blessure`]);
    await addVehicleWounds(vehicle, 1, "collision mineure");
    await applyCritical(vehicle, { collision: true });
    return total;
  }
  if (outcome === "distracted") {
    await vehicle.update({ "system.status.isDistracted": true });
    log.push(`Perte de contrôle (${total}) : embardée, véhicule et équipage Distraits${crewNames()} (à lever par le MJ)`);
  } else if (outcome === "vulnerable") {
    await vehicle.update({ "system.status.isVulnerable": true });
    log.push(`Perte de contrôle (${total}) : véhicule et équipage Vulnérables (à lever par le MJ)`);
  } else {
    log.push(`Perte de contrôle (${total}) : avarie, Dégradation critique (relance des résultats Équipage)`);
    await appendJournal(vehicle, log);
    await applyCritical(vehicle, { rerollCrew: true });
    return total;
  }
  await appendJournal(vehicle, log);
  return total;
}

export async function repairCriticals(vehicle) {
  const crits = vehicle.getFlag(MODULE_ID, "crits");
  if (!crits) return;
  await vehicle.unsetFlag(MODULE_ID, "crits");
  await syncCritEffect(vehicle);
  await appendJournal(vehicle, ["Réparations : Dégradations critiques effacées"]);
}

/* ------------------------------------------------------------------ */
/* API publique : game.modules.get("swade-vehicle").api                 */
/* ------------------------------------------------------------------ */
/*
 * Lecture seule sauf mention contraire. Chaque fonction accepte un acteur véhicule,
 * un jeton ou un UUID. Les valeurs « actuelles » incluent les effets actifs
 * (Dégradations critiques), comme les calcule le système.
 * Documentation complète : modules/swade-vehicle/API.md
 */
