// Reset Jetons (Bennies) au max — v1.4
// Cible : PNJ Jokers + PJ qui ne sont le personnage attitré d'aucun joueur
// PNJ : max lu sur la valeur stockée (celle de la feuille), pas la valeur dérivée

if (!game.user.isGM) {
  ui.notifications.warn("Macro réservée au MJ.");
  return;
}

const updated = [];
const skipped = [];

const assignedIds = new Set(
  game.users.filter(u => !u.isGM && u.character).map(u => u.character.id)
);

const isTarget = (a) => {
  if (!a) return false;
  if (a.type === "npc") return a.system?.wildcard === true;
  if (a.type === "character") return !assignedIds.has(a.id);
  return false;
};

const toNum = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

// Max de référence : stocké pour les PNJ, dérivé pour les PJ
const maxForActor = (a) => a.type === "npc"
  ? toNum(a._source?.system?.bennies?.max)
  : toNum(a.system?.bennies?.max);

const maxForToken = (tokenDoc, a) => {
  if (a.type !== "npc") return toNum(a.system?.bennies?.max);
  const fromDelta = tokenDoc.delta?._source?.system?.bennies?.max;
  return toNum(fromDelta ?? tokenDoc.baseActor?._source?.system?.bennies?.max);
};

const tag = (a) => (a.type === "character" ? "PJ" : "PNJ");

// 1. Acteurs du monde (fiches source + tokens liés)
const actorUpdates = [];
for (const actor of game.actors) {
  if (!isTarget(actor)) continue;
  const label = `${actor.name} [${tag(actor)}]`;
  const max = maxForActor(actor);
  if (max === null) { skipped.push(label); continue; }
  if (actor.system.bennies.value === max) continue;
  actorUpdates.push({ _id: actor.id, "system.bennies.value": max });
  updated.push(`${label} → ${max}`);
}
if (actorUpdates.length) await Actor.updateDocuments(actorUpdates);

// 2. Tokens non liés
for (const scene of game.scenes) {
  const tokenUpdates = [];
  for (const tokenDoc of scene.tokens) {
    if (tokenDoc.actorLink) continue;
    const actor = tokenDoc.actor;
    if (!actor) continue;
    if (actor.type === "character" && assignedIds.has(tokenDoc.actorId)) continue;
    if (!isTarget(actor)) continue;
    const label = `${tokenDoc.name} [${tag(actor)}] (scène : ${scene.name})`;
    const max = maxForToken(tokenDoc, actor);
    if (max === null) { skipped.push(label); continue; }
    if (actor.system.bennies.value === max) continue;
    tokenUpdates.push({ _id: tokenDoc.id, "delta.system.bennies.value": max });
    updated.push(`${label} → ${max}`);
  }
  if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
}

// Journal texte uniquement (pas d'objets dépliables)
if (updated.length) console.log(`Jetons remis au max (${updated.length}) :\n` + updated.join("\n"));
if (skipped.length) console.warn(`Ignorés, pas de max défini (${skipped.length}) :\n` + skipped.join("\n"));

const nPJ = updated.filter(l => l.includes("[PJ]")).length;
const nPNJ = updated.length - nPJ;
ui.notifications.info(
  `Jetons remis au max : ${nPNJ} PNJ Joker(s), ${nPJ} PJ non attitré(s).` +
  (skipped.length ? ` ${skipped.length} ignoré(s), voir la console.` : "")
);