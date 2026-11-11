/**
 * Jet de groupe du soutien. Règle pure.
 * Dé du groupe + dé Joker, le meilleur des deux, + modificateur, contre 4 :
 * réussite +1, Prouesse (8+) +2, échec critique (deux 1) −2 au prochain jet du poste.
 * Relance avec un Jeton : on garde le meilleur résultat ; un échec critique ne se relance pas.
 * @param {{trait:number, wild:number, traitFirst?:number, wildFirst?:number, mod?:number, previous?:number}} r
 *   trait/wild : totaux (explosions comprises) ; traitFirst/wildFirst : premier résultat de chaque dé ;
 *   previous : bonus du jet précédent en cas de relance.
 */
export function groupRollOutcome({ trait, wild, traitFirst, wildFirst, mod = 0, previous = null }) {
  const critFail = traitFirst === 1 && wildFirst === 1;
  const total = Math.max(trait, wild) + mod;
  let bonus = critFail ? -2 : total >= 8 ? 2 : total >= 4 ? 1 : 0;
  let kept = false;
  if (Number.isFinite(previous) && !critFail && previous > bonus) { bonus = previous; kept = true; }
  return { total, bonus, critFail, kept };
}

/* ------------------------------------------------------------------ */
/* Soutiens multiples d'un poste                                        */
/* ------------------------------------------------------------------ */

/** Plafond du bonus total de Soutien (règle de Soutien du livre de base). */
export const SUPPORT_MAX = 4;

const DICE = [4, 6, 8, 10, 12];
const int = (v) => { const n = parseInt(String(v ?? "").replace("−", "-"), 10); return Number.isFinite(n) ? n : 0; };

/**
 * Soutiens d'un poste, au format liste. L'ancien format (un objet `support` avec `enabled`) est converti
 * en un soutien d'identifiant « legacy ».
 * @returns {{id:string, label:string, count:number, die:number, mod:number, skill:string, actor:string|null}[]}
 */
export function normalizeSupports(poste) {
  const norm = (s, id) => ({
    id: s.id ?? id,
    label: s.label ?? "",
    count: Math.max(0, int(s.count)),
    die: DICE.includes(int(s.die)) ? int(s.die) : 6,
    mod: int(s.mod),
    skill: s.skill ?? "",
    actor: s.actor || null
  });
  if (Array.isArray(poste?.supports)) return poste.supports.map((s, i) => norm(s, `s${i}`));
  if (poste?.support?.enabled) return [norm(poste.support, "legacy")];
  return [];
}

/** Compétence par défaut d'un soutien : celle du poste (manœuvre pour le pilote, Tir pour un artilleur). */
export function defaultSupportSkill(poste, driverSkill) {
  if (poste?.type === "pilote") return driverSkill || null;
  if (poste?.type === "artilleur") return "Shooting";
  return poste?.skill || null;
}

/** Bonus total de plusieurs soutiens : somme, plafonnée à +4 (les échecs critiques −2 se déduisent). */
export function combineSupportBonuses(values) {
  const sum = (values ?? []).reduce((t, v) => t + (Number(v) || 0), 0);
  return Math.min(sum, SUPPORT_MAX);
}

/** Bonus en attente d'un poste, d'après le flag : ancien format { value, label } ou { [soutien]: { value, label } }. */
export function pendingSupportBonuses(flag) {
  if (!flag || typeof flag !== "object") return [];
  if ("value" in flag) return flag.value ? [{ id: "legacy", value: flag.value, label: flag.label ?? "" }] : [];
  return Object.entries(flag).filter(([, b]) => b?.value).map(([id, b]) => ({ id, value: b.value, label: b.label ?? "" }));
}

/** Effectif apporté à l'équipage par les soutiens : l'effectif saisi, au moins 1 pour un soutien avec acteur. */
export function supportCrewCount(supports) {
  return (supports ?? []).reduce((t, s) => t + (s.actor ? Math.max(1, int(s.count)) : Math.max(0, int(s.count))), 0);
}
