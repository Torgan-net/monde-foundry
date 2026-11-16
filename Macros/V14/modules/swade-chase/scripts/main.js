/**
 * swade-chase — aide aux poursuites SWADE (VF) pour Foundry v14.
 */
import { MODULE_ID, VERSION } from "./constants.js";
import { initSocket } from "./services/socket.js";
import { registerHandlers, startChase, endChase } from "./services/handlers.js";
import { checkComplications, checkOffTrack, promptComplicationAtTurn } from "./services/watchers.js";
import { bindComplicationCard } from "./services/complication-card.js";
import { bindOpposedCard } from "./services/opposed-card.js";
import { computeChaseView, actionsFor } from "./services/chase.js";
import { readSceneTrack } from "./services/track-reader.js";
import { isChaseActive } from "./services/state.js";
import { debounceKeyed } from "./services/util.js";
import { ChasePanel } from "./apps/chase-panel.js";
import { registerDamageWatch } from "./services/damage-watch.js";
import * as cards from "./rules/cards.js";
import * as complication from "./rules/complication.js";
import * as maneuvers from "./rules/maneuvers.js";
import * as track from "./rules/track.js";

const later = debounceKeyed((fn) => fn(), 300);
const refreshPanel = () => later("panel", () => ChasePanel.refresh());

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "launcher", {
    name: "Lanceur des jets",
    hint: "Automatique : SWADE Tools s'il est actif, sinon le jet natif SWADE.",
    scope: "world", config: true, type: String, default: "auto",
    choices: { auto: "Automatique", native: "Jet natif SWADE", "swade-tools": "SWADE Tools" }
  });
  game.settings.register(MODULE_ID, "autoOpen", {
    name: "Ouvrir le panneau au démarrage d'une poursuite",
    scope: "client", config: true, type: Boolean, default: true
  });
  foundry.applications.handlebars.loadTemplates({
    configForm: `modules/${MODULE_ID}/templates/config-form.hbs`
  });
});

Hooks.once("ready", () => {
  initSocket();
  registerHandlers({ openPanel: () => ChasePanel.open() });
  registerDamageWatch();

  const api = {
    version: 1,
    moduleVersion: VERSION,
    open: () => ChasePanel.open(),
    start: (combat = game.combat) => combat && startChase(combat),
    end: (combat = game.combat) => combat && endChase(combat),
    readTrack: (scene) => readSceneTrack(scene),
    view: (combat = game.combat) => computeChaseView(combat),
    actions: (combatantId, combat = game.combat) => {
      const v = computeChaseView(combat);
      return v ? actionsFor(v, combatantId) : [];
    },
    rules: { cards, complication, maneuvers, track }
  };
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll(`${MODULE_ID}.ready`, api);

  // Poursuite déjà active au chargement : ouvrir le panneau.
  if (isChaseActive(game.combat) && game.settings.get(MODULE_ID, "autoOpen")) ChasePanel.open();
});

// ---------- Automatismes du MJ actif ----------

Hooks.on("updateCombatant", (combatant, changes) => {
  const sys = changes?.system;
  if (sys && ("cardValue" in sys || "suitValue" in sys || "hasJoker" in sys)) {
    const combat = combatant.parent;
    // Délai : laisse le système finir la distribution (Tête froide, etc.) avant de lire la carte.
    later(`complication-${combat.id}`, () => checkComplications(combat));
  }
  refreshPanel();
});

Hooks.on("updateToken", (tokenDoc, changes) => {
  if ("x" in changes || "y" in changes) {
    const combat = game.combats.find((c) => c.active && c.combatants.some((cb) => cb.tokenId === tokenDoc.id));
    if (combat && isChaseActive(combat)) later(`offtrack-${combat.id}`, () => checkOffTrack(combat));
  }
  refreshPanel();
});

Hooks.on("updateCombat", (combat, changes) => {
  if ("turn" in changes || "round" in changes) {
    later(`turn-${combat.id}`, () => promptComplicationAtTurn(combat));
  }
});

for (const hook of ["updateCombat", "createCombatant", "deleteCombatant", "deleteCombat", "createCombat",
  "updateCard", "createCard", "deleteCard", "canvasReady", "combatTurnChange"]) {
  Hooks.on(hook, refreshPanel);
}

// ---------- Chat ----------

Hooks.on("renderChatMessageHTML", (message, html) => {
  bindComplicationCard(message, html);
  bindOpposedCard(message, html);
});

// ---------- Bouton dans le suivi de combat ----------

Hooks.on("renderCombatTracker", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".sc-tracker-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sc-tracker-btn";
  btn.innerHTML = `<i class="fa-solid fa-person-running"></i> Poursuite`;
  btn.dataset.tooltip = "Panneau de poursuite";
  btn.addEventListener("click", (ev) => { ev.preventDefault(); ChasePanel.open(); });
  const anchor = root.querySelector(".combat-tracker-header") ?? root.querySelector("header");
  if (anchor) anchor.append(btn); else root.prepend(btn);
});
