export const MODULE_ID = "swade-chase";
export const VERSION = "0.4.10";

/** Mode de déplacement → compétence de Manœuvre (swid SWADE + nom VF). */
export const MODES = Object.freeze({
  foot: { label: "À pied ou à vélo", swid: "athletics", skill: "Athlétisme", names: ["Athlétisme", "Athletics"] },
  mounted: { label: "Monté ou en chariot", swid: "riding", skill: "Équitation", names: ["Équitation", "Riding"] },
  vehicle: { label: "Autre véhicule", swid: "driving", skill: "Conduite", names: ["Conduite", "Driving"] },
  boat: { label: "En bateau", swid: "boating", skill: "Navigation", names: ["Navigation", "Boating"] },
  air: { label: "Avion ou vaisseau spatial", swid: "piloting", skill: "Pilotage", names: ["Pilotage", "Piloting"] }
});

/** Intervalles par carte (p. 123). */
export const CHASE_TYPES = Object.freeze({
  ground: { label: "À pied, monté, en véhicule", interval: 5 },
  prop: { label: "Avion à hélice, navire à voile", interval: 25 },
  jet: { label: "Avion à réaction, vaisseau spatial", interval: 50 },
  custom: { label: "Intervalle libre", interval: null }
});

export const STATUS = Object.freeze({
  in: "Dans la poursuite",
  support: "Soutien et Épreuve seulement",
  out: "Hors poursuite"
});

export const OFF_TRACK_REASONS = Object.freeze({
  before: "avant la première carte de la piste",
  after: "au-delà de la dernière carte de la piste",
  far: "trop loin de la piste",
  "no-token": "sans jeton sur la scène",
  "no-track": "aucune piste sur la scène"
});

/** Taille par défaut d'une carte CCM (constatée : 200 × 300 px). */
export const DEFAULT_CARD_SIZE = Object.freeze({ w: 200, h: 300 });

export const DEFAULT_CHASE = Object.freeze({
  active: false, type: "ground", interval: 5, cityStreets: false, rooftops: false, oneManeuver: false
});
