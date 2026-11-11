import { JOURNAL_MAX, MODULE_ID, STATUS } from "../constants.js";
import { actorFromUuid } from "./foundry-utils.js";

export function nameOf(uuid) { return actorFromUuid(uuid)?.name ?? "acteur introuvable"; }

/** Événements notables d'une mise à jour de véhicule, comparés à l'état avant la mise à jour. */
export function journalEntriesFor(actor, changes, options) {
  const out = [];
  const get = (path) => foundry.utils.getProperty(changes, path);
  const sys = actor.system ?? {};
  const reason = options?.swvReason ? ` (${options.swvReason})` : "";

  const wounds = get("system.wounds.value");
  if (wounds !== undefined && wounds !== (sys.wounds?.value ?? 0)) {
    const before = sys.wounds?.value ?? 0;
    const delta = wounds - before;
    out.push(`Blessures ${before} → ${wounds} (${delta > 0 ? "+" : ""}${delta})${reason}`);
  }
  for (const [key, label] of STATUS) {
    const v = get(`system.status.${key}`);
    if (v !== undefined && !!v !== !!sys.status?.[key]) out.push(`${label} : ${v ? "activé" : "levé"}`);
  }
  const energy = get("system.energy.value");
  if (energy !== undefined && energy !== (sys.energy?.value ?? 0)) out.push(`Énergie ${sys.energy?.value ?? 0} → ${energy}${reason}`);

  const postes = get(`flags.${MODULE_ID}.postes`);
  if (Array.isArray(postes)) {
    const old = actor.getFlag(MODULE_ID, "postes") ?? [];
    for (const p of postes) {
      const before = old.find((o) => o.id === p.id)?.occupant ?? null;
      const after = p.occupant ?? null;
      if (before === after) continue;
      if (before) out.push(`${nameOf(before)} quitte le poste ${p.label}`);
      if (after) out.push(`${nameOf(after)} prend le poste ${p.label}`);
    }
    for (const o of old) {
      if (o.occupant && !postes.some((p) => p.id === o.id)) out.push(`Poste ${o.label} supprimé (${nameOf(o.occupant)} en est retiré)`);
    }
  }
  if (changes.name && changes.name !== actor.name) out.push(`Renommé : ${actor.name} → ${changes.name}`);
  return out;
}

/** Ajoute les entrées au journal dans la même mise à jour : pas d'écriture supplémentaire. */
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (actor.type !== "vehicle") return;
  const texts = journalEntriesFor(actor, changes, options);
  if (!texts.length) return;
  const journal = [...(actor.getFlag(MODULE_ID, "journal") ?? [])];
  const t = Date.now();
  const u = game.users.get(userId)?.name ?? "";
  for (const text of texts) journal.push({ t, u, text });
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.journal`, journal.slice(-JOURNAL_MAX));
});

/* ------------------------------------------------------------------ */
/* Perte de contrôle et Dégradations critiques                          */
/* ------------------------------------------------------------------ */
/*
 * Le texte affiché vient des tables (paramètres du module). Les effets automatiques
 * sont déclenchés d'après la valeur du 2d6, indépendamment de la langue de la table.
 */

export async function appendJournal(vehicle, texts) {
  if (!texts.length) return;
  const journal = [...(vehicle.getFlag(MODULE_ID, "journal") ?? [])];
  const t = Date.now();
  for (const text of texts) journal.push({ t, u: game.user.name, text });
  await vehicle.setFlag(MODULE_ID, "journal", journal.slice(-JOURNAL_MAX));
}
