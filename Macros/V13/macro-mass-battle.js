/**
 * ============================================================================
 *  COMBATS DE MASSE — SWADE (Foundry VTT)
 *  Version : 2.6.0 — 2026-08-21
 * ============================================================================
 *  Historique résumé (voir les échanges précédents pour le détail complet) :
 *    1.x — Premières versions : état partagé, socketlib, UI MJ/joueur.
 *    2.0.0 — Système de participants par round ("Action de combat"),
 *            échec critique, réinitialisation du combat.
 *    2.1.0 — IHM en 3 écrans (Configuration / Round / Moral).
 *    2.2.0 — Jokers uniquement, boîte de dialogue standard "nue", jets
 *            délégués au joueur propriétaire, Blessures/Fatigue revues,
 *            récap de round dans le chat, hot-reload.
 *    2.3.0 — Compétences en anglais (liste dynamique par acteur +
 *            Unskilled attempt d4-2), modificateurs repositionnés dans la
 *            boîte de dialogue standard, un commandant ne peut plus être
 *            choisi dans les deux camps.
 *    2.3.1 — Correctif : "Démarrer le combat" écrasait les commandants
 *            déjà choisis dans l'écran Configuration.
 *    2.3.2 — Un commandant peut être un Figurant/Extra (seuls les
 *            participants à l'Action de combat restent limités aux
 *            Jokers) ; pas de doublon "Unskilled attempt" si la fiche en a
 *            déjà un.
 *    2.4.0 — Correctif IMPORTANT : socketlib refuse toute réinscription
 *            d'une fonction déjà enregistrée ("Ignoring registration
 *            request"), ce qui empêchait silencieusement le hot-reload de
 *            s'appliquer aux jets délégués et aux patchs (ils restaient
 *            bloqués sur le tout premier code chargé dans la session,
 *            même après avoir recollé une version plus récente). Corrigé :
 *            les fonctions enregistrées auprès de socketlib sont
 *            maintenant de simples relais stables qui délèguent à
 *            `window.__mcHandlers`, réécrit intégralement à chaque
 *            exécution — le hot-reload fonctionne désormais aussi pour
 *            cette partie-là.
 *    2.5.0 — Relance avec un Jeton (Benny), implémentée nous-mêmes plutôt
 *            que de dépendre d'un bouton natif du système (qui, après
 *            recherche, semble en réalité ajouté par des modules tiers
 *            comme swade-tools et non présent dans le SWADE de base) :
 *            bouton "🔄 Relancer (Jeton — n dispo.)" dans chaque panneau de
 *            confirmation (Action de combat, Stratégie, Moral), visible
 *            uniquement si des Jetons sont disponibles sur la fiche.
 *            Dépense 1 Jeton, relance le jet en entier (nouvelle boîte de
 *            dialogue standard, déléguée au joueur propriétaire si besoin),
 *            et garde le meilleur des deux totaux, conformément à la règle.
 *    2.6.0 — Deux corrections :
 *              - Le jet de Stratégie ne dépend plus d'un nom de compétence
 *                figé ("Battle") : chaque camp a maintenant un sélecteur
 *                affichant les VRAIES compétences du commandant choisi
 *                (par défaut "Battle" si présent), garantissant que la
 *                boîte de dialogue standard SWADE s'ouvre toujours au lieu
 *                de retomber silencieusement sur un jet manuel.
 *              - Ajout d'un petit effet visuel maison lors de la dépense
 *                d'un Jeton (l'animation de swade-tools reste spécifique à
 *                ce module tiers et n'a pas pu être reproduite ici).
 *
 *  NOTE sur les avertissements de la console : les messages "The V1
 *  Application framework is deprecated" et "You are accessing the global
 *  'Actors'..." sont des avertissements de dépréciation émis par Foundry
 *  et par le rendu natif des cartes de chat du système SWADE lui-même —
 *  pas des bugs de cette macro. Ils n'empêchent rien de fonctionner sur
 *  les versions actuelles de Foundry (la prise en charge ne sera retirée
 *  qu'en versions 15/16). Voir la conversation pour plus de détails.
 * ============================================================================
 *  Macro tout-en-un pour gérer la mécanique de "Combats de masse" (Savage
 *  Worlds Adventure Edition) avec une interface partagée MJ / joueurs.
 *
 *  PRÉREQUIS :
 *    - Système "swade" actif.
 *    - Module "socketlib" installé et activé.
 *
 *  INSTALLATION :
 *    1. Crée une macro de type "Script", colle tout ce fichier dedans.
 *    2. Clic droit sur la macro > Configurer la propriété > mets
 *       "Défaut" sur "Observateur" pour que les joueurs puissent
 *       l'exécuter, ou glisse-la dans leur barre des raccourcis.
 *    3. Le MJ l'exécute en premier pour la configuration initiale.
 *    4. Chaque joueur l'exécute ensuite.
 *    5. Pour mettre à jour le code en cours de partie : recolle la
 *       nouvelle version dans la MÊME macro et ré-exécute-la (pas besoin
 *       de F5, la fenêtre se recharge avec le nouveau code).
 * ============================================================================
 */

