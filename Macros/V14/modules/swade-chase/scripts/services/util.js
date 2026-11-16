/** Petits utilitaires sans dépendance. */

export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function signed(n) {
  return n > 0 ? `+${n}` : (n < 0 ? `−${Math.abs(n)}` : "0");
}

export function modsText(mods) {
  if (!mods?.length) return "aucun modificateur";
  return mods.map((m) => `${signed(m.value)} ${m.label}`).join(", ");
}

export function modsTotal(mods) {
  return (mods ?? []).reduce((s, m) => s + (Number(m.value) || 0), 0);
}

/** Regroupe les appels rapprochés (une clé = un minuteur). */
export function debounceKeyed(fn, delay = 250) {
  const timers = new Map();
  return (key, ...args) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); fn(...args); }, delay));
  };
}
