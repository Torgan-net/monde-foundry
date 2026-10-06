// Reset Jetons (Bennies) au max — v1.3
// Cible : PNJ Jokers + PJ qui ne sont le personnage attitré d'aucun joueur
// Couvre : acteurs du monde (et tokens liés) + tokens non liés de toutes les scènes

if (!game.user.isGM) {
  ui.notifications.warn("Macro réservée au MJ.");
  return;
}

const updated = [];
const skipped = [];

// IDs des personnages attitrés des joueurs (Configuration du joueur > Personnage)
const assignedIds = new Set(
  game.users.filter(u => !u.isGM && u.character).map(u => u.character.id)
);

const isTarget = (a) => {
  if (!a) return false;
  if (a.type === "npc") return a.system?.wildcard === true;
  if (a.type === "character") return !assignedIds.has(a.id);
  return false;
};

const getMax = (a) => {
  const max = Number(a.system?.bennies?.max);
  return Number.isFinite(max) ? max : null;
};

const tag = (a) => (a.type === "character" ? "PJ" : "PNJ");

// 1. Acteurs du monde (fiches source + tokens liés) — mise à jour groupée
const actorUpdates = [];
for (const actor of game.actors) {
  if (!isTarget(actor)) continue;
  const label = `${actor.name} [${tag(actor)}]`;
  const max = getMax(actor);
  if (max === null) { skipped.push(label); continue; }
  if (actor.system.bennies.value === max) continue; // déjà au max
  actorUpdates.push({ _id: actor.id, "system.bennies.value": max });
  updated.push(label);
}
if (actorUpdates.length) await Actor.updateDocuments(actorUpdates);

// 2. Tokens non liés : mise à jour du delta, groupée par scène
for (const scene of game.scenes) {
  const tokenUpdates = [];
  for (const tokenDoc of scene.tokens) {
    if (tokenDoc.actorLink) continue; // couvert en 1
    const actor = tokenDoc.actor;     // acteur synthétique (base + delta)
    if (!actor) continue;
    // Pour un token non lié, l'attitré se juge sur l'acteur de base
    if (actor.type === "character" && assignedIds.has(tokenDoc.actorId)) continue;
    if (!isTarget(actor)) continue;
    const label = `${tokenDoc.name} [${tag(actor)}] (scène : ${scene.name})`;
    const max = getMax(actor);
    if (max === null) { skipped.push(label); continue; }
    if (actor.system.bennies.value === max) continue;
    tokenUpdates.push({ _id: tokenDoc.id, "delta.system.bennies.value": max });
    updated.push(label);
  }
  if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
}

console.log("Jetons remis au max :", updated);
if (skipped.length) console.warn("Ignorés (pas de max défini) :", skipped);

const nPJ = updated.filter(l => l.includes("[PJ]")).length;
const nPNJ = updated.length - nPJ;
ui.notifications.info(
  `Jetons remis au max : ${nPNJ} PNJ Joker(s), ${nPJ} PJ non attitré(s).` +
  (skipped.length ? ` ${skipped.length} ignoré(s), voir la console.` : "")
);