/** Petites tournures de texte, pures. */
const sgn = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** « sans modificateur », « à −2 », « à +2 ». */
export function modsPhrase(mods) {
  const t = (mods ?? []).reduce((s, m) => s + (Number(m.value) || 0), 0);
  return t ? `à ${sgn(t)}` : "sans modificateur";
}
