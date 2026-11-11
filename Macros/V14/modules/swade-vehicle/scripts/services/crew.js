import { CREW_STATUS, MODULE_ID } from "../constants.js";
import { actorFromUuid, isResponsibleGM } from "./foundry-utils.js";

export function resolveStatusId(key) {
  const ids = new Set(CONFIG.statusEffects.map((e) => e.id));
  const id = CREW_STATUS[key].find((c) => ids.has(c));
  if (!id) console.warn(`${MODULE_ID} | état introuvable dans CONFIG.statusEffects pour ${key}`, [...ids]);
  return id ?? null;
}

export function crewActors(vehicle) {
  const uuids = new Set((vehicle.system?.crew?.members ?? []).map((m) => m.uuid).filter(Boolean));
  return [...uuids].map((uuid) => ({ uuid, actor: actorFromUuid(uuid) })).filter((e) => e.actor);
}

/** Effets posés par CE véhicule sur un acteur, pour un état donné. */
export function vehicleEffects(actor, vehicleUuid, statusId) {
  return actor.effects.filter((e) => e.getFlag(MODULE_ID, "vehicle") === vehicleUuid && e.statuses?.has(statusId));
}

/**
 * Aligne les effets de l'équipage sur les états du véhicule.
 * - Pose l'état sur chaque membre quand il est actif sur le véhicule.
 * - Le retire quand il ne l'est plus, ou quand le membre quitte le véhicule.
 * Seuls les effets marqués comme venant de ce véhicule sont retirés : un état
 * que le personnage avait déjà pour une autre raison n'est jamais touché.
 */
export async function syncCrewStatus(vehicle, { removeAll = false } = {}) {
  const applied = foundry.utils.deepClone(vehicle.getFlag(MODULE_ID, "crewStatus") ?? {});
  const crew = removeAll ? [] : crewActors(vehicle);
  let changed = false;

  for (const key of Object.keys(CREW_STATUS)) {
    const statusId = resolveStatusId(key);
    if (!statusId) continue;
    const active = !removeAll && !!vehicle.system?.status?.[key];
    const wanted = new Set(active ? crew.map((c) => c.uuid) : []);
    const before = new Set(applied[key] ?? []);

    for (const uuid of before) {
      if (wanted.has(uuid)) continue;
      const actor = actorFromUuid(uuid);
      const ours = actor ? vehicleEffects(actor, vehicle.uuid, statusId) : [];
      if (ours.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ours.map((e) => e.id));
    }
    for (const { uuid, actor } of crew) {
      if (!wanted.has(uuid) || vehicleEffects(actor, vehicle.uuid, statusId).length) continue;
      // Déjà servi pour cette activation de l'état : si l'effet a expiré entre-temps (fin de tour gérée
      // par SWADE), on ne le repose pas. Il ne sera reposé qu'après une désactivation puis réactivation.
      if (before.has(uuid)) continue;
      if (actor.statuses?.has(statusId)) continue; // déjà dans cet état pour une autre raison : pas de doublon
      const effect = await ActiveEffect.implementation.fromStatusEffect(statusId);
      const data = effect.toObject();
      data.origin = vehicle.uuid;
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.vehicle`, vehicle.uuid);
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }
    const after = [...wanted];
    if (after.join() !== [...before].join()) { applied[key] = after; changed = true; }
  }
  if (changed && !removeAll) await vehicle.setFlag(MODULE_ID, "crewStatus", applied);
}

Hooks.on("updateActor", (actor, changes) => {
  if (actor.type !== "vehicle" || !isResponsibleGM()) return;
  const statusChanged = Object.keys(CREW_STATUS).some((k) => foundry.utils.hasProperty(changes, `system.status.${k}`));
  const crewChanged = foundry.utils.hasProperty(changes, "system.crew.members");
  if (statusChanged || crewChanged) syncCrewStatus(actor).catch((err) => console.error(`${MODULE_ID} |`, err));
});

Hooks.on("deleteActor", (actor) => {
  if (actor.type !== "vehicle" || !isResponsibleGM()) return;
  syncCrewStatus(actor, { removeAll: true }).catch((err) => console.error(`${MODULE_ID} |`, err));
});

/* ------------------------------------------------------------------ */
/* Journal du véhicule                                                  */
/* ------------------------------------------------------------------ */
