/**
 * Bonus de vitesse à Changer de position (règle VF) : si un cavalier, un coureur ou un véhicule
 * (sa Vitesse max) est plus rapide que le plus rapide des assaillants, +1 ; au moins deux fois plus rapide, +2.
 * Règles pures.
 */
import { speedBonus } from "./maneuvers.js";

const KMH = /^(km\/?h|kph|kmh)$/i;
const MPH = /^(mph|mi\/?h)$/i;

/** Lit une Vitesse saisie en nombre ou en texte (« 120 km/h », « 75 mph »). */
export function parseSpeed(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return { value: raw, unit: "" };
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/.exec(String(raw ?? ""));
  if (!m) return null;
  return { value: Number(m[1].replace(",", ".")), unit: (m[2] ?? "").trim() };
}

/** Vitesse en km/h ; unité absente = valeur brute ; unité inconnue = null. */
export function toKmh(speed) {
  if (!speed || !Number.isFinite(speed.value)) return null;
  const unit = String(speed.unit ?? "").trim();
  if (!unit || KMH.test(unit)) return speed.value;
  if (MPH.test(unit)) return speed.value * 1.609344;
  return null;
}

/** Ramène une vitesse à une grandeur comparable : Allure (cases) ou km/h. */
function normalize(speed) {
  if (!speed || !Number.isFinite(speed.value)) return null;
  if (speed.unit === "pace") return { kind: "pace", value: speed.value };
  const kmh = toKmh(speed);
  return kmh == null ? null : { kind: "kmh", value: kmh };
}

/**
 * Personnages : Allure (unit "pace") ; véhicules : Vitesse max (km/h, mph). On ne compare que des grandeurs
 * de même nature : un coureur face à un véhicule n'a pas de bonus calculé.
 * @param {{value:number, unit:string}|null} mine vitesse de l'unité
 * @param {Array<{value:number, unit:string}|null>} opponents vitesses des assaillants
 * @returns {{bonus:number, mine:number, fastest:number, kind:"pace"|"kmh"}|null} null si incalculable
 */
export function autoSpeedBonus(mine, opponents) {
  const me = normalize(mine);
  if (!me || !opponents?.length) return null;
  const others = opponents.map(normalize);
  if (others.some((o) => !o || o.kind !== me.kind)) return null;
  const fastest = Math.max(...others.map((o) => o.value));
  return { bonus: speedBonus(me.value, fastest), mine: me.value, fastest, kind: me.kind };
}
