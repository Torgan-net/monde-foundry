/**
 * Pont vers le MJ actif (sans socketlib) : les écritures d'état et l'application des conséquences
 * s'exécutent sur le client du MJ actif. Les messages « all » sont traités par tous les clients.
 */
import { MODULE_ID } from "../constants.js";

const gmHandlers = new Map();
const allHandlers = new Map();
const CHANNEL = `module.${MODULE_ID}`;

export function onGM(name, fn) { gmHandlers.set(name, fn); }
export function onAll(name, fn) { allHandlers.set(name, fn); }

export function initSocket() {
  game.socket.on(CHANNEL, async (msg) => {
    if (!msg?.name) return;
    try {
      if (msg.type === "gm") {
        if (!game.users.activeGM?.isSelf) return;
        await gmHandlers.get(msg.name)?.(msg.payload ?? {}, game.users.get(msg.userId));
      } else if (msg.type === "all") {
        await allHandlers.get(msg.name)?.(msg.payload ?? {});
      }
    } catch (err) {
      console.error(`${MODULE_ID} | socket ${msg.name}`, err);
    }
  });
}

/** Exécute un traitement sur le client du MJ actif. */
export async function asGM(name, payload = {}) {
  if (game.users.activeGM?.isSelf) return gmHandlers.get(name)?.(payload, game.user);
  if (!game.users.activeGM) {
    ui.notifications.warn("Aucun MJ connecté : l'action ne peut pas être enregistrée.");
    return null;
  }
  game.socket.emit(CHANNEL, { type: "gm", name, payload, userId: game.user.id });
  return null;
}

/** Diffuse à tous les clients, y compris celui-ci. */
export async function broadcast(name, payload = {}) {
  game.socket.emit(CHANNEL, { type: "all", name, payload });
  return allHandlers.get(name)?.(payload);
}

/** Le demandeur peut-il agir pour ce combattant ? */
export function canControl(user, combatant) {
  if (!user || !combatant) return false;
  if (user.isGM) return true;
  return !!combatant.actor?.testUserPermission?.(user, "OWNER");
}
