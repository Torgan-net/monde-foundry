/**
 * Manœuvres et actions de poursuite (SWADE VF). Règles pures : décrivent ce qui est permis,
 * les modificateurs et les cartes gagnées ou perdues ; n'exécutent rien.
 */
import { VEHICLE_MODES } from "./complication.js";

/** Manœuvres du chapitre Manœuvres (Lever le pied : variante de Changer de position). */
export const MANEUVER_IDS = new Set(["changePosition", "liftFoot", "flee", "push", "ram", "board", "evade", "steady"]);

export const GROUPS = Object.freeze([
  { id: "move", label: "Se déplacer sur la piste" },
  { id: "harass", label: "Gêner un adversaire" },
  { id: "defend", label: "Se protéger, viser" },
  { id: "usual", label: "Actions habituelles" }
]);

/** Fuir : au moins 4 cartes des opposants les plus proches. −4, −2 à 5 cartes, 0 à 6 et plus. */
export function fleeModifier(gap) {
  if (gap == null || gap < 4) return null;
  if (gap === 4) return -4;
  if (gap === 5) return -2;
  return 0;
}

/** Bonus de vitesse à Changer de position : +1 si plus rapide que le plus rapide des assaillants, +2 si au moins deux fois. */
export function speedBonus(mine, fastestOpponent) {
  if (!(fastestOpponent > 0) || !(mine > fastestOpponent)) return 0;
  return mine >= 2 * fastestOpponent ? 2 : 1;
}

/** Cartes de poursuite parcourues avec Changer de position. */
export function changePositionCards(outcome) {
  if (outcome === "raise") return 2;
  if (outcome === "success") return 1;
  return 0;
}

/** Portée = nombre de cartes entre les unités (sans compter celle de l'attaquant) × Intervalle. */
export function rangeOf(gap, interval) {
  return gap * interval;
}

const usedThisRound = (marks, key, round) => marks?.[key] != null && marks[key] === round;

const mod = (label, value) => ({ label, value });

/**
 * Liste des actions d'une unité.
 * @param {object} ctx
 * @param {"in"|"support"|"out"} ctx.status
 * @param {string} ctx.mode foot | mounted | vehicle | boat | air
 * @param {boolean} ctx.npcCrew équipage PNJ d'un véhicule conséquent
 * @param {number} ctx.round round courant
 * @param {{changedPosition?:number, liftedFoot?:number, evaded?:number}} ctx.marks round de la dernière utilisation
 * @param {{id:string, name:string, gap:number|null}[]} ctx.opponents adversaires dans la poursuite (gap null = position inconnue)
 * @param {number} ctx.interval Intervalle de la poursuite
 * @param {number} [ctx.speedBonus] 0, 1 ou 2
 * @param {boolean} [ctx.onHold] déjà En attente
 * @param {string|null} [ctx.boardedBy] nom de l'abordeur si le vaisseau est abordé
 */
