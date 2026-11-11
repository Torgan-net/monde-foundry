/**
 * Lecture des données d'un véhicule : postes, équipage, pilote, armes, modificateurs actuels.
 * Chaque fonction accepte un acteur véhicule, un jeton ou un UUID. Lecture seule.
 */
import { MODULE_ID, ROLE_BY_TYPE } from "../constants.js";
import { computeWeaponClasse, stripClasse, weaponClasseValue } from "../rules/classes.js";
import { toInt } from "../rules/numbers.js";
import { combineSupportBonuses, defaultSupportSkill, normalizeSupports, pendingSupportBonuses } from "../rules/support.js";
import { woundPenalty } from "../rules/wounds.js";
import { actorFromUuid } from "./foundry-utils.js";
import { supportSkillKey } from "./support.js";

export function asVehicle(ref) {
  let actor = ref;
  if (typeof ref === "string") actor = actorFromUuid(ref);
  else if (ref?.actor && !(ref instanceof Actor)) actor = ref.actor; // jeton ou TokenDocument
  return actor?.type === "vehicle" ? actor : null;
}

export function apiPostes(ref) {
  const v = asVehicle(ref);
  if (!v) return [];
  return (v.getFlag(MODULE_ID, "postes") ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    type: p.type,
    role: ROLE_BY_TYPE[p.type] ?? "other",
    skill: p.type === "pilote" ? (v.system.driver?.skill || null) : (p.skill || null),
    occupantUuid: p.occupant ?? null,
    occupant: actorFromUuid(p.occupant),
    weapons: (p.weapons ?? []).map((id) => v.items.get(id)).filter(Boolean),
    mods: (p.mods ?? []).map((id) => v.items.get(id)).filter(Boolean),
    ...supportsOf(v, p)
  }));
}

/** Soutiens d'un poste (acteur résolu, compétence effective) et bonus cumulé en attente. */
function supportsOf(v, p) {
  const supports = normalizeSupports(p).map((s) => {
    const actor = s.actor ? actorFromUuid(s.actor) : null;
    // Avec acteur : compétence réglée, sinon la première de l'acteur. Sans acteur : celle du poste.
    return { ...s, actorUuid: s.actor, actor, skill: actor ? supportSkillKey(actor, s.skill) : s.skill || defaultSupportSkill(p, v.system.driver?.skill) };
  });
  const pending = pendingSupportBonuses(v.getFlag(MODULE_ID, `supportBonus.${p.id}`));
  return {
    supports,
    support: supports[0] ?? null, // compatibilité API 1.0 : premier soutien
    supportBonus: combineSupportBonuses(pending.map((b) => b.value))
  };
}

export function apiCrew(ref) {
  const v = asVehicle(ref);
  if (!v) return [];
  return (v.system.crew?.members ?? []).map((m) => ({
    uuid: m.uuid, role: m.role, actor: actorFromUuid(m.uuid), weapons: [...(m.weapons ?? [])]
  }));
}

export function apiPilot(ref) {
  const v = asVehicle(ref);
  if (!v) return null;
  const poste = apiPostes(v).find((p) => p.type === "pilote" && p.occupant);
  if (poste) return poste.occupant;
  return apiCrew(v).find((m) => m.role === "operator" && m.actor)?.actor ?? null;
}

export function apiWoundPenalty(ref) {
  const v = asVehicle(ref);
  if (!v) return 0;
  const w = v.system.wounds ?? {};
  return woundPenalty(w.value, w.ignored);
}

export function apiCurrentHandling(ref) {
  const v = asVehicle(ref);
  return v ? toInt(v.system.handling) : 0;
}

export function apiManeuverModifiers(ref) {
  const v = asVehicle(ref);
  if (!v) return [];
  return [
    { label: "Maniabilité", value: apiCurrentHandling(v) },
    { label: "Blessures du véhicule", value: apiWoundPenalty(v) }
  ].filter((m) => m.value);
}

export function apiWeapons(ref, { includeDestroyed = false } = {}) {
  const v = asVehicle(ref);
  if (!v) return [];
  const destroyed = v.getFlag(MODULE_ID, "crits")?.destroyed ?? [];
  const postes = apiPostes(v);
  const crew = apiCrew(v);
  return v.items
    .filter((i) => i.type === "weapon" && i.system?.isVehicular)
    .map((item) => {
      const posteList = postes.filter((p) => p.weapons.some((w) => w.id === item.id));
      const operator = posteList.find((p) => p.occupant)?.occupant
        ?? crew.find((m) => m.weapons.includes(item.id) && m.actor)?.actor ?? null;
      return {
        item,
        id: item.id,
        name: stripClasse(item.name),
        classe: item.getFlag(MODULE_ID, "classe") || computeWeaponClasse(item),
        classeValue: weaponClasseValue(item),
        isHeavy: !!item.system.isHeavyWeapon,
        fixed: !!item.getFlag(MODULE_ID, "fixed"),
        energyBased: !!item.getFlag(MODULE_ID, "energy"),
        warhead: item.getFlag(MODULE_ID, "warhead") ?? "",
        destroyed: destroyed.includes(item.id),
        postes: posteList.map((p) => ({ id: p.id, label: p.label })),
        operator
      };
    })
    .filter((w) => includeDestroyed || !w.destroyed);
}
