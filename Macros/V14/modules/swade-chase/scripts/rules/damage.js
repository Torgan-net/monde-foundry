/**
 * Dégâts pendant une poursuite (règles VF) :
 * - personnage ou monture Secoué, Sonné ou Blessé → il est aussi Bousculé ;
 * - véhicule : dégâts ≥ Résistance (avec ou sans Blessure) → le conducteur réussit un jet de Manœuvre
 *   ou subit une Perte de contrôle ; le véhicule est aussi Bousculé (une fois par attaquant).
 * Règles pures.
 */

/** État utile d'un acteur SWADE (constaté par dump) : system.status.isShaken / isStunned, system.wounds.value ; effet de statut « shaken ». */
export function readCondition(sys) {
  return {
    shaken: !!sys?.status?.isShaken,
    stunned: !!sys?.status?.isStunned,
    wounds: Number(sys?.wounds?.value) || 0
  };
}

/**
 * Compare l'état avant / après une mise à jour.
 * @returns {{bump:boolean, control:boolean, cause:string}|null}
 */
export function damageTrigger({ isVehicle, before, after }) {
  if (isVehicle) {
    return after.wounds > before.wounds
      ? { bump: true, control: true, cause: "dégâts au moins égaux à sa Résistance" }
      : null;
  }
  if (after.wounds > before.wounds) return { bump: true, control: false, cause: "Blessé" };
  if (after.stunned && !before.stunned) return { bump: true, control: false, cause: "Sonné" };
  if (after.shaken && !before.shaken) return { bump: true, control: false, cause: "Secoué" };
  return null;
}

/** Effet de statut posé sur un personnage : Secoué ou Sonné déclenchent un Bousculé. */
export function statusTrigger(statuses) {
  const set = statuses instanceof Set ? statuses : new Set(statuses ?? []);
  if (set.has("stunned")) return "Sonné";
  if (set.has("shaken")) return "Secoué";
  return null;
}