(async () => {

  // ==========================================================================
  // 0. CONFIGURATION — à adapter si besoin
  // ==========================================================================
  const MC_CONFIG = {
    VERSION: "2.6.0",
    NAMESPACE: "mass-combat-macro",
    // Noms de compétences en ANGLAIS (ceux du système SWADE de base) : ce
    // sont eux qui doivent correspondre aux Items de compétence sur les
    // fiches pour être trouvés. "Stratégie" dans le livre français = la
    // compétence "Battle" sur la fiche.
    SKILL_STRATEGIE: "Battle",
    // Clé d'attribut SWADE pour Âme/Esprit (utilisé pour le Moral). C'est un
    // ATTRIBUT natif du système (agility/smarts/spirit/strength/vigor), pas
    // une compétence — d'où actor.rollAttribute() plutôt que rollSkill().
    ATTRIBUTE_AME: "spirit",
    TARGET_NUMBER: 4,
  };

  // ==========================================================================
  // 1. PRÉ-VÉRIFICATIONS
  // ==========================================================================
  if (game.system.id !== "swade") {
    ui.notifications.warn("Ce script est prévu pour le système SWADE. Il peut fonctionner ailleurs mais les jets de compétence ne seront pas fiables.");
  }
  if (typeof socketlib === "undefined") {
    ui.notifications.error("Le module 'socketlib' est requis et ne semble pas actif. Active-le puis relance la macro.");
    return;
  }

  // ==========================================================================
  // 2. ÉTAT PARTAGÉ (game.settings, portée "world")
  // ==========================================================================
  const SETTING_KEY = "state";

  function defaultState() {
    return {
      initialized: false,
      round: 0,
      revealEnemyToPlayers: false,
      config: {
        // Si vrai : en cas d'Échec ou d'Échec critique en Action de combat,
        // un Joker (PJ ou PNJ important) ne subit que de la Fatigue,
        // jamais de Blessure. C'est une variante adoucie, désactivée par
        // défaut (la règle de base inflige bien des Blessures).
        onlyFatigueForJokers: false,
      },
      camps: [
        { id: "A", name: "Camp A", color: "#7a1f1f", forceMarkers: 10, startMarkers: 10,
          modifiers: [], actionMods: [], moraleMods: [], commandantId: null,
          fortified: false, fearless: false, pinned: false, routed: false },
        { id: "B", name: "Camp B", color: "#1f3a5f", forceMarkers: 10, startMarkers: 10,
          modifiers: [], actionMods: [], moraleMods: [], commandantId: null,
          fortified: false, fearless: false, pinned: false, routed: false },
      ],
      // Marqueurs de forces au début du round en cours, pour calculer le
      // récapitulatif ("marqueurs perdus ce round").
      roundStartMarkers: {},
      // Participants à l'Action de combat POUR CE ROUND. Vidé après chaque
      // jet de Stratégie appliqué (ou manuellement par le MJ).
      // { id, actorId, actorName, campId, status: "pending"|"done", summary }
      roundActions: [],
      // IDs de camps devant faire un jet de Moral (perte de marqueurs de
      // forces ce round). Vidé au fur et à mesure de leur résolution.
      moraleQueue: [],
      // userId -> { campId, ammo, pp }
      playerResources: {},
      log: [], // { round, text }
    };
  }

  if (!game.settings.settings.has(`${MC_CONFIG.NAMESPACE}.${SETTING_KEY}`)) {
    game.settings.register(MC_CONFIG.NAMESPACE, SETTING_KEY, {
      scope: "world",
      config: false,
      type: Object,
      default: defaultState(),
    });
  }

  function getState() {
    return foundry.utils.duplicate(game.settings.get(MC_CONFIG.NAMESPACE, SETTING_KEY));
  }

  async function setState(newState) {
    // Cette fonction ne doit s'exécuter que côté MJ (voir socket handlers).
    await game.settings.set(MC_CONFIG.NAMESPACE, SETTING_KEY, newState);
  }

  function addLog(state, text) {
    state.log.unshift({ round: state.round, text });
    if (state.log.length > 80) state.log.length = 80;
    return state;
  }

  function snapshotRoundStartMarkers(state) {
    state.roundStartMarkers = { [state.camps[0].id]: state.camps[0].forceMarkers, [state.camps[1].id]: state.camps[1].forceMarkers };
    return state;
  }

  // ==========================================================================
  // 3. SOCKETLIB — enregistrement.
  //
  //  IMPORTANT : socketlib refuse toute NOUVELLE tentative d'enregistrement
  //  pour un nom de fonction déjà pris ("Function 'x' is already registered
  //  ... Ignoring registration request.") — donc on ne peut enregistrer nos
  //  handlers qu'UNE SEULE FOIS pour de bon (au tout premier lancement de
  //  la macro dans la session). Pour que les mises à jour du script soient
  //  quand même prises en compte (hot-reload), les fonctions enregistrées
  //  sont de simples relais STABLES qui délèguent à `window.__mcHandlers`,
  //  un objet qu'on écrase intégralement à CHAQUE exécution de la macro
  //  avec les implémentations les plus récentes.
  // ==========================================================================
  if (!window.__mcSocket) {
    try {
      window.__mcSocket = socketlib.registerSystem(game.system.id);
    } catch (err) {
      console.warn("Combats de masse | registerSystem a levé une erreur (probablement déjà enregistré) :", err);
    }
  }
  const mcSocket = window.__mcSocket;
  if (!mcSocket) {
    ui.notifications.error("Impossible d'initialiser socketlib. Recharge la page (F5) puis réessaie.");
    return;
  }

  if (!window.__mcSocketHandlersRegistered) {
    mcSocket.register("mc_applyPatch", async (patchFn, args) => {
      return await window.__mcHandlers.applyPatch(patchFn, args);
    });
    mcSocket.register("mc_requestRoll", async (payload) => {
      return await window.__mcHandlers.requestRoll(payload);
    });
    mcSocket.register("mc_spendBennyAndReroll", async (payload) => {
      return await window.__mcHandlers.spendBennyAndReroll(payload);
    });
    window.__mcSocketHandlersRegistered = true;
  }

  // Toujours réécrit à chaque exécution : c'est CETTE partie qui porte le
  // code réellement à jour, même si l'enregistrement socketlib ci-dessus
  // n'a pu se faire qu'une fois.
  window.__mcHandlers = {
    async applyPatch(patchFn, args) {
      // Exécuté uniquement sur un client MJ.
      const state = getState();
      const fn = MC_PATCHERS[patchFn];
      if (!fn) return { ok: false, error: `Patch inconnu: ${patchFn}` };
      try {
        const result = await fn(state, ...args);
        await setState(state);
        return { ok: true, result };
      } catch (err) {
        console.error("Combats de masse | erreur patch", err);
        return { ok: false, error: err.message };
      }
    },
    async requestRoll(payload) {
      // Exécuté sur le client du JOUEUR ciblé : ouvre SA boîte de dialogue
      // standard SWADE, sur SON écran.
      const { actorId, skillName, attributeKey, mods, kind, flavor } = payload;
      const actor = game.actors.get(actorId);
      if (kind === "attribute") return await rollAttributeTotal(actor, attributeKey, mods || [], flavor);
      return await rollSkillTotal(actor, skillName, mods || [], flavor);
    },
    async spendBennyAndReroll(payload) {
      // Exécuté sur le client du JOUEUR ciblé : dépense SON Jeton et relance
      // SA boîte de dialogue standard, sur SON écran.
      const { actorId, currentTotal, skillName, attributeKey, mods, kind, flavor } = payload;
      const actor = game.actors.get(actorId);
      if (!actor) return currentTotal;
      return await spendBennyAndReroll(actor, currentTotal, async () => {
        if (kind === "attribute") return await rollAttributeTotal(actor, attributeKey, mods || [], flavor);
        return await rollSkillTotal(actor, skillName, mods || [], flavor);
      });
    },
  };

  // Fonctions de mutation d'état, exécutées côté MJ uniquement, appelées
  // soit localement (si l'utilisateur courant est MJ), soit via socket.
  const MC_PATCHERS = {
    setupCamps(state, campA, campB) {
      // On préserve commandantId : il a déjà pu être choisi dans l'écran
      // Configuration avant de cliquer sur "Démarrer le combat" (le
      // sélecteur de commandant s'applique immédiatement, indépendamment
      // de ce bouton). Ne PAS le réinitialiser ici.
      state.camps[0] = { ...state.camps[0], ...campA, startMarkers: campA.forceMarkers };
      state.camps[1] = { ...state.camps[1], ...campB, startMarkers: campB.forceMarkers };
      state.initialized = true;
      state.round = 0;
      state.log = [];
      state.roundActions = [];
      state.moraleQueue = [];
      snapshotRoundStartMarkers(state);
      addLog(state, `Mise en place : ${state.camps[0].name} (${state.camps[0].forceMarkers} marqueurs) contre ${state.camps[1].name} (${state.camps[1].forceMarkers} marqueurs).`);
      return state;
    },

    /** Ajuste nom/couleur/marqueurs SANS toucher au round en cours, au
     *  journal, ni aux participants — pour un renfort ou une correction en
     *  cours de combat (contrairement à setupCamps qui repart de zéro). */
    reconfigureCamps(state, campA, campB) {
      [[0, campA], [1, campB]].forEach(([idx, patch]) => {
        const camp = state.camps[idx];
        const delta = Number(patch.forceMarkers) - camp.forceMarkers;
        camp.name = patch.name;
        camp.color = patch.color;
        camp.forceMarkers = Number(patch.forceMarkers);
        camp.startMarkers += delta; // préserve le calcul des pertes cumulées
      });
      addLog(state, `Configuration ajustée : ${state.camps[0].name} (${state.camps[0].forceMarkers} marqueurs) / ${state.camps[1].name} (${state.camps[1].forceMarkers} marqueurs).`);
      return state;
    },

    /** Réinitialise TOUT l'état à zéro (fin de combat). */
    resetAll(state) {
      const fresh = defaultState();
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, fresh);
      return state;
    },

    addModifier(state, campId, label, value) {
      const camp = state.camps.find(c => c.id === campId);
      camp.modifiers.push({ id: foundry.utils.randomID(), label, value: Number(value) });
      addLog(state, `${camp.name} reçoit un modificateur "${label}" (${value >= 0 ? "+" : ""}${value}).`);
      return state;
    },

    removeModifier(state, campId, modId) {
      const camp = state.camps.find(c => c.id === campId);
      camp.modifiers = camp.modifiers.filter(m => m.id !== modId);
      return state;
    },

    setFlag(state, campId, flag, value) {
      const camp = state.camps.find(c => c.id === campId);
      camp[flag] = value;
      return state;
    },

    setCommandant(state, campId, actorId) {
      const camp = state.camps.find(c => c.id === campId);
      if (actorId) {
        const otherCamp = state.camps.find(c => c.id !== campId);
        if (otherCamp?.commandantId === actorId) {
          // Déjà commandant de l'autre camp — refusé (l'UI filtre déjà
          // normalement ce choix, ceci est une sécurité supplémentaire).
          return state;
        }
      }
      camp.commandantId = actorId || null;
      return state;
    },

    setConfig(state, key, value) {
      state.config ??= {};
      state.config[key] = value;
      return state;
    },

    setResource(state, userId, patch) {
      state.playerResources[userId] = { ammo: 0, pp: 0, campId: state.camps[0].id, ...state.playerResources[userId], ...patch };
      return state;
    },

    adjustResource(state, userId, key, delta) {
      const res = state.playerResources[userId] ??= { ammo: 0, pp: 0, campId: state.camps[0].id };
      res[key] = Math.max(0, (res[key] ?? 0) + delta);
      return state;
    },

    setRevealEnemy(state, value) {
      state.revealEnemyToPlayers = value;
      return state;
    },

    logMessage(state, text) {
      addLog(state, text);
      return state;
    },

    // ---- Participants à l'Action de combat (par round) ----

    addParticipant(state, actorId, actorName, campId) {
      state.roundActions ??= [];
      state.roundActions.push({ id: foundry.utils.randomID(), actorId, actorName, campId, status: "pending", summary: null });
      const camp = state.camps.find(c => c.id === campId);
      addLog(state, `${actorName} rejoint l'Action de combat pour ${camp?.name ?? "?"} ce round.`);
      return state;
    },

    removeParticipant(state, participantId) {
      state.roundActions = (state.roundActions || []).filter(p => p.id !== participantId);
      return state;
    },

    clearParticipants(state) {
      state.roundActions = [];
      return state;
    },

    markParticipantDone(state, participantId, summary) {
      const p = (state.roundActions || []).find(x => x.id === participantId);
      if (p) { p.status = "done"; p.summary = summary; }
      return state;
    },

    /** Bonus/malus ponctuel (consommé au prochain jet de Stratégie de ce
     *  camp, puis effacé — voir applyStrategieResult). */
    queueActionMod(state, campId, label, value) {
      const camp = state.camps.find(c => c.id === campId);
      camp.actionMods ??= [];
      camp.actionMods.push({ id: foundry.utils.randomID(), label, value: Number(value) });
      addLog(state, `${camp.name} reçoit un modificateur temporaire "${label}" (${value >= 0 ? "+" : ""}${value}) pour son prochain jet de Stratégie.`);
      return state;
    },

    /** Applique la conséquence d'un résultat de la table Effets des combats.
     *  `campId` = le camp du personnage qui a agi ; l'autre camp est déduit
     *  comme adversaire. */
    applyActionEffets(state, campId, effet) {
      const camp = state.camps.find(c => c.id === campId);
      const enemyCamp = state.camps.find(c => c.id !== campId);
      switch (effet.name) {
        case "Inspiration":
          camp.forceMarkers += 1;
          addLog(state, `${camp.name} regagne immédiatement 1 marqueur de forces (Inspiration).`);
          break;
        case "Terreur":
          enemyCamp.moraleMods ??= [];
          enemyCamp.moraleMods.push({ id: foundry.utils.randomID(), label: "Terreur (subi)", value: -2 });
          addLog(state, `${enemyCamp.name} subira -2 à son prochain jet de Moral (Terreur).`);
          break;
        case "Valeur":
          camp.actionMods ??= [];
          camp.actionMods.push({ id: foundry.utils.randomID(), label: "Soutien (Valeur)", value: 2 });
          addLog(state, `${camp.name} reçoit +2 pour son prochain jet de Stratégie (Valeur).`);
          break;
        case "Carnage":
          enemyCamp.actionMods ??= [];
          enemyCamp.actionMods.push({ id: foundry.utils.randomID(), label: "Carnage (subi)", value: -2 });
          addLog(state, `${enemyCamp.name} subira -2 à son prochain jet de Stratégie (Carnage).`);
          break;
        case "Une armée à lui seul":
          enemyCamp.forceMarkers = Math.max(0, enemyCamp.forceMarkers - 1);
          state.moraleQueue ??= [];
          if (!state.moraleQueue.includes(enemyCamp.id)) state.moraleQueue.push(enemyCamp.id);
          addLog(state, `${enemyCamp.name} perd immédiatement 1 marqueur de forces (Une armée à lui seul) ! Un jet de Moral est à faire pour ${enemyCamp.name} même s'il remporte le round.`);
          break;
      }
      return state;
    },

    // ---- Moral ----

    queueMoraleCheck(state, campId) {
      state.moraleQueue ??= [];
      if (!state.moraleQueue.includes(campId)) state.moraleQueue.push(campId);
      return state;
    },

    applyStrategieResult(state, resultPayload) {
      const { campATotal, campBTotal, campALabel, campBLabel } = resultPayload;
      state.round += 1;
      const diff = campATotal - campBTotal;
      const [campA, campB] = state.camps;
      state.moraleQueue ??= [];
      const queueMorale = (camp) => { if (!state.moraleQueue.includes(camp.id)) state.moraleQueue.push(camp.id); };
      let outcome;
      if (diff === 0) {
        campA.forceMarkers = Math.max(0, campA.forceMarkers - 1);
        campB.forceMarkers = Math.max(0, campB.forceMarkers - 1);
        queueMorale(campA); queueMorale(campB);
        outcome = "Égalité : chaque camp perd 1 marqueur de forces.";
      } else {
        const winner = diff > 0 ? campA : campB;
        const loser = diff > 0 ? campB : campA;
        const margin = Math.abs(diff);
        if (margin >= 4) {
          loser.forceMarkers = Math.max(0, loser.forceMarkers - 2);
          queueMorale(loser);
          outcome = `Prouesse de ${winner.name} : ${loser.name} perd 2 marqueurs de forces (${winner.name} n'en perd aucun).`;
        } else {
          winner.forceMarkers = Math.max(0, winner.forceMarkers - 1);
          loser.forceMarkers = Math.max(0, loser.forceMarkers - 2);
          queueMorale(winner); queueMorale(loser);
          outcome = `Victoire de ${winner.name} : ${loser.name} perd 2 marqueurs, ${winner.name} en perd 1.`;
        }
      }
      addLog(state, `Round ${state.round} — Stratégie : ${campALabel} (${campATotal}) vs ${campBLabel} (${campBTotal}). ${outcome}`);
      for (const camp of state.camps) {
        if (camp.forceMarkers <= 0 && !camp.routed) {
          camp.routed = true;
          addLog(state, `${camp.name} n'a plus de marqueurs de forces : l'armée est rompue !`);
        }
      }
      campA.actionMods = [];
      campB.actionMods = [];
      state.roundActions = [];
      return state;
    },

    applyMoraleResult(state, campId, total, target, critFail) {
      const camp = state.camps.find(c => c.id === campId);
      if (critFail) {
        camp.routed = true;
        addLog(state, `Moral de ${camp.name} : échec critique (${total} vs ${target}) — l'armée est en déroute !`);
      } else if (total < target) {
        addLog(state, `Moral de ${camp.name} : échec (${total} vs ${target}) — l'armée entame une retraite en ordre.`);
      } else {
        addLog(state, `Moral de ${camp.name} : succès (${total} vs ${target}) — les troupes tiennent leurs positions.`);
      }
      camp.moraleMods = [];
      state.moraleQueue = (state.moraleQueue || []).filter(id => id !== campId);
      return state;
    },

    snapshotRoundStart(state) {
      snapshotRoundStartMarkers(state);
      return state;
    },
  };

  /** Applique un patch : localement si MJ, sinon via socketlib vers un MJ connecté. */
  async function applyPatch(patchName, ...args) {
    if (game.user.isGM) {
      const state = getState();
      const fn = MC_PATCHERS[patchName];
      const result = await fn(state, ...args);
      await setState(state);
      return { ok: true, result };
    } else {
      return await mcSocket.executeAsGM("mc_applyPatch", patchName, args);
    }
  }

  // ==========================================================================
  // 4. JETS DE DÉS — boîte de dialogue STANDARD SWADE (actor.rollSkill /
  //    actor.rollAttribute), pour que TOUT ce que gère nativement le
  //    système fonctionne (pénalités de Blessures/Fatigue, Dé Sauvage,
  //    relance avec un Jeton, Conviction si activée AVANT le jet sur la
  //    fiche...).
  //
  //  MODIFICATEURS DE CONTEXTE (bonus de forces, permanents, bonus de round,
  //  malus de moral...) : on tente de les PRÉREMPLIR dans la boîte de
  //  dialogue via l'option `additionalMods` (format `{value, label}`, le
  //  plus communément utilisé dans les macros SWADE de la communauté). Si
  //  ta version du système ne supporte pas exactement cette option, les
  //  modificateurs restent de toute façon rappelés en clair au-dessus du
  //  total à confirmer, et peuvent être ajoutés à la main dans la boîte de
  //  dialogue (son propre champ de modificateur) ou directement dans le
  //  total du panneau de confirmation.
  //
  //  COMPÉTENCES : recherchées par leur nom ANGLAIS (celui du système SWADE
  //  de base) directement dans la liste RÉELLE des compétences de l'acteur
  //  concerné — pas de liste figée. Si la compétence n'est pas trouvée sur
  //  la fiche (ou si "Tentative sans formation" est choisie explicitement),
  //  jet de d4-2 (avec Dé Sauvage si Meneur), conformément à la règle.
  //
  //  RELANCES : le total renvoyé ici reste une PROPOSITION : si relance
  //  avec un Jeton après coup, ou Conviction activée après le jet, corrige
  //  le total à la main dans le panneau de confirmation — un bouton
  //  "+1d6 explosif" y est prévu pour ça.
  //
  //  DÉLÉGATION AUX JOUEURS : quand l'acteur appartient à un joueur connecté
  //  (autre que celui qui déclenche l'action), le jet est relayé sur SON
  //  client via socketlib (executeAsUser) : c'est lui qui voit sa boîte de
  //  dialogue et lance ses dés, pas le MJ à sa place.
  // ==========================================================================

  const UNSKILLED_VALUE = "__unskilled__";
  const UNSKILLED_LABEL = "Unskilled attempt (d4-2)";

  function findSkill(actor, skillName) {
    const norm = s => s.trim().toLowerCase();
    return actor?.items.find(i => i.type === "skill" && norm(i.name) === norm(skillName));
  }

  /** Liste des noms de compétences RÉELLEMENT présentes sur la fiche. */
  function getActorSkillNames(actor) {
    if (!actor) return [];
    return actor.items.filter(i => i.type === "skill").map(i => i.name).sort((a, b) => a.localeCompare(b));
  }

  /** Un "Joker" au sens SWADE : Wildcard, PJ ou PNJ important — jamais un
   *  Figurant/Extra. Utilisé pour les PARTICIPANTS à l'Action de combat. */
  function isWildcardActor(a) {
    return a?.system?.wildcard === true;
  }

  /** Éligible comme COMMANDANT : n'importe quel acteur jouable (PJ ou PNJ,
   *  Joker ou Figurant/Extra — un général peut très bien être un Extra). */
  function isCommandantEligible(a) {
    return a?.type === "character" || a?.type === "npc";
  }

  /** Le premier utilisateur connecté (hors MJ) qui possède cet acteur. */
  function findOwningUser(actor) {
    if (!actor) return null;
    return game.users.find(u => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  }

  function buildAdditionalMods(mods) {
    return mods.map(m => ({ value: Number(m.value) || 0, label: m.label }));
  }

  async function rollSkillTotal(actor, skillName, mods = [], flavor = "") {
    const modTotal = mods.reduce((a, m) => a + Number(m.value || 0), 0);

    if (!actor) {
      // Commandant abstrait, sans fiche : d6 simple par convention.
      const roll = await (new Roll(`1d6x + ${modTotal}`)).evaluate();
      await roll.toMessage({ flavor: `${flavor || skillName} (commandant abstrait, d6)` });
      return roll.total;
    }

    const wantsUnskilled = skillName === UNSKILLED_VALUE;
    const skill = wantsUnskilled ? null : findSkill(actor, skillName);

    if (wantsUnskilled || !skill) {
      if (!wantsUnskilled) {
        ui.notifications.warn(`Compétence "${skillName}" introuvable sur ${actor.name} — tentative sans formation (d4-2).`);
      }
      const wildcard = actor.system?.wildcard === true;
      const pool = wildcard ? "{1d4x,1d6x}kh" : "1d4x";
      const roll = await (new Roll(`${pool} - 2 + ${modTotal}`)).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${flavor || "Tentative sans formation"} (d4-2)` });
      return roll.total;
    }

    const options = mods.length ? { additionalMods: buildAdditionalMods(mods) } : undefined;
    const roll = await actor.rollSkill(skill.id, options);
    if (!roll) return null; // boîte de dialogue annulée par l'utilisateur
    return roll.total ?? null;
  }

  async function rollAttributeTotal(actor, attributeKey, mods = [], flavor = "") {
    const modTotal = mods.reduce((a, m) => a + Number(m.value || 0), 0);
    if (!actor) {
      const roll = await (new Roll(`1d6x + ${modTotal}`)).evaluate();
      await roll.toMessage({ flavor: `${flavor} (commandant abstrait, d6)` });
      return roll.total;
    }
    const options = mods.length ? { additionalMods: buildAdditionalMods(mods) } : undefined;
    const roll = await actor.rollAttribute(attributeKey, options);
    if (!roll) return null;
    return roll.total ?? null;
  }

  /** Lance (ou délègue au joueur propriétaire) un jet de compétence. */
  async function rollForActor(actor, skillName, mods = [], flavor) {
    if (!actor) return await rollSkillTotal(null, skillName, mods, flavor);
    const owner = findOwningUser(actor);
    if (owner && owner.id !== game.user.id) {
      ui.notifications.info(`En attente du jet de ${actor.name} par ${owner.name}...`);
      return await mcSocket.executeAsUser("mc_requestRoll", owner.id, { actorId: actor.id, skillName, mods, kind: "skill", flavor });
    }
    return await rollSkillTotal(actor, skillName, mods, flavor);
  }

  /** Lance (ou délègue au joueur propriétaire) un jet d'attribut. */
  async function rollAttributeForActor(actor, attributeKey, mods = [], flavor) {
    if (!actor) return await rollAttributeTotal(null, attributeKey, mods, flavor);
    const owner = findOwningUser(actor);
    if (owner && owner.id !== game.user.id) {
      ui.notifications.info(`En attente du jet de ${actor.name} par ${owner.name}...`);
      return await mcSocket.executeAsUser("mc_requestRoll", owner.id, { actorId: actor.id, attributeKey, mods, kind: "attribute", flavor });
    }
    return await rollAttributeTotal(actor, attributeKey, mods, flavor);
  }

  /** Lance un d6 explosif et l'ajoute à la valeur déjà présente dans un
   *  champ input — pour gérer une relance/Conviction décidée après coup. */
  async function rollExplodingD6AndAdd(inputEl, label = "d6 explosif (après coup)") {
    if (!inputEl) return;
    const roll = await (new Roll("1d6x")).evaluate();
    await roll.toMessage({ flavor: label });
    const current = Number(inputEl.value) || 0;
    inputEl.value = current + roll.total;
  }

  /** Petit effet visuel maison (pas de dépendance à un module tiers) pour
   *  matérialiser la dépense d'un Jeton — l'animation "officielle" native
   *  au clic sur la fiche semble en réalité venir de modules d'extension
   *  (SWIM, swade-tools...), pas du système de base ; ceci est notre
   *  propre geste, plus modeste mais indépendant de ces modules. */
  function showBennySpendFlourish(actorName) {
    try {
      const el = document.createElement("div");
      el.textContent = `🪙 -1 Jeton — ${actorName}`;
      el.style.cssText = "position:fixed; top:40%; left:50%; transform:translate(-50%,0); z-index:100000; background:#b8860b; color:#fff; padding:6px 14px; border-radius:20px; font-size:14px; font-weight:bold; box-shadow:0 2px 8px rgba(0,0,0,0.4); opacity:1; transition:opacity 1.2s ease, transform 1.2s ease; pointer-events:none;";
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%,-40px)";
      });
      setTimeout(() => el.remove(), 1300);
    } catch (err) { /* purement cosmétique, on ignore toute erreur */ }
  }

  /**
   * Dépense 1 Jeton (Benny) de l'acteur et relance ENTIÈREMENT le jet
   * (nouvelle boîte de dialogue standard, tous les dés relancés depuis
   * zéro — conforme à la règle), puis garde le MEILLEUR des deux totaux.
   * `rollFn` doit relancer le même jet et retourner le nouveau total (ou
   * null si annulé).
   */
  async function spendBennyAndReroll(actor, currentTotal, rollFn) {
    if (!actor) return currentTotal;
    const bennies = actor.system?.bennies;
    if (!bennies || (bennies.value ?? 0) <= 0) {
      ui.notifications.warn(`${actor.name} n'a plus de Jeton disponible.`);
      return currentTotal;
    }
    await actor.update({ "system.bennies.value": bennies.value - 1 });
    showBennySpendFlourish(actor.name);
    const rerollTotal = await rollFn();
    if (rerollTotal === null) return currentTotal; // relance annulée (dialogue fermé)
    const kept = Math.max(currentTotal, rerollTotal);
    await applyPatch("logMessage", `${actor.name} relance avec un Jeton : ${rerollTotal} (garde le meilleur : ${kept}).`);
    return kept;
  }

  /** Relance (ou délègue au joueur propriétaire) — dépense 1 Jeton et
   *  relance le jet depuis zéro, en gardant le meilleur des deux totaux. */
  async function rerollForActor(actor, currentTotal, rollSpec) {
    if (!actor) return currentTotal;
    const owner = findOwningUser(actor);
    if (owner && owner.id !== game.user.id) {
      ui.notifications.info(`En attente de la relance de ${actor.name} par ${owner.name}...`);
      return await mcSocket.executeAsUser("mc_spendBennyAndReroll", owner.id, { actorId: actor.id, currentTotal, ...rollSpec });
    }
    return await spendBennyAndReroll(actor, currentTotal, async () => {
      if (rollSpec.kind === "attribute") return await rollAttributeTotal(actor, rollSpec.attributeKey, rollSpec.mods || [], rollSpec.flavor);
      return await rollSkillTotal(actor, rollSpec.skillName, rollSpec.mods || [], rollSpec.flavor);
    });
  }

  function describeMods(mods) {
    if (!mods.length) return "aucun";
    return mods.map(m => `${m.label} (${m.value >= 0 ? "+" : ""}${m.value})`).join(", ");
  }

  // ==========================================================================
  // 5. TABLE "EFFETS DES COMBATS" (2d6)
  // ==========================================================================
  const EFFETS_TABLE = [
    { max: 2, name: "Inspiration", text: "Le combattant inspire les troupes : son camp regagne immédiatement 1 marqueur de forces." },
    { max: 4, name: "Terreur", text: "Le commandement ennemi subit -2 à son prochain jet d'Âme ce round." },
    { max: 9, name: "Valeur", text: "Le combattant octroie +2 de Soutien à son meneur." },
    { max: 11, name: "Carnage", text: "Le commandant ennemi subit -2 à son prochain jet de Stratégie." },
    { max: 12, name: "Une armée à lui seul", text: "L'armée adverse perd immédiatement 1 marqueur de forces (hors calcul du jet de Stratégie) et un jet de moral est déclenché même si l'ennemi remporte le round." },
  ];
  function rollEffetsTable() {
    const total = Math.floor(Math.random() * 6 + 1) + Math.floor(Math.random() * 6 + 1);
    const entry = EFFETS_TABLE.find(e => total <= e.max) ?? EFFETS_TABLE.at(-1);
    return { total, ...entry };
  }

  // ==========================================================================
  // 6. TEMPLATES (Handlebars compilés à la volée — pas de fichier .hbs séparé)
  // ==========================================================================

  const PARTICIPANTS_BLOCK = `
    <h3>Participants à l'Action de combat — ce round</h3>
    <p class="mc-help">Chaque round, choisis quels Jokers (PJ ou PNJ, alliés ou adverses) participent, et dans quel camp. Le jet de Stratégie est verrouillé tant qu'il reste des participants ou des jets de Moral en attente.</p>
    <div class="mc-add-participant">
      <select class="mc-participant-actor">
        <option value="">— choisir un Joker —</option>
        {{#each participantActorChoices as |a|}}<option value="{{a.id}}">{{a.name}}</option>{{/each}}
      </select>
      <select class="mc-participant-camp">
        {{#each state.camps as |camp|}}<option value="{{camp.id}}">{{camp.name}}</option>{{/each}}
      </select>
      <button data-action="addParticipant">+ Ajouter</button>
    </div>
    <ul class="mc-participant-list">
      {{#each participants as |p|}}
      <li class="mc-participant {{#if p.done}}mc-participant-done{{/if}}">
        <div class="mc-participant-row">
          <strong>{{p.actorName}}</strong> → {{p.campName}}
          {{#if p.done}}
            <span class="mc-status-done">✅ {{p.summary}}</span>
          {{else}}
            <span class="mc-status-pending">⏳ en attente</span>
          {{/if}}
          <a data-action="removeParticipant" data-participant="{{p.id}}" title="Retirer">✕</a>
        </div>
        {{#if p.canControl}}
          {{#unless p.done}}
          <div class="mc-participant-controls">
            <select class="mc-participant-skill" data-participant="{{p.id}}">
              {{#each p.skillChoices as |s|}}<option value="{{s}}">{{s}}</option>{{/each}}
              {{#unless p.hasNativeUnskilled}}<option value="__unskilled__">Unskilled attempt (d4-2)</option>{{/unless}}
              <option value="__custom__">Autre (nom exact sur la fiche)</option>
            </select>
            <input type="text" class="mc-participant-custom" data-participant="{{p.id}}" placeholder="Compétence si 'Autre'">
            <button data-action="rollParticipant" data-participant="{{p.id}}">🎲 Lancer l'action</button>
          </div>
          {{/unless}}
          {{#if p.pending}}
          <div class="mc-pending">
            <strong>Confirme le résultat</strong> <span class="mc-manual-note">(corrige si relance)</span>
            <div class="mc-pending-row">
              <label>Total : <input type="number" class="mc-pending-action-total" data-participant="{{p.id}}" value="{{p.pending.total}}"></label>
              {{#if p.pending.bennies}}
              <button data-action="rerollParticipant" data-participant="{{p.id}}" class="mc-d6-btn" title="Dépense 1 Jeton et relance tout le jet">🔄 Relancer (Jeton — {{p.pending.bennies}} dispo.)</button>
              {{/if}}
              <button data-action="addD6Participant" data-participant="{{p.id}}" class="mc-d6-btn" title="Conviction activée après coup">🎲 +1d6</button>
              <label><input type="checkbox" class="mc-pending-action-crit" data-participant="{{p.id}}"> Échec critique (1 naturel)</label>
            </div>
            <button data-action="confirmParticipant" data-participant="{{p.id}}" class="mc-big-btn">✅ Résoudre</button>
            <button data-action="cancelParticipant" data-participant="{{p.id}}" class="mc-small">Annuler le jet</button>
          </div>
          {{/if}}
        {{/if}}
      </li>
      {{/each}}
    </ul>
    {{#unless canRollStrategie}}
    <p class="mc-warning">⚠️ Des participants et/ou des jets de Moral sont encore en attente — le jet de Stratégie est verrouillé.</p>
    {{/unless}}
  `;

  // Bloc réutilisé pour la config d'UN camp (Configuration + Round view lecture seule)
  const CAMP_SETUP_BLOCK = `
    {{#each setupCamps as |camp|}}
    <div class="mc-camp" style="border-color: {{camp.color}}">
      <h4 style="color: {{camp.color}}">{{camp.label}}</h4>
      <input type="text" class="mc-setup-name" data-idx="{{camp.idx}}" value="{{camp.name}}" placeholder="Nom du camp">
      <input type="number" class="mc-setup-markers" data-idx="{{camp.idx}}" value="{{camp.forceMarkers}}" placeholder="Marqueurs de forces">
      <input type="color" class="mc-setup-color" data-idx="{{camp.idx}}" value="{{camp.color}}">

      <div class="mc-flags">
        <label><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="fortified" {{#if camp.fortified}}checked{{/if}}> Fortifié (+2 moral)</label>
        <label><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="fearless" {{#if camp.fearless}}checked{{/if}}> Morts-vivants/Sans peur (+2 moral)</label>
        <label><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="pinned" {{#if camp.pinned}}checked{{/if}}> Acculé (+2 moral)</label>
      </div>

      <div class="mc-mods">
        <strong>Modificateurs permanents :</strong>
        <ul>
          {{#each camp.modifiers as |mod|}}
          <li>{{mod.label}} ({{mod.value}}) <a data-action="rmMod" data-camp="{{camp.id}}" data-mod="{{mod.id}}">✕</a></li>
          {{/each}}
        </ul>
        <div class="mc-add-mod">
          <input type="text" placeholder="Libellé (ex: Avantage tactique)" class="mc-mod-label" data-camp="{{camp.id}}">
          <input type="number" placeholder="Valeur" class="mc-mod-value" data-camp="{{camp.id}}">
          <button data-action="addMod" data-camp="{{camp.id}}">Ajouter</button>
        </div>
      </div>

      <div class="mc-commandant">
        <label>Commandant : <select class="mc-commandant-select" data-camp="{{camp.id}}">
          <option value="">— manuel (d6) —</option>
          {{#each camp.commandantChoices as |a|}}<option value="{{a.id}}" {{#if (eq a.id camp.commandantId)}}selected{{/if}}>{{a.name}}</option>{{/each}}
        </select></label>
      </div>
    </div>
    {{/each}}
  `;

  const GM_TEMPLATE = `
  <div class="mc-app">
    {{#if state.initialized}}
    <div class="mc-nav">
      <button data-action="navRound" class="mc-nav-btn {{#if isRoundView}}mc-nav-active{{/if}}">▶ Round en cours</button>
      <button data-action="navSetup" class="mc-nav-btn {{#if isSetupView}}mc-nav-active{{/if}}">⚙ Configuration</button>
      {{#if hasMoraleQueue}}
      <button data-action="navMorale" class="mc-nav-btn mc-nav-alert {{#if isMoraleView}}mc-nav-active{{/if}}">⚠ Moral ({{moraleQueueCount}})</button>
      {{/if}}
    </div>
    {{/if}}

    {{#if isSetupView}}
    <div class="mc-setup-view">
      <h3>{{#if isReconfigure}}Configuration des camps{{else}}Configuration initiale{{/if}}</h3>
      {{#if isReconfigure}}
      <p class="mc-help">Nom/couleur/marqueurs, drapeaux, modificateurs permanents et commandant — tout se règle ici. Rien de tout ça ne réinitialise le round en cours ni le journal. Pour repartir entièrement à zéro : "🏳 Terminer le combat" dans l'écran Round.</p>
      {{/if}}
      ${CAMP_SETUP_BLOCK}
      <button data-action="submitSetup" class="mc-big-btn">{{#if isReconfigure}}✅ Appliquer nom/couleur/marqueurs{{else}}▶ Démarrer le combat{{/if}}</button>
      {{#if isReconfigure}}<button data-action="cancelSetup" class="mc-small">← Retour au round</button>{{/if}}
    </div>
    {{/if}}

    {{#if isRoundView}}
      <div class="mc-round">Round actuel : <strong>{{state.round}}</strong></div>
      <div class="mc-camps">
        {{#each enrichedCamps as |camp|}}
        <div class="mc-camp mc-camp-compact" style="border-color: {{camp.color}}">
          <h3 style="color: {{camp.color}}">{{camp.name}} {{#if camp.routed}}<span class="mc-routed">(EN DÉROUTE)</span>{{/if}}</h3>
          <div>Marqueurs de forces : <strong>{{camp.forceMarkers}}</strong> / {{camp.startMarkers}}</div>
          <div class="mc-camp-summary">
            {{#if camp.fortified}}<span class="mc-tag">Fortifié</span>{{/if}}
            {{#if camp.fearless}}<span class="mc-tag">Sans peur</span>{{/if}}
            {{#if camp.pinned}}<span class="mc-tag">Acculé</span>{{/if}}
            {{#if camp.commandantName}}<span class="mc-tag">Commandant : {{camp.commandantName}}</span>{{else}}<span class="mc-tag">Commandant : manuel (d6)</span>{{/if}}
          </div>
          {{#if camp.commandantName}}
          <div class="mc-strategie-skill-row">
            <label>Compétence de Stratégie : <select class="mc-strategie-skill" data-camp="{{camp.id}}">
              {{#each camp.strategieSkillChoices as |s|}}<option value="{{s}}" {{#if (eq s camp.strategieSkillSelected)}}selected{{/if}}>{{s}}</option>{{/each}}
              <option value="__unskilled__" {{#if (eq camp.strategieSkillSelected "__unskilled__")}}selected{{/if}}>Unskilled attempt (d4-2)</option>
            </select></label>
          </div>
          {{/if}}
          {{#if camp.modifiers.length}}
          <div class="mc-mods-readonly"><em>Modificateurs permanents : {{camp.modifiersText}}</em></div>
          {{/if}}
          {{#if camp.actionMods.length}}
          <div class="mc-mods mc-onetime-mods">
            <strong>Bonus/malus en attente (prochain jet de Stratégie) :</strong>
            <ul>{{#each camp.actionMods as |am|}}<li>{{am.label}} ({{am.value}})</li>{{/each}}</ul>
          </div>
          {{/if}}
        </div>
        {{/each}}
      </div>
      <button data-action="navSetup" class="mc-link-btn">⚙ Ajuster drapeaux / modificateurs / commandant</button>

      {{#if hasMoraleQueue}}
      <button data-action="navMorale" class="mc-link-btn mc-link-alert">⚠ {{moraleQueueCount}} jet(s) de Moral en attente — y aller</button>
      {{/if}}

      <hr>
      ${PARTICIPANTS_BLOCK}
      <div class="mc-round-tools">
        <button data-action="clearParticipants" class="mc-small">🗑 Vider la liste des participants</button>
        <select class="mc-force-morale-camp">
          {{#each state.camps as |camp|}}<option value="{{camp.id}}">{{camp.name}}</option>{{/each}}
        </select>
        <button data-action="forceMorale" class="mc-small">➕ Forcer un jet de Moral</button>
        <button data-action="rollEffets" class="mc-small">🎲 Table Effets des combats (2d6)</button>
      </div>
      <label class="mc-config-line"><input type="checkbox" data-action="toggleOnlyFatigue" {{#if state.config.onlyFatigueForJokers}}checked{{/if}}> Les Jokers ne subissent que de la Fatigue (jamais de Blessures) — variante, s'applique aux échecs simples et critiques</label>

      <hr>
      <button data-action="rollStrategie" class="mc-big-btn" {{#unless canRollStrategie}}disabled{{/unless}}>⚔️ Lancer le jet de Stratégie opposé</button>
      {{#unless canRollStrategie}}
      <p class="mc-warning">⚠️ Résous d'abord les Actions de combat et/ou jets de Moral en attente.</p>
      {{/unless}}
      {{#if pendingStrategie}}
      <div class="mc-pending">
        <strong>Confirme les totaux</strong> <span class="mc-manual-note">(corrige si relance/Conviction après coup)</span>
        <p class="mc-mods-hint">{{pendingStrategie.campALabel}} — modificateurs à appliquer : {{pendingStrategie.modsHintA}}<br>{{pendingStrategie.campBLabel}} — modificateurs à appliquer : {{pendingStrategie.modsHintB}}</p>
        <div class="mc-pending-row">
          <label>{{pendingStrategie.campALabel}} : <input type="number" class="mc-pending-a" value="{{pendingStrategie.totalA}}"></label>
          {{#if pendingStrategie.benniesA}}<button data-action="rerollStrategieA" class="mc-d6-btn" title="Dépense 1 Jeton et relance tout le jet">🔄 Relancer (Jeton — {{pendingStrategie.benniesA}})</button>{{/if}}
          <button data-action="addD6StrategieA" class="mc-d6-btn">🎲 +1d6</button>
        </div>
        <div class="mc-pending-row">
          <label>{{pendingStrategie.campBLabel}} : <input type="number" class="mc-pending-b" value="{{pendingStrategie.totalB}}"></label>
          {{#if pendingStrategie.benniesB}}<button data-action="rerollStrategieB" class="mc-d6-btn" title="Dépense 1 Jeton et relance tout le jet">🔄 Relancer (Jeton — {{pendingStrategie.benniesB}})</button>{{/if}}
          <button data-action="addD6StrategieB" class="mc-d6-btn">🎲 +1d6</button>
        </div>
        <button data-action="confirmStrategie" class="mc-big-btn">✅ Valider et appliquer le résultat</button>
        <button data-action="cancelStrategie" class="mc-small">Annuler</button>
      </div>
      {{/if}}

      <hr>
      <label><input type="checkbox" data-action="toggleReveal" {{#if state.revealEnemyToPlayers}}checked{{/if}}> Révéler les détails du camp adverse aux joueurs</label>
      <div class="mc-footer-actions">
        <button data-action="endCombat" class="mc-small mc-danger">🏳 Terminer le combat (réinitialiser)</button>
      </div>
    {{/if}}

    {{#if isMoraleView}}
      <h3>Jets de Moral requis</h3>
      <p class="mc-help">Ces camps ont perdu des marqueurs de forces ce round et doivent faire un jet de Moral avant que le round suivant ne puisse commencer.</p>
      {{#each moraleCamps as |camp|}}
      <div class="mc-camp" style="border-color: {{camp.color}}">
        <h3 style="color: {{camp.color}}">{{camp.name}} {{#if camp.routed}}<span class="mc-routed">(EN DÉROUTE)</span>{{/if}}</h3>
        <div>Marqueurs de forces : <strong>{{camp.forceMarkers}}</strong> / {{camp.startMarkers}}</div>
        <div>Commandant : {{#if camp.commandantName}}{{camp.commandantName}}{{else}}manuel (d6){{/if}}</div>
        <button data-action="rollMorale" data-camp="{{camp.id}}" class="mc-big-btn">🎲 Lancer le jet de Moral</button>
      </div>
      {{/each}}

      {{#each pendingMoraleList as |pm|}}
      <div class="mc-pending">
        <strong>Confirme le Moral — {{pm.campName}}</strong> <span class="mc-manual-note">(corrige si relance)</span>
        <p class="mc-mods-hint">Modificateurs à appliquer : {{pm.modsHint}}</p>
        <div class="mc-pending-row">
          <label>Total : <input type="number" class="mc-pending-morale-total" data-camp="{{pm.campId}}" value="{{pm.total}}"></label>
          {{#if pm.bennies}}<button data-action="rerollMorale" data-camp="{{pm.campId}}" class="mc-d6-btn" title="Dépense 1 Jeton et relance tout le jet">🔄 Relancer (Jeton — {{pm.bennies}})</button>{{/if}}
          <button data-action="addD6Morale" data-camp="{{pm.campId}}" class="mc-d6-btn">🎲 +1d6</button>
          <label><input type="checkbox" class="mc-pending-morale-crit" data-camp="{{pm.campId}}"> Échec critique (1 naturel)</label>
        </div>
        <button data-action="confirmMorale" data-camp="{{pm.campId}}" class="mc-big-btn">✅ Valider</button>
        <button data-action="cancelMorale" data-camp="{{pm.campId}}" class="mc-small">Annuler</button>
      </div>
      {{/each}}

      <button data-action="navRound" class="mc-small">← Retour au round</button>
    {{/if}}

    <hr>
    <h3>Journal de bataille</h3>
    <div class="mc-log">
      {{#each state.log as |entry|}}
      <div class="mc-log-entry"><span class="mc-log-round">R{{entry.round}}</span> {{entry.text}}</div>
      {{/each}}
    </div>
  </div>`;

  const PLAYER_TEMPLATE = `
  <div class="mc-app">
    {{#unless state.initialized}}
      <p><em>Le Meneur n'a pas encore configuré le combat de masse.</em></p>
    {{else}}
      <div class="mc-round">Round actuel : <strong>{{state.round}}</strong></div>

      <div class="mc-camp-select">
        <label>Mon camp :
          <select class="mc-my-camp">
            {{#each state.camps as |camp|}}<option value="{{camp.id}}" {{#if (eq camp.id myCamp.id)}}selected{{/if}}>{{camp.name}}</option>{{/each}}
          </select>
        </label>
      </div>

      <div class="mc-camp mc-my-camp-box" style="border-color: {{myCamp.color}}">
        <h3 style="color: {{myCamp.color}}">{{myCamp.name}} {{#if myCamp.routed}}<span class="mc-routed">(EN DÉROUTE)</span>{{/if}}</h3>
        <div>Marqueurs de forces : <strong>{{myCamp.forceMarkers}}</strong> / {{myCamp.startMarkers}}</div>
      </div>

      {{#if state.revealEnemyToPlayers}}
      <div class="mc-camp" style="border-color: {{enemyCamp.color}}">
        <h3 style="color: {{enemyCamp.color}}">{{enemyCamp.name}} (adverse) {{#if enemyCamp.routed}}<span class="mc-routed">(EN DÉROUTE)</span>{{/if}}</h3>
        <div>Marqueurs de forces : <strong>{{enemyCamp.forceMarkers}}</strong> / {{enemyCamp.startMarkers}}</div>
      </div>
      {{else}}
      <p class="mc-hidden-note"><em>Les détails du camp adverse sont masqués par le Meneur.</em></p>
      {{/if}}

      <hr>
      <h3>Mon personnage</h3>
      <label>Acteur : <select class="mc-my-actor">
        <option value="">— aucun —</option>
        {{#each myActors as |a|}}<option value="{{a.id}}" {{#if (eq a.id selectedActorId)}}selected{{/if}}>{{a.name}}</option>{{/each}}
      </select></label>

      <div class="mc-resources">
        <label>Munitions : <strong>{{myResources.ammo}}</strong>
          <button data-action="res" data-key="ammo" data-delta="-1">-</button>
          <button data-action="res" data-key="ammo" data-delta="1">+</button>
        </label>
        <label>Points de pouvoir : <strong>{{myResources.pp}}</strong>
          <button data-action="res" data-key="pp" data-delta="-1">-</button>
          <button data-action="res" data-key="pp" data-delta="1">+</button>
        </label>
      </div>

      <hr>
      ${PARTICIPANTS_BLOCK}

    {{/unless}}

    <hr>
    <h3>Journal de bataille</h3>
    <div class="mc-log">
      {{#each state.log as |entry|}}
      <div class="mc-log-entry"><span class="mc-log-round">R{{entry.round}}</span> {{entry.text}}</div>
      {{/each}}
    </div>
  </div>`;

  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a === b);
  }

  // ==========================================================================
  // 7. APPLICATION FOUNDRY
  // ==========================================================================
  class MassCombatApp extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "mass-combat-app",
        title: `Combats de masse (v${MC_CONFIG.VERSION})`,
        width: 540,
        height: "auto",
        resizable: true,
      });
    }

    _buildParticipantsViewModel(state, canControlFn) {
      return (state.roundActions || []).map(p => {
        const camp = state.camps.find(c => c.id === p.campId);
        const canControl = canControlFn(p);
        const actor = canControl ? game.actors.get(p.actorId) : null;
        const skillChoices = canControl ? getActorSkillNames(actor) : [];
        // Si la fiche a déjà une compétence "Unskilled Attempt" telle
        // quelle, on ne rajoute pas notre option synthétique en double.
        const hasNativeUnskilled = skillChoices.some(s => s.trim().toLowerCase() === "unskilled attempt");
        const rawPending = this._pendingActions?.[p.id] ?? null;
        // Nombre de Jetons toujours recalculé "à chaud" (pas figé au
        // moment du jet), pour que le bouton de relance reflète l'état
        // réel de la fiche.
        const pending = rawPending ? { ...rawPending, bennies: actor?.system?.bennies?.value ?? 0 } : null;
        return {
          ...p,
          campName: camp?.name ?? "?",
          done: p.status === "done",
          canControl,
          skillChoices,
          hasNativeUnskilled,
          pending,
        };
      });
    }

    async getData() {
      const state = getState();
      const moraleQueue = state.moraleQueue || [];
      const canRollStrategie = (state.roundActions || []).every(p => p.status === "done") && moraleQueue.length === 0;
      // Participants à l'Action de combat : Jokers uniquement (PJ ou PNJ
      // important), jamais un Figurant/Extra.
      const wildcardActors = game.actors.filter(isWildcardActor);
      // Commandants : n'importe quel acteur jouable, Joker OU Figurant/Extra
      // (un général peut très bien être un simple Extra).
      const commandantActors = game.actors.filter(isCommandantEligible);
      const commandantIds = new Set(state.camps.map(c => c.commandantId).filter(Boolean));

      if (game.user.isGM) {
        const enrichedCamps = state.camps.map((camp, idx) => {
          const otherCamp = state.camps[1 - idx];
          const commandant = camp.commandantId ? game.actors.get(camp.commandantId) : null;
          // Compétence utilisée pour le jet de Stratégie de ce camp : liste
          // RÉELLE des compétences du commandant (pas de nom figé), pour
          // être sûr de toujours passer par la boîte de dialogue standard
          // au lieu de retomber sur "Battle introuvable → jet manuel".
          let strategieSkillChoices = [];
          let strategieSkillSelected = null;
          if (commandant) {
            strategieSkillChoices = getActorSkillNames(commandant);
            this._strategieSkill ??= {};
            if (!this._strategieSkill[camp.id] || !strategieSkillChoices.includes(this._strategieSkill[camp.id])) {
              // Choix par défaut : "Battle" si présent, sinon la première
              // compétence de la fiche, sinon Tentative sans formation.
              this._strategieSkill[camp.id] = strategieSkillChoices.includes(MC_CONFIG.SKILL_STRATEGIE)
                ? MC_CONFIG.SKILL_STRATEGIE
                : (strategieSkillChoices[0] ?? UNSKILLED_VALUE);
            }
            strategieSkillSelected = this._strategieSkill[camp.id];
          }
          return {
            ...camp,
            commandantName: commandant?.name,
            modifiersText: describeMods(camp.modifiers),
            // Un acteur déjà commandant de l'AUTRE camp ne peut pas être
            // choisi ici (mais reste proposé s'il est déjà LE commandant
            // de CE camp, pour rester sélectionné dans la liste).
            commandantChoices: commandantActors.filter(a => a.id !== otherCamp.commandantId).map(a => ({ id: a.id, name: a.name })),
            strategieSkillChoices,
            strategieSkillSelected,
          };
        });

        let view = !state.initialized ? "setup" : (this._view || "round");
        if (view === "morale" && moraleQueue.length === 0) view = "round";
        this._view = view;

        const moraleCamps = enrichedCamps.filter(c => moraleQueue.includes(c.id));
        const setupCamps = enrichedCamps.map((c, idx) => ({ ...c, idx, label: idx === 0 ? "Camp A" : "Camp B" }));
        const participantActorChoices = wildcardActors.filter(a => !commandantIds.has(a.id)).map(a => ({ id: a.id, name: a.name }));

        let pendingStrategie = this._pendingStrategie ?? null;
        if (pendingStrategie) {
          const actorA = pendingStrategie.commAId ? game.actors.get(pendingStrategie.commAId) : null;
          const actorB = pendingStrategie.commBId ? game.actors.get(pendingStrategie.commBId) : null;
          pendingStrategie = {
            ...pendingStrategie,
            benniesA: actorA?.system?.bennies?.value ?? 0,
            benniesB: actorB?.system?.bennies?.value ?? 0,
          };
        }
        let pendingMoraleList = Object.entries(this._pendingMorale ?? {}).map(([campId, pm]) => {
          const actor = pm.commandantId ? game.actors.get(pm.commandantId) : null;
          return { campId, ...pm, bennies: actor?.system?.bennies?.value ?? 0 };
        });

        return {
          state, enrichedCamps, moraleCamps, setupCamps,
          isSetupView: view === "setup",
          isRoundView: view === "round",
          isMoraleView: view === "morale",
          isReconfigure: state.initialized,
          hasMoraleQueue: moraleQueue.length > 0,
          moraleQueueCount: moraleQueue.length,
          participantActorChoices,
          participants: this._buildParticipantsViewModel(state, () => true),
          canRollStrategie,
          pendingStrategie,
          pendingMoraleList,
        };
      } else {
        const myRes = state.playerResources[game.user.id] ?? { ammo: 0, pp: 0, campId: state.camps[0]?.id };
        const myCamp = state.camps.find(c => c.id === myRes.campId) ?? state.camps[0];
        const enemyCamp = state.camps.find(c => c.id !== myCamp?.id);
        const myActors = game.actors.filter(a => a.isOwner && isWildcardActor(a) && !commandantIds.has(a.id));
        const myActorIds = new Set(myActors.map(a => a.id));
        const selectedActorId = this._selectedActorId ?? myActors[0]?.id ?? "";
        return {
          state, myCamp, enemyCamp,
          myResources: myRes,
          myActors,
          selectedActorId,
          participantActorChoices: myActors.map(a => ({ id: a.id, name: a.name })),
          participants: this._buildParticipantsViewModel(state, (p) => myActorIds.has(p.actorId)),
          canRollStrategie,
        };
      }
    }

    async _renderInner(data) {
      const tpl = game.user.isGM ? GM_TEMPLATE : PLAYER_TEMPLATE;
      const html = Handlebars.compile(tpl)(data);
      return $(`<div>${html}</div>`);
    }

    activateListeners(html) {
      super.activateListeners(html);

      // ---- Actions communes (MJ + joueurs) ----
      html.on("click", "[data-action='res']", async (ev) => {
        const key = ev.currentTarget.dataset.key;
        const delta = Number(ev.currentTarget.dataset.delta);
        await applyPatch("adjustResource", game.user.id, key, delta);
        this.render();
      });

      html.on("change", ".mc-my-camp", async (ev) => {
        await applyPatch("setResource", game.user.id, { campId: ev.currentTarget.value });
        this.render();
      });

      html.on("change", ".mc-my-actor", (ev) => {
        this._selectedActorId = ev.currentTarget.value;
      });

      // ---- Participants (communes) ----
      html.on("click", "[data-action='addParticipant']", async () => {
        const actorId = html.find(".mc-participant-actor")[0]?.value;
        const campId = html.find(".mc-participant-camp")[0]?.value;
        if (!actorId || !campId) { ui.notifications.warn("Choisis un Joker et un camp."); return; }
        const actor = game.actors.get(actorId);
        await applyPatch("addParticipant", actorId, actor?.name ?? "?", campId);
        this.render();
      });

      html.on("click", "[data-action='removeParticipant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        await applyPatch("removeParticipant", participantId);
        if (this._pendingActions) delete this._pendingActions[participantId];
        this.render();
      });

      html.on("click", "[data-action='rollParticipant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const skillSelect = html.find(`.mc-participant-skill[data-participant='${participantId}']`)[0];
        const custom = html.find(`.mc-participant-custom[data-participant='${participantId}']`)[0];
        const skillName = skillSelect.value === "__custom__" ? (custom.value || "Compétence") : skillSelect.value;
        const state = getState();
        const p = (state.roundActions || []).find(x => x.id === participantId);
        if (!p) return;
        const actor = game.actors.get(p.actorId);
        const total = await rollForActor(actor, skillName, [], `Action de combat — ${p.actorName}`);
        if (total === null) { ui.notifications.warn("Jet annulé."); return; }
        this._pendingActions ??= {};
        this._pendingActions[participantId] = { total, skillName, actorId: p.actorId, actorName: p.actorName, campId: p.campId };
        this.render();
      });

      html.on("click", "[data-action='addD6Participant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const input = html.find(`.mc-pending-action-total[data-participant='${participantId}']`)[0];
        await rollExplodingD6AndAdd(input);
      });

      html.on("click", "[data-action='rerollParticipant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const pending = this._pendingActions?.[participantId];
        if (!pending) return;
        const actor = game.actors.get(pending.actorId);
        const input = html.find(`.mc-pending-action-total[data-participant='${participantId}']`)[0];
        const currentTotal = Number(input.value);
        const kept = await rerollForActor(actor, currentTotal, { skillName: pending.skillName, kind: "skill", flavor: `Action de combat — ${pending.actorName}` });
        this._pendingActions[participantId].total = kept;
        this.render();
      });

      html.on("click", "[data-action='confirmParticipant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const totalInput = html.find(`.mc-pending-action-total[data-participant='${participantId}']`)[0];
        const critInput = html.find(`.mc-pending-action-crit[data-participant='${participantId}']`)[0];
        const total = Number(totalInput.value);
        const critFail = !!critInput?.checked;
        const pending = this._pendingActions?.[participantId];
        if (!pending) return;
        await this._resolveActionOutcome(participantId, pending.campId, pending.actorId, pending.actorName, total, pending.skillName, critFail);
        delete this._pendingActions[participantId];
        this.render();
      });

      html.on("click", "[data-action='cancelParticipant']", (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        if (this._pendingActions) delete this._pendingActions[participantId];
        this.render();
      });

      // ---- Actions MJ uniquement ----
      if (!game.user.isGM) return;

      html.on("click", "[data-action='navRound']", () => { this._view = "round"; this.render(); });
      html.on("click", "[data-action='navSetup']", () => { this._view = "setup"; this.render(); });
      html.on("click", "[data-action='navMorale']", () => { this._view = "morale"; this.render(); });

      html.on("click", "[data-action='submitSetup']", async () => {
        const state = getState();
        const campA = {
          name: html.find(".mc-setup-name[data-idx='0']").val() || "Camp A",
          forceMarkers: Number(html.find(".mc-setup-markers[data-idx='0']").val()) || 0,
          color: html.find(".mc-setup-color[data-idx='0']").val(),
        };
        const campB = {
          name: html.find(".mc-setup-name[data-idx='1']").val() || "Camp B",
          forceMarkers: Number(html.find(".mc-setup-markers[data-idx='1']").val()) || 0,
          color: html.find(".mc-setup-color[data-idx='1']").val(),
        };
        if (!state.initialized) {
          await applyPatch("setupCamps", campA, campB);
        } else {
          await applyPatch("reconfigureCamps", campA, campB);
        }
        this._view = "round";
        this.render();
      });

      html.on("click", "[data-action='cancelSetup']", () => {
        this._view = "round";
        this.render();
      });

      html.on("click", "[data-action='flag']", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        const flag = ev.currentTarget.dataset.flag;
        await applyPatch("setFlag", campId, flag, ev.currentTarget.checked);
        this.render();
      });

      html.on("click", "[data-action='addMod']", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        const labelInput = html.find(`.mc-mod-label[data-camp='${campId}']`)[0];
        const valueInput = html.find(`.mc-mod-value[data-camp='${campId}']`)[0];
        if (!labelInput.value || valueInput.value === "") return;
        await applyPatch("addModifier", campId, labelInput.value, Number(valueInput.value));
        this.render();
      });

      html.on("click", "[data-action='rmMod']", async (ev) => {
        await applyPatch("removeModifier", ev.currentTarget.dataset.camp, ev.currentTarget.dataset.mod);
        this.render();
      });

      html.on("change", ".mc-commandant-select", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        await applyPatch("setCommandant", campId, ev.currentTarget.value || null);
        // Un nouveau commandant peut avoir des compétences différentes :
        // on oublie le choix précédent pour que le défaut soit recalculé.
        if (this._strategieSkill) delete this._strategieSkill[campId];
        this.render();
      });

      html.on("change", ".mc-strategie-skill", (ev) => {
        this._strategieSkill ??= {};
        this._strategieSkill[ev.currentTarget.dataset.camp] = ev.currentTarget.value;
      });

      html.on("click", "[data-action='clearParticipants']", async () => {
        await applyPatch("clearParticipants");
        this._pendingActions = {};
        this.render();
      });

      html.on("click", "[data-action='forceMorale']", async () => {
        const campId = html.find(".mc-force-morale-camp")[0]?.value;
        if (!campId) return;
        await applyPatch("queueMoraleCheck", campId);
        this._view = "morale";
        this.render();
      });

      html.on("change", "[data-action='toggleOnlyFatigue']", async (ev) => {
        await applyPatch("setConfig", "onlyFatigueForJokers", ev.currentTarget.checked);
        this.render();
      });

      html.on("change", "[data-action='toggleReveal']", async (ev) => {
        await applyPatch("setRevealEnemy", ev.currentTarget.checked);
        this.render();
      });

      html.on("click", "[data-action='endCombat']", async () => {
        const confirmed = await Dialog.confirm({
          title: "Terminer le combat de masse ?",
          content: "<p>Ceci réinitialise <strong>tout</strong> (camps, marqueurs, journal, participants, ressources) à zéro. Cette action est irréversible. Continuer ?</p>",
          defaultYes: false,
        });
        if (!confirmed) return;
        const state = getState();
        await this._postRoundRecap(state, { final: true });
        await applyPatch("resetAll");
        this._pendingActions = {};
        this._pendingStrategie = null;
        this._pendingMorale = {};
        this._view = "setup";
        this.render();
      });

      html.on("click", "[data-action='rollStrategie']", async () => {
        const state = getState();
        if (!(state.roundActions || []).every(p => p.status === "done")) {
          ui.notifications.warn("Résous d'abord toutes les Actions de combat en attente.");
          return;
        }
        if ((state.moraleQueue || []).length > 0) {
          ui.notifications.warn("Résous d'abord les jets de Moral en attente.");
          this._view = "morale";
          this.render();
          return;
        }
        const [campA, campB] = state.camps;
        const commA = campA.commandantId ? game.actors.get(campA.commandantId) : null;
        const commB = campB.commandantId ? game.actors.get(campB.commandantId) : null;

        const bonusForcesA = Math.max(0, campA.forceMarkers - campB.forceMarkers);
        const bonusForcesB = Math.max(0, campB.forceMarkers - campA.forceMarkers);
        const modsA = [...campA.modifiers, ...(campA.actionMods || []), { label: "Bonus de forces", value: bonusForcesA }];
        const modsB = [...campB.modifiers, ...(campB.actionMods || []), { label: "Bonus de forces", value: bonusForcesB }];
        const modsHintA = describeMods(modsA);
        const modsHintB = describeMods(modsB);

        const skillA = (this._strategieSkill?.[campA.id]) || MC_CONFIG.SKILL_STRATEGIE;
        const skillB = (this._strategieSkill?.[campB.id]) || MC_CONFIG.SKILL_STRATEGIE;
        const totalA = await rollForActor(commA, skillA, modsA, `Stratégie — ${campA.name}`);
        const totalB = await rollForActor(commB, skillB, modsB, `Stratégie — ${campB.name}`);
        if (totalA === null || totalB === null) {
          ui.notifications.warn("Un des deux jets a été annulé — relance le jet de Stratégie.");
          return;
        }
        this._pendingStrategie = {
          totalA, totalB, campALabel: campA.name, campBLabel: campB.name, modsHintA, modsHintB,
          commAId: commA?.id ?? null, commBId: commB?.id ?? null,
          skillA, skillB, modsA, modsB,
        };
        this.render();
      });

      html.on("click", "[data-action='addD6StrategieA']", async () => {
        await rollExplodingD6AndAdd(html.find(".mc-pending-a")[0]);
      });
      html.on("click", "[data-action='addD6StrategieB']", async () => {
        await rollExplodingD6AndAdd(html.find(".mc-pending-b")[0]);
      });

      html.on("click", "[data-action='rerollStrategieA']", async () => {
        const { commAId, modsA, skillA } = this._pendingStrategie;
        const actor = commAId ? game.actors.get(commAId) : null;
        const input = html.find(".mc-pending-a")[0];
        const currentTotal = Number(input.value);
        const kept = await rerollForActor(actor, currentTotal, { skillName: skillA, mods: modsA, kind: "skill", flavor: `Stratégie — ${this._pendingStrategie.campALabel}` });
        this._pendingStrategie.totalA = kept;
        this.render();
      });
      html.on("click", "[data-action='rerollStrategieB']", async () => {
        const { commBId, modsB, skillB } = this._pendingStrategie;
        const actor = commBId ? game.actors.get(commBId) : null;
        const input = html.find(".mc-pending-b")[0];
        const currentTotal = Number(input.value);
        const kept = await rerollForActor(actor, currentTotal, { skillName: skillB, mods: modsB, kind: "skill", flavor: `Stratégie — ${this._pendingStrategie.campBLabel}` });
        this._pendingStrategie.totalB = kept;
        this.render();
      });

      html.on("click", "[data-action='confirmStrategie']", async () => {
        const totalA = Number(html.find(".mc-pending-a")[0].value);
        const totalB = Number(html.find(".mc-pending-b")[0].value);
        const { campALabel, campBLabel } = this._pendingStrategie;
        await applyPatch("applyStrategieResult", { campATotal: totalA, campBTotal: totalB, campALabel, campBLabel });
        this._pendingStrategie = null;
        const state = getState();
        if ((state.moraleQueue || []).length > 0) {
          this._view = "morale";
        } else {
          this._view = "round";
          await this._postRoundRecap(state);
          await applyPatch("snapshotRoundStart");
        }
        this.render();
      });

      html.on("click", "[data-action='cancelStrategie']", () => {
        this._pendingStrategie = null;
        this.render();
      });

      html.on("click", "[data-action='rollMorale']", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        const state = getState();
        const camp = state.camps.find(c => c.id === campId);
        const marqueursPerdus = camp.startMarkers - camp.forceMarkers;
        const mods = [
          { label: "Marqueurs de forces perdus", value: -marqueursPerdus },
          ...(camp.moraleMods || []),
          ...(camp.fearless ? [{ label: "Morts-vivants / sans peur", value: 2 }] : []),
          ...(camp.fortified ? [{ label: "Fortifié", value: 2 }] : []),
          ...(camp.pinned ? [{ label: "Acculé", value: 2 }] : []),
        ];
        const modsHint = describeMods(mods);
        const commandant = camp.commandantId ? game.actors.get(camp.commandantId) : null;
        const total = await rollAttributeForActor(commandant, MC_CONFIG.ATTRIBUTE_AME, mods, `Jet de Moral — ${camp.name}`);
        if (total === null) { ui.notifications.warn("Jet annulé."); return; }
        this._pendingMorale ??= {};
        this._pendingMorale[campId] = { total, campName: camp.name, modsHint, commandantId: camp.commandantId ?? null, mods };
        this.render();
      });

      html.on("click", "[data-action='addD6Morale']", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        const input = html.find(`.mc-pending-morale-total[data-camp='${campId}']`)[0];
        await rollExplodingD6AndAdd(input);
      });

      html.on("click", "[data-action='rerollMorale']", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        const pending = this._pendingMorale?.[campId];
        if (!pending) return;
        const actor = pending.commandantId ? game.actors.get(pending.commandantId) : null;
        const input = html.find(`.mc-pending-morale-total[data-camp='${campId}']`)[0];
        const currentTotal = Number(input.value);
        const kept = await rerollForActor(actor, currentTotal, { attributeKey: MC_CONFIG.ATTRIBUTE_AME, mods: pending.mods, kind: "attribute", flavor: `Jet de Moral — ${pending.campName}` });
        this._pendingMorale[campId].total = kept;
        this.render();
      });

      html.on("click", "[data-action='confirmMorale']", async (ev) => {
        const campId = ev.currentTarget.dataset.camp;
        const totalInput = html.find(`.mc-pending-morale-total[data-camp='${campId}']`)[0];
        const critInput = html.find(`.mc-pending-morale-crit[data-camp='${campId}']`)[0];
        const total = Number(totalInput.value);
        const critFail = !!critInput?.checked;
        await applyPatch("applyMoraleResult", campId, total, MC_CONFIG.TARGET_NUMBER, critFail);
        delete this._pendingMorale[campId];
        const state = getState();
        if ((state.moraleQueue || []).length === 0) {
          this._view = "round";
          await this._postRoundRecap(state);
          await applyPatch("snapshotRoundStart");
        }
        this.render();
      });

      html.on("click", "[data-action='cancelMorale']", (ev) => {
        delete this._pendingMorale?.[ev.currentTarget.dataset.camp];
        this.render();
      });

      html.on("click", "[data-action='rollEffets']", async () => {
        const { total, name, text } = rollEffetsTable();
        await ChatMessage.create({ content: `<h3>Effets des combats (${total})</h3><p><strong>${name}</strong> — ${text}</p>` });
        await applyPatch("logMessage", `Table Effets des combats : ${total} — ${name}.`);
        this.render();
      });
    }

    /**
     * Résout une Action de combat confirmée (Joker allié ou adverse) en
     * bonus/malus concret + conséquence physique, selon la vraie règle :
     *  - Échec critique (1 naturel) : jet sur la table Effets des combats
     *    + 1d4+1 Blessures (ou Fatigue si l'option est active).
     *  - Échec simple (< TN) : aucun bonus, 1 Blessure (ou Fatigue).
     *  - Succès (TN à TN+3) : +1 au prochain jet de Stratégie, 1 Fatigue
     *    ("Bleus et bosses" — toujours de la Fatigue, jamais de Blessure).
     *  - Prouesse (TN+4 ou plus) : indemne, choix entre la table Effets des
     *    combats ou +2 de Soutien.
     */
    async _resolveActionOutcome(participantId, campId, actorId, actorName, total, skillName, critFail) {
      const state = getState();
      const onlyFatigue = !!state.config?.onlyFatigueForJokers;
      const kind = onlyFatigue ? "fatigue" : "wound";
      const kindLabel = kind === "fatigue" ? "Fatigue" : "Blessure(s)";
      let summary;

      if (critFail) {
        const woundRoll = await (new Roll("1d4+1")).evaluate();
        await woundRoll.toMessage({ flavor: `Échec critique de ${actorName} en Action de combat` });
        const effet = rollEffetsTable();
        await ChatMessage.create({ content: `<h3>Effets des combats (${effet.total}) — Échec critique de ${actorName}</h3><p><strong>${effet.name}</strong> — ${effet.text}</p>` });
        await applyPatch("applyActionEffets", campId, effet);
        await this._applyInjury(actorId, actorName, kind, woundRoll.total, "échec critique en Action de combat");
        summary = `Échec critique — ${effet.name}, ${woundRoll.total} ${kindLabel}`;
      } else if (total < MC_CONFIG.TARGET_NUMBER) {
        await this._applyInjury(actorId, actorName, kind, 1, "échec en Action de combat");
        summary = `Échec — 1 ${kindLabel}`;
      } else if (total >= MC_CONFIG.TARGET_NUMBER + 4) {
        const choice = await new Promise((resolve) => {
          new Dialog({
            title: "Prouesse en Action de combat !",
            content: `<p>${actorName} obtient une Prouesse (${total}). Choisis l'effet (règle p. 96) :</p>`,
            buttons: {
              table: { label: "🎲 Table Effets des combats", callback: () => resolve("table") },
              bonus: { label: "+2 Soutien", callback: () => resolve("bonus") },
            },
            default: "bonus",
            close: () => resolve("bonus"),
          }).render(true);
        });
        if (choice === "table") {
          const effet = rollEffetsTable();
          await ChatMessage.create({ content: `<h3>Effets des combats (${effet.total}) — ${actorName}</h3><p><strong>${effet.name}</strong> — ${effet.text}</p>` });
          await applyPatch("applyActionEffets", campId, effet);
          summary = `Prouesse — Effets : ${effet.name}`;
        } else {
          await applyPatch("queueActionMod", campId, `Action de ${actorName} (Prouesse)`, 2);
          summary = "Prouesse (+2)";
        }
      } else {
        await applyPatch("queueActionMod", campId, `Action de ${actorName}`, 1);
        await this._applyInjury(actorId, actorName, "fatigue", 1, "Action de combat");
        summary = "Succès (+1), 1 Fatigue";
      }

      await applyPatch("markParticipantDone", participantId, summary);
    }

    /** Applique N niveaux de Blessure ou de Fatigue sur la fiche, si le
     *  champ correspondant (natif et stable dans SWADE) est trouvé. */
    async _applyInjury(actorId, actorName, kind, amount, context) {
      const actor = actorId ? game.actors.get(actorId) : null;
      if (!actor) return;
      try {
        if (kind === "fatigue") {
          const fatigue = actor.system?.fatigue;
          if (fatigue && typeof fatigue.value === "number") {
            const newVal = fatigue.max != null ? Math.min(fatigue.value + amount, fatigue.max) : fatigue.value + amount;
            await actor.update({ "system.fatigue.value": newVal });
            await applyPatch("logMessage", `${actorName} encaisse ${amount} niveau(x) de Fatigue (${context}).`);
          }
        } else {
          const wounds = actor.system?.wounds;
          if (wounds && typeof wounds.value === "number") {
            await actor.update({ "system.wounds.value": wounds.value + amount });
            await applyPatch("logMessage", `${actorName} encaisse ${amount} Blessure(s) (${context}) !`);
          }
        }
      } catch (err) {
        console.warn("Combats de masse | Impossible d'appliquer la Blessure/Fatigue automatiquement", err);
      }
    }

    /** Poste dans le chat un récapitulatif lisible du round (ou du combat
     *  s'il se termine) : marqueurs perdus/restants par camp. */
    async _postRoundRecap(state, { final = false } = {}) {
      const start = state.roundStartMarkers || {};
      const rows = state.camps.map(camp => {
        const before = start[camp.id] ?? camp.forceMarkers;
        const lost = Math.max(0, before - camp.forceMarkers);
        return `<tr>
          <td style="padding:3px 10px; border-bottom:1px solid #ccc;"><strong style="color:${camp.color}">${camp.name}</strong></td>
          <td style="padding:3px 10px; text-align:center; border-bottom:1px solid #ccc;">${lost}</td>
          <td style="padding:3px 10px; text-align:center; border-bottom:1px solid #ccc;"><strong>${camp.forceMarkers}</strong> / ${camp.startMarkers}</td>
          <td style="padding:3px 10px; text-align:center; border-bottom:1px solid #ccc;">${camp.routed ? "🏳 En déroute" : "—"}</td>
        </tr>`;
      }).join("");
      const title = final ? "Combat de masse terminé" : `Bilan du round ${state.round}`;
      const content = `
        <div style="border:2px solid #7a1f1f; border-radius:8px; padding:10px; background:rgba(122,31,31,0.05);">
          <h2 style="margin:0 0 8px 0; text-align:center;">⚔️ ${title}</h2>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid #7a1f1f;">
                <th style="text-align:left; padding:3px 10px;">Camp</th>
                <th style="padding:3px 10px;">Marqueurs perdus</th>
                <th style="padding:3px 10px;">Marqueurs restants</th>
                <th style="padding:3px 10px;">Statut</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      await ChatMessage.create({ content });
    }
  }

  // ==========================================================================
  // 8. STYLE (réinjecté à chaque exécution pour prendre en compte les mises
  //    à jour du CSS sans avoir à recharger la page)
  // ==========================================================================
  document.getElementById("mc-style")?.remove();
  const style = document.createElement("style");
  style.id = "mc-style";
  style.textContent = `
    .mc-app { font-size: 13px; }
    .mc-camps { display: flex; gap: 8px; flex-wrap: wrap; }
    .mc-camp { border: 2px solid #666; border-radius: 6px; padding: 6px 10px; flex: 1; min-width: 180px; margin-bottom: 6px; }
    .mc-camp h3, .mc-camp h4 { margin: 0 0 4px 0; }
    .mc-camp-compact .mc-camp-summary { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; }
    .mc-strategie-skill-row { font-size: 11px; margin: 4px 0; }
    .mc-tag { font-size: 10px; background: rgba(0,0,0,0.08); border-radius: 10px; padding: 1px 8px; }
    .mc-mods-readonly { font-size: 11px; opacity: 0.8; }
    .mc-routed { color: #b30000; font-weight: bold; }
    .mc-flags label { display: block; font-size: 11px; }
    .mc-mods ul { margin: 2px 0; padding-left: 16px; }
    .mc-add-mod input { margin-right: 4px; width: auto; }
    .mc-big-btn { display: block; width: 100%; margin: 6px 0; font-weight: bold; }
    .mc-small { font-size: 11px; margin-top: 6px; }
    .mc-footer-actions { display: flex; gap: 8px; align-items: center; }
    .mc-danger { color: #b30000; border-color: #b30000; }
    .mc-log { max-height: 180px; overflow-y: auto; border: 1px solid #999; padding: 4px; background: rgba(0,0,0,0.03); }
    .mc-log-entry { font-size: 11px; margin-bottom: 2px; }
    .mc-log-round { font-weight: bold; margin-right: 4px; }
    .mc-hidden-note { opacity: 0.7; }
    .mc-resources label { display: block; margin: 4px 0; }
    .mc-help { font-size: 11px; opacity: 0.8; }
    .mc-manual-note { font-size: 10px; opacity: 0.7; margin: 0 4px; }
    .mc-mods-hint { font-size: 11px; opacity: 0.85; font-style: italic; }
    .mc-pending { margin: 8px 0; padding: 8px; border: 2px solid #b8860b; border-radius: 6px; background: rgba(184,134,11,0.08); }
    .mc-pending-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 4px 0; }
    .mc-pending input[type=number] { width: 60px; }
    .mc-d6-btn { font-size: 11px; }
    .mc-onetime-mods { border-color: #4a7a4a; }
    .mc-config-line { display: block; font-size: 11px; margin: 4px 0; }
    .mc-add-participant { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .mc-participant-list { list-style: none; margin: 0; padding: 0; }
    .mc-participant { border: 1px solid #888; border-radius: 4px; padding: 4px 6px; margin-bottom: 4px; }
    .mc-participant-done { opacity: 0.75; border-color: #4a7a4a; }
    .mc-participant-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .mc-participant-row a { margin-left: auto; cursor: pointer; opacity: 0.6; }
    .mc-status-pending { color: #b8860b; font-size: 11px; }
    .mc-status-done { color: #2e7d32; font-size: 11px; }
    .mc-participant-controls { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .mc-warning { color: #b8860b; font-weight: bold; font-size: 12px; }
    .mc-nav { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid #999; padding-bottom: 8px; }
    .mc-nav-btn { flex: 1; padding: 6px 4px; font-size: 12px; }
    .mc-nav-active { font-weight: bold; border-bottom: 3px solid currentColor; }
    .mc-nav-alert { color: #b8860b; border-color: #b8860b; }
    .mc-setup-view h4 { margin: 8px 0 2px 0; }
    .mc-setup-view .mc-camp { margin-bottom: 10px; }
    .mc-setup-name, .mc-setup-markers { display: block; margin: 2px 0; width: 100%; box-sizing: border-box; }
    .mc-setup-color { width: 60px; }
    .mc-link-btn { display: block; width: 100%; margin: 6px 0; background: none; border: 1px dashed #666; font-size: 12px; padding: 4px; }
    .mc-link-alert { border-color: #b8860b; color: #b8860b; }
    .mc-round-tools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 6px 0; }
    .mc-round-tools select { font-size: 11px; }
  `;
  document.head.appendChild(style);

  // ==========================================================================
  // 9. LANCEMENT — on ferme/recrée systématiquement pour que relancer la
  //    macro applique bien le code le plus récent (pas besoin de F5).
  // ==========================================================================
  if (window.__mcApp) {
    try { window.__mcApp.close({ force: true }); } catch (err) { /* déjà fermée */ }
  }
  window.__mcApp = new MassCombatApp();

  if (window.__mcUpdateHook) {
    Hooks.off("updateSetting", window.__mcUpdateHook);
  }
  window.__mcUpdateHook = (setting) => {
    if (setting.key === `${MC_CONFIG.NAMESPACE}.${SETTING_KEY}` && window.__mcApp?.rendered) {
      window.__mcApp.render();
    }
  };
  Hooks.on("updateSetting", window.__mcUpdateHook);

  window.__mcApp.render(true, { focus: true });

})();