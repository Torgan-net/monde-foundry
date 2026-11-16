/**
 * Lecture de la piste posée avec Complete Card Management (CCM).
 * Constaté par dump : une carte posée porte flags["complete-card-management"][<sceneId>] = { x, y, rotation, sort },
 * x, y = coin supérieur gauche ; le calque CardLayer donne la taille réelle (bounds).
 */
import { DEFAULT_CARD_SIZE } from "../constants.js";
import { orderTrack, locateOnTrack } from "../rules/track.js";

const CCM = "complete-card-management";
const CHASE_SUITS = new Set(["spades", "hearts", "diamonds", "clubs", "joker"]);

function cardSizes(sceneId) {
  const sizes = new Map();
  if (!canvas?.ready || canvas.scene?.id !== sceneId) return sizes;
  const layer = canvas.layers?.find((l) => l?.constructor?.name === "CardLayer");
  for (const p of layer?.placeables ?? []) {
    const b = p.bounds;
    const id = p.document?.uuid ?? p.id;
    if (b?.width && b?.height && id) sizes.set(id, { w: b.width, h: b.height });
  }
  return sizes;
}

/**
 * Cartes de poursuite de la scène, ordonnées. Seules les cartes à enseigne (paquet classique) comptent :
 * les cartes d'aventure éventuellement posées sont ignorées.
 */
export function readSceneTrack(scene = canvas?.scene) {
  if (!scene || !game.modules.get(CCM)?.active) return [];
  const sizes = cardSizes(scene.id);
  const cards = [];
  for (const stack of game.cards ?? []) {
    for (const card of stack.cards ?? []) {
      const pos = card.flags?.[CCM]?.[scene.id];
      if (!pos || !CHASE_SUITS.has(card.suit)) continue;
      let { w, h } = sizes.get(card.uuid) ?? DEFAULT_CARD_SIZE;
      const rot = ((Number(pos.rotation) || 0) % 180 + 180) % 180;
      if (!sizes.has(card.uuid) && rot === 90) [w, h] = [h, w];
      cards.push({ id: card.uuid, suit: card.suit, value: card.value, x: pos.x, y: pos.y, w, h });
    }
  }
  return orderTrack(cards);
}

export function tokenRect(tokenDoc) {
  const grid = tokenDoc?.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
  return { x: tokenDoc.x, y: tokenDoc.y, w: (tokenDoc.width ?? 1) * grid, h: (tokenDoc.height ?? 1) * grid };
}

/** Position d'un combattant sur la piste. */
export function locateCombatant(track, combatant) {
  const tok = combatant?.token;
  if (!tok) return { onTrack: false, reason: "no-token" };
  if (tok.parent && canvas?.scene && tok.parent.id !== canvas.scene.id) return { onTrack: false, reason: "no-token" };
  return locateOnTrack(track, tokenRect(tok));
}
