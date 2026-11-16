/**
 * Cartes d'action et cartes de poursuite. Règles pures : aucune référence à Foundry.
 * Codage SWADE constaté par dump : combatant.system.suitValue 1 trèfle, 2 carreau, 3 cœur, 4 pique ;
 * Joker : hasJoker true, cardValue 98 (noir) ou 99 (rouge).
 */

export const SUIT_BY_VALUE = Object.freeze({ 1: "clubs", 2: "diamonds", 3: "hearts", 4: "spades" });

export const SUIT_LABELS = Object.freeze({
  spades: "Pique", hearts: "Cœur", diamonds: "Carreau", clubs: "Trèfle", joker: "Joker"
});

export const SUIT_SYMBOLS = Object.freeze({
  spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣", joker: "★"
});

const FACE = Object.freeze({ 11: "V", 12: "D", 13: "R", 14: "A" });

/**
 * Lit la carte d'action d'un combattant.
 * @param {{cardValue?:number, suitValue?:number, hasJoker?:boolean, cardString?:string}|null} sys combatant.system
 * @returns {{value:number, suit:string|null, isJoker:boolean, red:boolean, label:string}|null}
 */
export function readActionCard(sys) {
  if (!sys || !sys.cardValue) return null;
  const isJoker = !!sys.hasJoker || sys.cardValue >= 98;
  const suit = isJoker ? "joker" : (SUIT_BY_VALUE[sys.suitValue] ?? null);
  const red = isJoker ? sys.cardValue === 99 : (suit === "hearts" || suit === "diamonds");
  const label = isJoker
    ? (sys.cardValue === 99 ? "Joker rouge" : "Joker noir")
    : `${FACE[sys.cardValue] ?? sys.cardValue}${SUIT_SYMBOLS[suit] ?? ""}`;
  return { value: sys.cardValue, suit, isJoker, red, label };
}

/** Une Complication survient quand la carte d'action est un trèfle (le Joker n'en est pas un). */
export function triggersComplication(card) {
  return !!card && !card.isJoker && card.suit === "clubs";
}

/**
 * Libellé court VF d'une carte de poursuite (Card de Foundry : suit, value).
 * @param {{suit:string, value:number}} card
 */
export function chaseCardLabel(card) {
  if (!card) return "";
  if (card.suit === "joker") return "Joker";
  return `${FACE[card.value] ?? card.value}${SUIT_SYMBOLS[card.suit] ?? ""}`;
}

export function isRedSuit(suit) {
  return suit === "hearts" || suit === "diamonds";
}

/** Combattant En attente (constaté : combatant.system.roundHeld = round où il a été mis En attente). */
export function isOnHold(sys) {
  return Number(sys?.roundHeld) > 0;
}
