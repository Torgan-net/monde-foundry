import { DEFAULT_IMG, MODULE_ID } from "../constants.js";
import { toInt } from "../rules/numbers.js";
import { scaleForSize } from "../rules/size.js";

/** Échelle retenue : la valeur enregistrée si elle est forcée, sinon celle de la Taille. */
export function effectiveScale(actor) {
  const src = actor?._source?.system ?? actor?.system ?? {};
  if (actor?.getFlag?.(MODULE_ID, "scaleForced")) return toInt(src.scale);
  return scaleForSize(src.size);
}

/* Changements d'effets actifs (Foundry v14) : type en texte, « add », « multiply », « override »… */
export function changeType(c) { return String(c?.type ?? "add").toLowerCase(); }

export function aeChange(key, type, value) { return ({ key, type, value: String(value) }); }

/**
 * Effets actifs appliqués à une caractéristique : sources lisibles et valeur résultante.
 * Renvoie null si aucun effet ne touche ce chemin et que la valeur utilisée égale la valeur de base.
 */
export function effectsOn(actor, path) {
  const key = `system.${path}`;
  const fmt = (c) => {
    const v = String(c.value ?? "").trim();
    const type = changeType(c);
    if (type === "multiply") return `×${v}`;
    if (type === "override") return `= ${v}`;
    if (type === "upgrade") return `au moins ${v}`;
    if (type === "downgrade") return `au plus ${v}`;
    const n = Number(v);
    return Number.isFinite(n) ? (n >= 0 ? `+${n}` : `−${Math.abs(n)}`) : v;
  };
  const sources = [];
  for (const e of actor.appliedEffects ?? actor.effects ?? []) {
    if (e.disabled || e.isSuppressed) continue;
    for (const c of e.changes ?? []) {
      if (c.key !== key) continue;
      const from = e.parent && e.parent !== actor ? e.parent.name : e.name;
      sources.push(`${fmt(c)} (${from})`);
    }
  }
  const base = foundry.utils.getProperty(actor._source?.system ?? {}, path);
  const used = foundry.utils.getProperty(actor.system ?? {}, path);
  if (!sources.length && used === base) return null;
  return { sources: sources.join(", ") || "calcul du système", used };
}

export function resolveDoc(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

export function actorFromUuid(uuid) {
  const doc = resolveDoc(uuid);
  if (!doc) return null;
  if (doc instanceof Actor) return doc;
  return doc.actor ?? null; // TokenDocument
}

export function tokenImg(uuid) {
  const doc = resolveDoc(uuid);
  if (!doc) return DEFAULT_IMG;
  if (doc instanceof Actor) return doc.prototypeToken?.texture?.src || doc.img || DEFAULT_IMG;
  return doc.texture?.src || doc.actor?.img || DEFAULT_IMG;
}

export function findSkill(actor, key) {
  if (!actor || !key) return null;
  const k = String(key).toLowerCase().trim();
  return actor.items.find((i) => i.type === "skill"
    && (i.system?.swid === k || i.name.toLowerCase() === k)) ?? null;
}

export function getDragData(event) {
  const TE = foundry.applications.ux.TextEditor.implementation;
  try { return TE.getDragEventData(event); } catch { return null; }
}

export function randomId() { return foundry.utils.randomID(8); }

/** États actifs d'un acteur, avec libellé localisé et icône. */
export function actorStatuses(actor) {
  if (!actor?.statuses?.size) return [];
  return [...actor.statuses]
    .map((id) => CONFIG.statusEffects.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => ({ id: e.id, label: game.i18n.localize(e.name ?? e.label ?? e.id), img: e.img ?? e.icon }));
}

/* ------------------------------------------------------------------ */
/* Heavy Metal : résolution des dégâts (CSF, « Heavy Metal »)          */
/* ------------------------------------------------------------------ */

export function escapeHTML(t) { return (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(t ?? "")) : String(t ?? "")); }

export function plural(n, word) { return `${n} ${word}${Math.abs(n) > 1 ? "s" : ""}`; }

export function isResponsibleGM() { return (game.users.activeGM ? game.users.activeGM.isSelf : game.user.isGM); }

export function statusIdFor(...candidates) {
  const ids = new Set(CONFIG.statusEffects.map((e) => e.id));
  return candidates.find((c) => ids.has(c)) ?? null;
}

export async function gmNote(vehicle, html) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    content: `<div class="swv-group-card">${html}</div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
  });
}

export async function askNumber(title, html, value) {
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `<div class="swv-hm-form">${html}<label>Valeur <input type="number" name="n" min="0" step="1" value="${value}" autofocus></label></div>`,
      ok: { label: "Valider", callback: (ev, button) => toInt(button.form.elements.n.value) }
    });
  } catch { return null; }
}
