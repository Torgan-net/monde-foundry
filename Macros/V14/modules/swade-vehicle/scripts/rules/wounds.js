/** Blessures d'un véhicule. Règles pures. */

/** Malus de Blessures : −1 par Blessure non ignorée, −3 au plus. */
export function woundPenalty(value, ignored = 0) {
  const n = Math.min(Math.max(0, (value ?? 0) - (ignored ?? 0)), 3);
  return n ? -n : 0; // jamais « −0 »
}

/** Les Blessures vont de 0 à max + 1 (au-delà du maximum, le véhicule est une épave). */
export const clampVehicleWounds = (value, max) => Math.max(0, Math.min(value, (max ?? 0) + 1));

export const isWreckedValue = (value, max) => value > (max ?? 0);
