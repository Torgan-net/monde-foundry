// Reset Bennies to Max for Wildcard NPCs
for (const actor of game.actors) {
  if (actor.type === "npc" && actor.system.wildcard === true) {
    await actor.update({ "system.bennies.value": actor.system.bennies.max });
    console.log(`${actor.name}: Wildcard bennies reset to ${actor.system.bennies.max}`);
  }
}

ui.notifications.info("All Wildcard NPC bennies reset to max!");