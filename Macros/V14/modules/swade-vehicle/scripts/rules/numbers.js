/** Entier tolérant : accepte « −2 » (signe moins typographique), les chaînes et les valeurs vides (0). */
export function toInt(v) {
  const n = parseInt(String(v ?? "").replace("−", "-").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Taille la plus petite de la table des Tailles (Minuscule). */
export const MIN_SIZE = -4;

/**
 * Valeur saisie d'une caractéristique technique, selon son type :
 * "text" (texte nettoyé), "int" (entier ≥ 0), "signed" (entier), "size" (entier ≥ −4).
 */
export function techValue(kind, raw) {
  if (kind === "text") return String(raw ?? "").trim();
  const n = toInt(raw);
  if (kind === "int") return Math.max(0, n);
  if (kind === "size") return Math.max(MIN_SIZE, n);
  return n;
}