export function buildActions(ctx) {
  const { status, mode, npcCrew = false, round, marks = {}, opponents = [], interval = 5 } = ctx;
  const bonus = ctx.speedBonus ?? 0;
  if (status === "out") return [];

  const known = opponents.filter((o) => o.gap != null);
  const unknownPos = opponents.length > 0 && known.length === 0;
  const nearest = known.length ? Math.min(...known.map((o) => o.gap)) : null;
  const sameCard = known.filter((o) => o.gap === 0);
  const noPos = "Position inconnue : vérifiez que les jetons sont bien placés le long de la piste.";
  const noSameCard = unknownPos ? noPos : "Il faut un adversaire sur la même carte de poursuite.";
  const isShip = VEHICLE_MODES.includes(mode) && mode !== "vehicle";

  const actions = [];

  // ---------- Se déplacer ----------
  const cpDone = usedThisRound(marks, "changedPosition", round);
  const lifted = usedThisRound(marks, "liftedFoot", round);
  const speedMods = bonus ? [mod("Bonus de vitesse", bonus)] : [];
  actions.push({
    id: "changePosition", group: "move", label: "Changer de position",
    timing: "Action gratuite ou action",
    available: !cpDone && !lifted,
    reason: cpDone ? "Déjà utilisé ce tour (une fois par tour)." : (lifted ? "Impossible après avoir levé le pied ce tour." : ""),
    summary: "Succès : 1 carte en avant ou en arrière. Prouesse : 2 cartes.",
    help: "Jet de Manœuvre pour avancer ou reculer le long de la piste. En action gratuite, le jet est normal ; si vous y consacrez une action, il est à +2. Bonus de vitesse : +1 si vous êtes plus rapide que le plus rapide de vos assaillants, +2 si vous l'êtes au moins deux fois. Une fois par tour, et pas après avoir levé le pied. Après le jet, le module propose le déplacement et bouge le jeton.",
    rolls: [
      { key: "free", label: "Gratuite", cost: "free", mods: [...speedMods] },
      { key: "action", label: "Action (+2)", cost: "action", mods: [mod("Action dédiée", 2), ...speedMods] }
    ],
    applies: []
  });

  actions.push({
    id: "liftFoot", group: "move", label: "Lever le pied",
    timing: "Action (sans jet)",
    available: !cpDone && !lifted,
    reason: cpDone ? "Vous avez déjà changé de position ce tour." : (lifted ? "Déjà fait ce tour." : ""),
    summary: "Reculez de 1 ou 2 cartes, sans jet (compte comme une action).",
    help: "Lors d'une poursuite linéaire, vous pouvez vous laisser distancer d'une ou deux cartes sans jet de Manœuvre. Vous ne pourrez plus Changer de position ce tour, ni en action ni en action gratuite. Cela compte comme une action, même sans jet. Le module recule le jeton.",
    rolls: [],
    applies: [{ key: "liftFoot", label: "Lever le pied", cost: "action" }]
  });

  const fm = fleeModifier(nearest);
  actions.push({
    id: "flee", group: "move", label: "Fuir",
    timing: "Action",
    available: fm != null,
    reason: fm != null ? "" : (unknownPos ? noPos
      : (nearest == null ? "Aucun adversaire dans la poursuite." : `Il faut au moins 4 cartes d'écart avec l'adversaire le plus proche (actuellement ${nearest}).`)),
    summary: "Succès : vous vous échappez.",
    help: "Possible si vous êtes à au moins quatre cartes de vos opposants les plus proches. Jet de Manœuvre à −4 ; le malus passe à −2 avec cinq cartes d'écart et disparaît à six cartes ou plus. En cas de Succès, vous quittez la poursuite. Action exclusive : elle se joue seule, sans autre action ni action gratuite.",
    rolls: fm != null ? [{ key: "roll", label: "Jet", cost: "action", mods: fm ? [mod(`Fuir (${nearest} cartes)`, fm)] : [] }] : [],
    exclusive: true,
    applies: []
  });

  // ---------- Gêner un adversaire ----------
  const contactNames = sameCard.map((o) => o.name).join(", ");
  actions.push({
    id: "push", group: "harass", label: "Repousser",
    timing: "Action",
    available: sameCard.length > 0, reason: sameCard.length ? "" : noSameCard,
    summary: "Jet opposé. Victoire : l'adversaire est Bousculé. Prouesse : il subit un Échec critique de Manœuvre.",
    help: "Repoussez un rival loin de vous ou dans un obstacle. Vous devez être sur la même carte et faire un jet opposé de Manœuvre. Si vous l'emportez, vous le Bousculez (vous le déplacez d'une carte dans la direction de votre choix). Avec une Prouesse, il subit en plus un Échec critique de Manœuvre. Le MJ peut autoriser une autre compétence, comme Tir pour placer un obstacle. Sur un Échec critique, la manœuvre se retourne contre vous.",
    rolls: sameCard.length ? [{ key: "roll", label: "Jet opposé", cost: "action", mods: [], opposed: true }] : [],
    applies: [], targetsText: contactNames
  });

  actions.push({
    id: "ram", group: "harass", label: "Éperonner",
    timing: "Action",
    available: sameCard.length > 0, reason: sameCard.length ? "" : noSameCard,
    summary: "Jet opposé. Succès : chacun inflige des dégâts à l'autre.",
    help: "Percutez un adversaire sur la même carte avec un jet opposé de Manœuvre. En cas de Succès, les deux participants s'infligent des dégâts : selon l'Échelle de celui qui les provoque (Petit d6, Normal 2d6, Grand 3d6, Énorme 4d6, Gigantesque 5d6), +d6 pour l'attaquant sur une Prouesse, +d6 si sa Résistance est plus élevée (+2d6 si au moins deux fois plus), +d6 pour chaque camp si la Vitesse max est entre 90 et 180 km/h (+2d6 au-delà).",
    rolls: sameCard.length ? [{ key: "roll", label: "Jet opposé", cost: "action", mods: [], opposed: true }] : [],
    applies: [], targetsText: contactNames
  });

  if (isShip) {
    actions.push({
      id: "board", group: "harass", label: "Aborder",
      timing: "Action",
      available: sameCard.length > 0, reason: sameCard.length ? "" : noSameCard,
      summary: "Jet opposé. Victoire : les deux vaisseaux sont bord à bord.",
      help: "Grappins et planches, tubes perforants ou capsules d'assaut. Sur la même carte, jet opposé de Manœuvre : si vous l'emportez, les vaisseaux sont bord à bord et votre équipage peut passer à l'abordage. Les défenseurs désignés pour repousser l'abordage commencent En attente, sauf si vous obtenez une Prouesse. Le commandant du vaisseau arraisonné ne peut que tenter de Changer de position (−4 avec grappins, rayons tracteurs…) : Succès, il n'est plus retenu ; Prouesse, il se libère et se déplace d'une carte.",
      rolls: sameCard.length ? [{ key: "roll", label: "Jet opposé", cost: "action", mods: [], opposed: true }] : [],
      applies: [], targetsText: contactNames
    });
  }

  // ---------- Se protéger, viser ----------
  const evaded = usedThisRound(marks, "evaded", round);
  actions.push({
    id: "evade", group: "defend", label: "Se dérober",
    timing: "Action gratuite ou action",
    available: !evaded, reason: evaded ? "Déjà utilisé ce round (non cumulable)." : "",
    summary: "Attaques contre vous à −2 (−4 en y consacrant une action) jusqu'à votre prochain tour.",
    help: "Vous zigzaguez, allez de couvert en couvert. Les attaques de mêlée ou à distance contre vous, votre véhicule et ses passagers subissent −2 jusqu'à votre prochain tour. Vous et les autres occupants subissez aussi ce malus à vos attaques. En y consacrant une action, le malus passe à −4 pour les deux camps. Une fois par round, non cumulable.",
    rolls: [],
    applies: [{ key: "evadeFree", label: "Gratuite (−2)", cost: "free" }, { key: "evadeAction", label: "Action (−4)", cost: "action" }]
  });

  actions.push({
    id: "steady", group: "defend", label: "Stabiliser",
    timing: "Action gratuite",
    available: true, reason: "",
    summary: "Ignorez Plateforme instable et Course ; les attaques contre vous sont à +2.",
    help: "Vous stabilisez pour mieux tirer : le véhicule et ses occupants ignorent les malus de Plateforme instable et de Course, mais les attaques contre eux se font à +2 jusqu'au début de leur prochain tour (non cumulable avec Vulnérable).",
    rolls: [],
    applies: [{ key: "steady", label: "Stabiliser", cost: "free" }]
  });

  actions.push({
    id: "hold", group: "defend", label: "Retenir son action",
    timing: "En attente",
    available: !ctx.onHold,
    reason: ctx.onHold ? "Déjà En attente : vous pouvez interrompre un adversaire à tout moment (jet opposé)." : "",
    beforeAnyAction: true,
    summary: "Début de round seulement : passez En attente pour interrompre un adversaire (jet opposé).",
    help: "À déclarer en début de round, avant toute autre action (même gratuite) : passez En attente dans le suivi de combat. Un personnage En attente peut tenter d'interrompre les actions adverses. À pied, jet opposé d'Athlétisme ; monté, d'Équitation ; en véhicule, le MJ choisit les compétences (par exemple Athlétisme contre Conduite). Contre une unité de plusieurs personnages, le jet est opposé au conducteur ou au meneur. Le bouton « Passer En attente » met le combattant En attente dans le suivi de combat.",
    rolls: [], applies: [{ key: "hold", label: "Passer En attente", cost: "none" }]
  });

  // ---------- Actions habituelles ----------
  const targets = known.map((o) => ({ ...o, range: rangeOf(o.gap, interval), contact: o.gap === 0 }))
    .sort((a, b) => a.gap - b.gap);
  actions.push({
    id: "attack", group: "usual", label: "Attaquer",
    timing: "Action",
    available: opponents.length > 0,
    reason: opponents.length ? "" : "Aucun adversaire dans la poursuite.",
    summary: "Au contact : même carte seulement. À distance : Portée = écart × Intervalle.",
    help: `Attaque au contact seulement sur la même carte de poursuite. À distance, la Portée est le nombre de cartes entre vous et la cible (sans compter la vôtre) multiplié par l'Intervalle (${interval}). Une attaque peut viser l'équipage s'il est visible (pensez au Couvert). Lancez l'attaque depuis la fiche ; « Déclarer » compte l'action dans votre tour (pensez au malus d'actions multiples dans la fenêtre de jet).`,
    rolls: [], applies: [{ key: "declare", label: "Déclarer", cost: "action" }], targets
  });

  actions.push({
    id: "test", group: "usual", label: "Épreuve",
    timing: "Action",
    available: !npcCrew, reason: npcCrew ? "Les équipages PNJ accomplissent déjà leurs tâches : pas d'Épreuve." : "",
    summary: "Rendre un ennemi Vulnérable ou Distrait.",
    help: "Comme en combat : par exemple, éprouver un ennemi pour le rendre Vulnérable avant qu'un allié ne tire. Le MJ décide si vous êtes assez près (une Provocation doit être vue ou entendue).",
    rolls: [], applies: [{ key: "declare", label: "Déclarer", cost: "action" }]
  });

  actions.push({
    id: "support", group: "usual", label: "Soutien",
    timing: "Action",
    available: !npcCrew, reason: npcCrew ? "Les équipages PNJ accomplissent déjà leurs tâches : pas de Soutien." : "",
    summary: "Aider un allié avant son jet important.",
    help: "Comme en combat. Il est important que les passagers puissent soutenir leur conducteur avant un jet important (Changer de position, Fuir…).",
    rolls: [], applies: [{ key: "declare", label: "Déclarer", cost: "action" }]
  });

  actions.push({
    id: "power", group: "usual", label: "Activer un pouvoir",
    timing: "Action",
    available: true, reason: "",
    summary: "Comme d'habitude ; le MJ juge de la distance.",
    help: "Les pouvoirs s'utilisent normalement. La Portée se calcule comme pour une attaque à distance.",
    rolls: [], applies: [{ key: "declare", label: "Déclarer", cost: "action" }]
  });

  if (ctx.boardedBy) {
    const why = `Vaisseau abordé par ${ctx.boardedBy} : le commandant ne peut que tenter de Changer de position.`;
    for (const a of actions) {
      if (a.id === "changePosition") {
        for (const r of a.rolls) r.mods.push(mod("Abordé (grappins, rayon tracteur…)", -4));
        a.summary = "Abordé : Succès, il n'est plus retenu ; Prouesse, il se libère et se déplace d'une carte.";
      } else if (a.id === "liftFoot" || a.id === "flee") {
        a.available = false; a.reason = why; a.rolls = []; a.applies = [];
      }
    }
  }

  for (const a of actions) if (MANEUVER_IDS.has(a.id)) a.maneuver = true;

  if (status === "support") {
    for (const a of actions) {
      if (a.id !== "support" && a.id !== "test") {
        a.available = false;
        a.reason = "Unité hors de la piste : seuls le Soutien et l'Épreuve restent possibles.";
        a.rolls = []; a.applies = [];
      }
    }
  }
  return actions;
}
