/**
 * Vitesse d'une unité : Vitesse max d'un véhicule (swade-vehicle, Dégradations comprises, sinon le champ
 * du système) ou Allure d'un personnage.
 */
import { parseSpeed, toKmh } from "../rules/speed.js";

export function vehicleSpeed(actor) {
  if (actor?.type !== "vehicle") return null;
  const mod = game.modules.get("swade-vehicle");
  const api = mod?.active ? mod.api : null;
  if (typeof api?.getTopSpeed === "function") {
    const s = api.getTopSpeed(actor);
    if (s && Number.isFinite(Number(s.value))) return { value: Number(s.value), unit: s.unit ?? "" };
  }
  const ts = actor.system?.topspeed ?? actor.system?.topSpeed;
  if (ts && typeof ts === "object") {
    return Number.isFinite(Number(ts.value)) ? { value: Number(ts.value), unit: ts.unit ?? "" } : null;
  }
  return parseSpeed(ts);
}

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Allure d'un personnage (non-véhicule). Constaté par dump (SWADE 6.0.4) :
 * system.pace = { base: "ground", ground: 6, fly, swim, burrow, running: {die, mod}, default: 6 }.
 * On prend l'Allure du mode de base (default), puis ground ; anciens champs en repli.
 */
export function characterPace(actor) {
  if (!actor || actor.type === "vehicle") return null;
  const sys = actor.system ?? {};
  const pace = sys.pace;
  return num(pace?.default) ?? num(pace?.[pace?.base]) ?? num(pace?.ground)
    ?? num(typeof pace === "object" ? null : pace) ?? num(pace?.value)
    ?? num(sys.stats?.speed?.adjusted) ?? num(sys.stats?.speed?.value);
}

/** Vitesse comparable d'une unité selon son mode (cavalier : Allure de sa monture, si elle est connue). */
export function unitSpeed(actor, mode, mountActor = null) {
  if (actor?.type === "vehicle") return vehicleSpeed(actor);
  if (mode === "mounted") {
    const p = characterPace(mountActor);
    return p == null ? null : { value: p, unit: "pace" };
  }
  if (mode !== "foot") return null;
  const p = characterPace(actor);
  return p == null ? null : { value: p, unit: "pace" };
}

/** Profil d'Éperonnage d'un acteur : Échelle, Taille, Résistance, Vitesse max (km/h, véhicules). */
export function ramProfile(actor) {
  const sys = actor?.system ?? {};
  const scale = num(sys.stats?.scale) ?? num(sys.scale);
  const size = num(sys.stats?.size) ?? num(sys.size);
  let toughness = null;
  if (actor?.type === "vehicle") {
    const mod = game.modules.get("swade-vehicle");
    const t = mod?.active && typeof mod.api?.getToughness === "function" ? mod.api.getToughness(actor) : null;
    toughness = num(t?.total) ?? num(sys.toughness?.total) ?? num(sys.toughness?.value);
  } else {
    toughness = num(sys.stats?.toughness?.value);
  }
  const speed = actor?.type === "vehicle" ? vehicleSpeed(actor) : null;
  return { scale: scale ?? undefined, size: size ?? undefined, toughness: toughness ?? undefined, speedKmh: speed ? toKmh(speed) ?? undefined : undefined };
}
