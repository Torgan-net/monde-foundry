/** Entier tolérant : accepte « −2 » (signe moins typographique), les chaînes et les valeurs vides (0). */
export function toInt(v) {
  const n = parseInt(String(v ?? "").replace("−", "-").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
