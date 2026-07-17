// Reset Bennies to Max for Wildcard NPCs (world actors + unlinked tokens)
const updated = [];
const skipped = [];

// 1. Actors du monde (fiches "source", et tokens liés)
for (const actor of game.actors) {
  if (actor.type === "npc" && actor.system.wildcard === true) {
    const max = actor.system.bennies?.max;
    if (max === undefined) { skipped.push(actor.name); continue; }
    await actor.update({ "system.bennies.value": max });
    updated.push(actor.name);
  }
}

// 2. Tokens non liés (unlinked) sur toutes les scènes du monde
for (const scene of game.scenes) {
  for (const tokenDoc of scene.tokens) {
    if (tokenDoc.actorLink) continue; // déjà couvert au-dessus
    const actor = tokenDoc.actor; // acteur synthétique (delta appliqué)
    if (actor?.type === "npc" && actor.system.wildcard === true) {
      const max = actor.system.bennies?.max;
      if (max === undefined) { skipped.push(`${tokenDoc.name} (scène: ${scene.name})`); continue; }
      await tokenDoc.actor.update({ "system.bennies.value": max });
      updated.push(`${tokenDoc.name} (scène: ${scene.name})`);
    }
  }
}

console.log("Bennies reset:", updated);
if (skipped.length) console.warn("Ignorés (pas de max défini):", skipped);

ui.notifications.info(`Bennies remis à fond pour ${updated.length} PNJ Wildcard.` + (skipped.length ? ` ${skipped.length} ignorés (voir console).` : ""));