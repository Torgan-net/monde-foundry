/**
 * ============================================================================
 *  COMBATS DE MASSE — SWADE (Foundry VTT)
 *  Version : 2.12.0 — 2026-11-05
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
 *    2.7.0 — Corrections d'usage :
 *              - Dépense de Jeton : tentative de plusieurs points d'entrée
 *                natifs plausibles (actor.spendBenny, game.swade.bennies...)
 *                avant de retomber sur la mise à jour directe + notre
 *                propre effet visuel — sans garantie totale, l'API exacte
 *                n'ayant pas pu être confirmée.
 *              - Le récapitulatif de round dans le chat est reconstruit en
 *                blocs empilés par camp (au lieu d'un tableau à 4 colonnes)
 *                pour rester lisible dans une colonne de chat étroite ; le
 *                statut affiche maintenant aussi les drapeaux actifs
 *                (Fortifié, Sans peur, Acculé) et pas seulement la déroute.
 *              - Amélioration de la lisibilité générale (taille de police,
 *                interlignage) et des boîtes de dialogue de la macro
 *                elle-même (fin de combat, choix de Prouesse) — celles du
 *                système SWADE restent hors de notre contrôle.
 *    2.7.1 — Le +1px précédent ne se voyait quasiment pas et ne touchait
 *            pas les boutons/inputs (styles Foundry par défaut plus
 *            prioritaires). Passe visuelle bien plus marquée sur toute la
 *            fenêtre de l'outil : police et interligne nettement plus
 *            grands (avec !important pour passer devant les styles par
 *            défaut), titres de section soulignés, bouton d'action
 *            principal en rouge plein, cartes de camp avec ombre légère,
 *            fenêtre élargie (580px) pour accueillir tout ça sans que le
 *            texte ne se tasse.
 *
 *    2.8.0 — Jets délégués aux joueurs + ergonomie petits écrans :
 *              - Cause du "la fenêtre de jet n'apparaît pas chez le
 *                joueur" : si le joueur n'a pas exécuté la macro depuis le
 *                chargement de sa page, rien n'écoute chez lui et le MJ
 *                attendait sans fin. Le MJ vérifie maintenant d'abord que
 *                le joueur répond (ping) ; sinon un message lui est
 *                chuchoté et le MJ peut réessayer, lancer à sa place ou
 *                annuler. Délai max de 5 min sur un jet délégué.
 *              - Côté joueur : notification sonore + petite fenêtre "Le MJ
 *                demande un jet" avant d'ouvrir la boîte de dialogue SWADE.
 *              - Les relais socketlib sont désormais enregistrés nom par
 *                nom (un nouveau relais comme mc_ping est bien ajouté même
 *                si la session avait déjà chargé une ancienne version).
 *              - IHM compacte : tableau de bord des 2 camps (barre de
 *                marqueurs, drapeaux en icônes, bonus en attente en
 *                pastille), participants sur une ligne, confirmation de jet
 *                en icônes, aides en infobulle ⓘ, outils et journal repliés
 *                (état mémorisé), fenêtre 440 px redimensionnable et mise
 *                en page adaptative (2 colonnes si large, 1 si étroit).
 *              - Petites boîtes de dialogue de la macro en DialogV2
 *                (repli Dialog V1).
 *
 *    2.9.0 — Mode spectateur pour les joueurs :
 *              - Au démarrage d'un combat (et via 🧰 Outils > "📣 Inviter
 *                les joueurs à suivre"), une carte est postée dans le chat
 *                avec un lien vers la macro : un clic l'exécute et ouvre le
 *                panneau de suivi. Chez les joueurs qui ont déjà la macro
 *                chargée, la fenêtre s'ouvre directement.
 *              - Panneau joueur en lecture seule : plus d'ajout/retrait de
 *                participants (le MJ décide) ; seul reste le jet de leurs
 *                propres personnages. Ligne d'état de la phase en cours.
 *              - Rafraîchissement en direct aussi au tout premier
 *                enregistrement de l'état (hook createSetting, en plus de
 *                updateSetting).
 *
 *    2.10.0 — Confort de jeu round après round :
 *              - Les Jokers ajoutés à l'Action de combat RESTENT inscrits
 *                d'un round à l'autre (remis "en attente" après le jet de
 *                Stratégie) ; on retire au besoin avec ✕.
 *              - La compétence choisie pour chaque Joker (et celle de
 *                Stratégie de chaque commandant) est mémorisée dans l'état
 *                partagé : plus de retour à la première de la liste à
 *                chaque rafraîchissement, d'un round à l'autre comme après
 *                rechargement de la macro.
 *              - Le jet en attente de validation est désormais PARTAGÉ :
 *                le joueur voit son total et peut relancer avec un Jeton
 *                (ou ajouter +d6) depuis son propre écran, sans attendre le
 *                MJ ; le MJ garde la validation (✔, ☠, ✖) et la correction
 *                du total, répercutée chez le joueur.
 *
 *    2.11.0 — Pertes et issue du combat :
 *              - Juste après le jet de Stratégie (avant les Moral), une
 *                carte de chat donne explicitement les unités de combat
 *                perdues par chaque camp ; le tableau de bord affiche aussi
 *                "−n ce round" sur chaque camp.
 *              - Fin du combat selon les règles : un camp à 0 marqueur, ou
 *                un échec au jet de Moral (retraite ; échec critique =
 *                déroute) ; deux échecs/anéantissements → aucun vainqueur.
 *                Le combat est alors verrouillé (bannière "Combat terminé"
 *                + bouton "Nouveau combat").
 *              - Carte d'issue dans le chat : vainqueur, récit court,
 *                nombre de rounds, unités restantes, hauts faits.
 *
 *    2.12.0 — Case "⚙ Sans moral" par camp (Configuration) : machines,
 *             insectes, zombies… Ce camp ne fait jamais de jet de Moral
 *             (après la Stratégie comme après "Une armée à lui seul"), donc
 *             ne peut ni battre en retraite ni être mis en déroute : il se
 *             bat jusqu'à son dernier marqueur. L'outil MJ "Forcer un
 *             Moral" reste possible si le MJ le décide explicitement.
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

  // Document Macro en cours d'exécution (dans une macro script, `this` est la
  // Macro ; la fonction fléchée en hérite). Sert à poster un lien cliquable
  // vers cette macro dans le chat.
  const MC_MACRO_DOC = (typeof Macro !== "undefined" && this instanceof Macro) ? this : null;

  // ==========================================================================
  // 0. CONFIGURATION — à adapter si besoin
  // ==========================================================================
  const MC_CONFIG = {
    VERSION: "2.12.0",
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
          fortified: false, fearless: false, pinned: false, noMorale: false, routed: false },
        { id: "B", name: "Camp B", color: "#1f3a5f", forceMarkers: 10, startMarkers: 10,
          modifiers: [], actionMods: [], moraleMods: [], commandantId: null,
          fortified: false, fearless: false, pinned: false, noMorale: false, routed: false },
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
      // Historique des jets de Stratégie (pour le récap de fin de combat)
      history: [],   // { round, totalA, totalB, lossA, lossB, winnerId|null, prowess }
      highlights: [], // { round, actorName, campId, summary } — Prouesses, échecs critiques
      moraleFailures: [], // { campId, crit } — échecs de Moral du round en cours
      // Fin de combat : { type, winnerId, loserId, reason, round } ou null
      ended: null,
      endAnnounced: false,
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

  // Enregistrement NOM PAR NOM (et non plus "tout ou rien" derrière un seul
  // drapeau) : ainsi une nouvelle version qui ajoute un relais (ex :
  // mc_ping) l'enregistre bien, même si la session avait déjà chargé une
  // version plus ancienne de la macro.
  window.__mcRegistered ??= new Set(window.__mcSocketHandlersRegistered
    ? ["mc_applyPatch", "mc_requestRoll", "mc_spendBennyAndReroll"] : []);
  const MC_RELAYS = {
    mc_applyPatch: async (patchFn, args) => await window.__mcHandlers.applyPatch(patchFn, args),
    mc_requestRoll: async (payload) => await window.__mcHandlers.requestRoll(payload),
    mc_spendBennyAndReroll: async (payload) => await window.__mcHandlers.spendBennyAndReroll(payload),
    mc_ping: async () => await window.__mcHandlers.ping(),
    mc_openView: async () => await window.__mcHandlers.openView(),
  };
  for (const [name, relay] of Object.entries(MC_RELAYS)) {
    if (window.__mcRegistered.has(name)) continue;
    mcSocket.register(name, relay);
    window.__mcRegistered.add(name);
  }
  window.__mcSocketHandlersRegistered = true;

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
    async openView() {
      // Le MJ invite à suivre : on ouvre (ou ramène au premier plan) la
      // fenêtre chez les joueurs qui ont déjà la macro chargée.
      if (game.user.isGM) return false;
      window.__mcApp?.render(true, { focus: true });
      return true;
    },
    async ping() {
      // Permet au MJ de vérifier, AVANT de déléguer un jet, que ce joueur a
      // bien la macro chargée dans sa page (sinon personne ne répondrait et
      // le MJ attendrait indéfiniment).
      return { version: MC_CONFIG.VERSION, user: game.user.name };
    },
    async requestRoll(payload) {
      // Exécuté sur le client du JOUEUR ciblé. On le PRÉVIENT d'abord
      // (petite fenêtre + son), puis on ouvre SA boîte de dialogue standard
      // SWADE sur SON écran.
      const { actorId, skillName, attributeKey, mods, kind, flavor } = payload;
      const actor = game.actors.get(actorId);
      const what = kind === "attribute" ? "Âme" : (skillName === UNSKILLED_VALUE ? "Unskilled attempt" : skillName);
      const go = await askPlayerToRoll(actor, flavor, what);
      if (!go) return null;
      if (kind === "attribute") return await rollAttributeTotal(actor, attributeKey, mods || [], flavor);
      return await rollSkillTotal(actor, skillName, mods || [], flavor);
    },
    async spendBennyAndReroll(payload) {
      // Exécuté sur le client du JOUEUR ciblé : dépense SON Jeton et relance
      // SA boîte de dialogue standard, sur SON écran.
      const { actorId, currentTotal, skillName, attributeKey, mods, kind, flavor } = payload;
      const actor = game.actors.get(actorId);
      if (!actor) return currentTotal;
      const go = await askPlayerToRoll(actor, `${flavor} — relance avec un Jeton`, kind === "attribute" ? "Âme" : skillName);
      if (!go) return currentTotal;
      return await spendBennyAndReroll(actor, currentTotal, async () => {
        if (kind === "attribute") return await rollAttributeTotal(actor, attributeKey, mods || [], flavor);
        return await rollSkillTotal(actor, skillName, mods || [], flavor);
      });
    },
  };

  /** Ajoute un camp à la file des jets de Moral — sauf s'il est réglé
   *  "Sans moral" (machines, insectes, zombies…) : il ne fait jamais de jet
   *  de Moral, donc ne peut ni battre en retraite ni être mis en déroute ;
   *  il se bat jusqu'à son dernier marqueur. Retourne true si mis en file. */
  function queueMoraleFor(state, camp, { force = false } = {}) {
    if (!camp || state.ended) return false;
    if (camp.noMorale && !force) {
      addLog(state, `${camp.name} n'a pas de moral : pas de jet de Moral.`);
      return false;
    }
    state.moraleQueue ??= [];
    if (!state.moraleQueue.includes(camp.id)) state.moraleQueue.push(camp.id);
    return true;
  }

  /** Marque la fin du combat (une seule fois). Plus de Moral à faire. */
  function setEnded(state, ended) {
    if (state.ended) return state;
    state.ended = { ...ended, round: state.round };
    state.moraleQueue = [];
    state.moraleFailures = [];
    for (const p of (state.roundActions || [])) p.pending = null;
    addLog(state, "🏁 Fin du combat de masse.");
    return state;
  }

  /** Un camp à 0 marqueur → combat terminé (les deux à 0 → anéantissement mutuel). */
  function checkAnnihilation(state) {
    if (state.ended) return state;
    const [a, b] = state.camps;
    const deadA = a.forceMarkers <= 0, deadB = b.forceMarkers <= 0;
    if (deadA && deadB) return setEnded(state, { type: "mutual", reason: "annihilated", winnerId: null, loserId: null });
    if (deadA) return setEnded(state, { type: "victory", reason: "annihilated", winnerId: b.id, loserId: a.id });
    if (deadB) return setEnded(state, { type: "victory", reason: "annihilated", winnerId: a.id, loserId: b.id });
    return state;
  }

  // Fonctions de mutation d'état, exécutées côté MJ uniquement, appelées
  // soit localement (si l'utilisateur courant est MJ), soit via socket.
  const MC_PATCHERS = {
    markEndAnnounced(state) {
      state.endAnnounced = true;
      return state;
    },

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
      state.history = [];
      state.highlights = [];
      state.moraleFailures = [];
      state.ended = null;
      state.endAnnounced = false;
      for (const c of state.camps) { c.routed = false; c.retreated = false; }
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
      if (flag === "noMorale") {
        addLog(state, value ? `${camp.name} est réglé "Sans moral" : aucun jet de Moral.` : `${camp.name} fait de nouveau ses jets de Moral.`);
        // Décoché/coché en cours de round : on retire un Moral en attente.
        if (value) state.moraleQueue = (state.moraleQueue || []).filter(id => id !== campId);
      }
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
      if ((camp.commandantId || null) !== (actorId || null)) camp.strategieSkill = null;
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
      addLog(state, `${actorName} rejoint l'Action de combat pour ${camp?.name ?? "?"} (reste inscrit d'un round à l'autre).`);
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
      if (p) {
        p.status = "done"; p.summary = summary; p.pending = null;
        if (/^(Prouesse|Échec critique)/.test(summary || "")) {
          state.highlights ??= [];
          state.highlights.push({ round: state.round + 1, actorName: p.actorName, campId: p.campId, summary });
        }
      }
      return state;
    },

    /** Compétence choisie pour un participant : stockée dans l'état partagé,
     *  donc conservée entre les rendus, les rounds, et visible MJ + joueur. */
    setParticipantSkill(state, participantId, skill) {
      const p = (state.roundActions || []).find(x => x.id === participantId);
      if (p) p.skill = skill || null;
      return state;
    },

    /** Jet en attente de validation (partagé : le joueur peut relancer avec
     *  un Jeton depuis SON client sans attendre le MJ). pending = null pour
     *  effacer. */
    setParticipantPending(state, participantId, pending) {
      const p = (state.roundActions || []).find(x => x.id === participantId);
      if (p) p.pending = pending ? { ...(p.pending || {}), ...pending } : null;
      return state;
    },

    setStrategieSkill(state, campId, skill) {
      const camp = state.camps.find(c => c.id === campId);
      if (camp) camp.strategieSkill = skill || null;
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
          addLog(state, `${enemyCamp.name} perd immédiatement 1 marqueur de forces (Une armée à lui seul) !${enemyCamp.noMorale ? "" : ` Un jet de Moral est à faire pour ${enemyCamp.name} même s'il remporte le round.`}`);
          queueMoraleFor(state, enemyCamp);
          checkAnnihilation(state);
          break;
      }
      return state;
    },

    // ---- Moral ----

    queueMoraleCheck(state, campId) {
      // Outil MJ "Forcer un Moral" : décision explicite, appliquée même à un
      // camp réglé "Sans moral".
      queueMoraleFor(state, state.camps.find(c => c.id === campId), { force: true });
      return state;
    },

    applyStrategieResult(state, resultPayload) {
      const { campATotal, campBTotal, campALabel, campBLabel } = resultPayload;
      state.round += 1;
      const diff = campATotal - campBTotal;
      const [campA, campB] = state.camps;
      const beforeA = campA.forceMarkers, beforeB = campB.forceMarkers;
      let winnerId = null, prowess = false;
      state.moraleQueue ??= [];
      state.moraleFailures = [];
      const queueMorale = (camp) => queueMoraleFor(state, camp);
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
        winnerId = winner.id;
        prowess = margin >= 4;
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
      state.history ??= [];
      state.history.push({
        round: state.round, totalA: campATotal, totalB: campBTotal,
        lossA: beforeA - campA.forceMarkers, lossB: beforeB - campB.forceMarkers,
        winnerId, prowess,
      });
      checkAnnihilation(state);
      campA.actionMods = [];
      campB.actionMods = [];
      // Les participants RESTENT d'un round à l'autre (plus simple d'en
      // retirer que d'en rajouter) : on les remet simplement en attente, en
      // gardant camp et compétence choisie.
      for (const p of (state.roundActions || [])) {
        p.status = "pending"; p.summary = null; p.pending = null;
      }
      return state;
    },

    applyMoraleResult(state, campId, total, target, critFail) {
      const camp = state.camps.find(c => c.id === campId);
      state.moraleFailures ??= [];
      if (critFail) {
        camp.routed = true;
        state.moraleFailures.push({ campId, crit: true });
        addLog(state, `Moral de ${camp.name} : échec critique (${total} vs ${target}) — l'armée est en déroute !`);
      } else if (total < target) {
        camp.retreated = true;
        state.moraleFailures.push({ campId, crit: false });
        addLog(state, `Moral de ${camp.name} : échec (${total} vs ${target}) — l'armée entame une retraite en ordre.`);
      } else {
        addLog(state, `Moral de ${camp.name} : succès (${total} vs ${target}) — les troupes tiennent leurs positions.`);
      }
      camp.moraleMods = [];
      state.moraleQueue = (state.moraleQueue || []).filter(id => id !== campId);
      // Tous les Moral du round sont faits : un échec met fin au combat
      // (retraite ou déroute) ; deux échecs → les deux armées se retirent.
      if (!state.ended && state.moraleQueue.length === 0 && state.moraleFailures.length) {
        const fails = state.moraleFailures;
        if (fails.length >= 2) {
          setEnded(state, { type: "mutual", reason: "retreat", winnerId: null, loserId: null });
        } else {
          const loserId = fails[0].campId;
          const winnerId = state.camps.find(c => c.id !== loserId)?.id ?? null;
          setEnded(state, { type: "victory", reason: fails[0].crit ? "rout" : "retreat", winnerId, loserId });
        }
      }
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

  // --------------------------------------------------------------------------
  //  Petites boîtes de choix de la macro (DialogV2 si dispo, Dialog V1 sinon)
  // --------------------------------------------------------------------------
  async function mcChoose({ title, content, buttons, defaultAction }) {
    const DV2 = foundry?.applications?.api?.DialogV2;
    if (DV2?.wait) {
      try {
        const res = await DV2.wait({
          window: { title },
          classes: ["mc-dialog"],
          content,
          buttons: buttons.map(b => ({ action: b.action, label: b.label, default: b.action === defaultAction })),
          rejectClose: false,
        });
        return res ?? null;
      } catch (err) {
        console.warn("Combats de masse | DialogV2 indisponible, repli sur Dialog V1", err);
      }
    }
    return await new Promise(resolve => {
      new Dialog({
        title, content,
        buttons: Object.fromEntries(buttons.map(b => [b.action, { label: b.label, callback: () => resolve(b.action) }])),
        default: defaultAction,
        close: () => resolve(null),
      }, { classes: ["mc-dialog"] }).render(true);
    });
  }

  function mcPlayNotify() {
    try {
      const AH = foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;
      AH?.play({ src: CONFIG.sounds?.notification ?? "sounds/notify.wav", volume: 0.8, autoplay: true, loop: false }, false);
    } catch (err) { /* son facultatif */ }
  }

  /** Côté JOUEUR : prévient qu'un jet est demandé, avant d'ouvrir la boîte
   *  de dialogue standard (sinon elle peut passer inaperçue, ou s'ouvrir
   *  derrière d'autres fenêtres). */
  async function askPlayerToRoll(actor, flavor, what) {
    mcPlayNotify();
    const choice = await mcChoose({
      title: "Combats de masse — jet demandé",
      content: `<div class="mc-dialog-body">
        <p class="mc-dialog-lead">🎲 Le MJ demande un jet</p>
        <p><strong>${actor?.name ?? "?"}</strong> — ${what ?? ""}</p>
        <p class="mc-dialog-sub">${flavor ?? ""}</p>
      </div>`,
      buttons: [{ action: "roll", label: "🎲 Ouvrir le jet" }, { action: "skip", label: "Refuser" }],
      defaultAction: "roll",
    });
    return choice === "roll";
  }

  const MC_TIMEOUT = Symbol("timeout");
  function withTimeout(promise, ms) {
    return Promise.race([
      Promise.resolve(promise).catch(err => { console.warn("Combats de masse | appel socket en échec", err); return MC_TIMEOUT; }),
      new Promise(resolve => setTimeout(() => resolve(MC_TIMEOUT), ms)),
    ]);
  }

  /** Le joueur a-t-il la macro chargée dans sa page ? (réponse en < 2,5 s) */
  async function pingUser(userId) {
    const pong = await withTimeout(mcSocket.executeAsUser("mc_ping", userId), 2500);
    return pong === MC_TIMEOUT ? null : pong;
  }

  /**
   * Délégation d'un jet au joueur propriétaire de l'acteur.
   *  - Retourne { local: true } si le jet doit se faire sur CE client (pas de
   *    joueur connecté propriétaire, ou c'est nous, ou le MJ choisit de
   *    lancer à sa place).
   *  - Sinon { local: false, result } — result = null si annulé / sans
   *    réponse.
   * Cause n°1 de "la fenêtre de jet n'apparaît pas chez le joueur" : le
   * joueur n'a pas exécuté la macro depuis le chargement de sa page, donc
   * aucun code n'écoute chez lui. On le détecte maintenant (ping) au lieu
   * d'attendre indéfiniment.
   */
  async function delegateToOwner(actor, relayName, payload) {
    const owner = findOwningUser(actor);
    if (!owner || owner.id === game.user.id) return { local: true };

    let warned = false;
    while (true) {
      const pong = await pingUser(owner.id);
      if (pong) {
        if (pong.version !== MC_CONFIG.VERSION) {
          ui.notifications.warn(`${owner.name} utilise la v${pong.version} de la macro (toi : v${MC_CONFIG.VERSION}) — demande-lui de la relancer.`);
        }
        break;
      }
      if (!warned) {
        warned = true;
        await ChatMessage.create({
          content: `<div class="mc-chat-call">🎲 <strong>${owner.name}</strong> : le MJ attend ton jet pour <strong>${actor.name}</strong>. Ouvre (ou relance) la macro <em>Combats de masse</em>.</div>`,
          whisper: [owner.id, ...game.users.filter(u => u.isGM).map(u => u.id)],
        });
      }
      const choice = await mcChoose({
        title: "Joueur injoignable",
        content: `<div class="mc-dialog-body">
          <p class="mc-dialog-lead">${owner.name} n'a pas la macro ouverte</p>
          <p>Il faut qu'il exécute la macro <em>Combats de masse</em> au moins une fois depuis le chargement de sa page (après un F5, il faut la relancer). Un message lui a été chuchoté.</p>
        </div>`,
        buttons: [
          { action: "retry", label: "🔁 Réessayer" },
          { action: "local", label: "🎲 Lancer à sa place" },
          { action: "cancel", label: "Annuler" },
        ],
        defaultAction: "retry",
      });
      if (choice === "local") return { local: true };
      if (choice !== "retry") return { local: false, result: null };
    }

    ui.notifications.info(`Jet demandé à ${owner.name} (${actor.name})…`);
    const result = await withTimeout(mcSocket.executeAsUser(relayName, owner.id, payload), 5 * 60 * 1000);
    if (result === MC_TIMEOUT) {
      ui.notifications.warn(`Pas de réponse de ${owner.name} — jet annulé.`);
      return { local: false, result: null };
    }
    return { local: false, result };
  }

  /** Retrouve la Macro (pour le lien) : celle en cours, sinon par contenu. */
  function findThisMacro() {
    if (MC_MACRO_DOC && game.macros.get(MC_MACRO_DOC.id)) return MC_MACRO_DOC;
    return game.macros.find(m => m.type === "script" && m.command?.includes(MC_CONFIG.NAMESPACE)) ?? null;
  }

  /**
   * MJ : invite les joueurs à suivre le combat.
   *  - Chat : carte avec un lien vers la macro (un clic l'exécute et ouvre
   *    le panneau spectateur).
   *  - Les joueurs qui ont DÉJÀ la macro chargée voient la fenêtre s'ouvrir
   *    directement.
   */
  async function inviteSpectators(state) {
    const macro = findThisMacro();
    const players = game.users.filter(u => !u.isGM);
    const cannotSee = macro ? players.filter(u => !macro.testUserPermission(u, "LIMITED")).map(u => u.name) : [];
    const link = macro
      ? `@UUID[${macro.uuid}]{⚔ Suivre le combat de masse}`
      : `<em>ouvrez la macro « Combats de masse »</em>`;
    const camps = (state?.camps ?? []).map(c => `<span style="color:${c.color}; font-weight:bold;">${c.name}</span>`).join(" contre ");
    await ChatMessage.create({
      content: `<div style="border:2px solid #7a1f1f; border-radius:8px; padding:8px 10px; background:rgba(122,31,31,0.05); text-align:center;">
        <div style="font-weight:bold; font-size:15px; margin-bottom:4px;">⚔ Combat de masse</div>
        ${camps ? `<div style="font-size:13px; margin-bottom:6px;">${camps}</div>` : ""}
        <div style="font-size:14px;">${link}</div>
        <div style="font-size:11px; opacity:0.75; margin-top:4px;">Suivi en direct ; les jets de vos personnages vous seront demandés.</div>
      </div>`,
    });
    try { mcSocket.executeForOthers("mc_openView"); } catch (err) { console.warn("Combats de masse | openView", err); }
    if (!macro) {
      ui.notifications.warn("Macro introuvable dans le monde : le message ne contient pas de lien cliquable. Range la macro dans le dossier Macros du monde.");
    } else if (cannotSee.length) {
      ui.notifications.warn(`Ces joueurs n'ont pas accès à la macro (droit Observateur requis) : ${cannotSee.join(", ")}.`);
    }
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
    const d = await delegateToOwner(actor, "mc_requestRoll", { actorId: actor.id, skillName, mods, kind: "skill", flavor });
    if (!d.local) return d.result;
    return await rollSkillTotal(actor, skillName, mods, flavor);
  }

  /** Lance (ou délègue au joueur propriétaire) un jet d'attribut. */
  async function rollAttributeForActor(actor, attributeKey, mods = [], flavor) {
    if (!actor) return await rollAttributeTotal(null, attributeKey, mods, flavor);
    const d = await delegateToOwner(actor, "mc_requestRoll", { actorId: actor.id, attributeKey, mods, kind: "attribute", flavor });
    if (!d.local) return d.result;
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

  /** Petit effet visuel maison (repli uniquement) pour matérialiser la
   *  dépense d'un Jeton, utilisé SEULEMENT si aucune méthode native n'a pu
   *  être appelée (voir spendActorBenny ci-dessous). */
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
   * Dépense 1 Jeton en tentant d'abord les points d'entrée NATIFS plausibles
   * du système (ceux qu'utilisent vraisemblablement le bouton "-" de la
   * fiche et le plateau de Jetons, qui eux déclenchent bien l'animation).
   * On tente plusieurs noms de méthode par sécurité (l'API exacte n'a pas
   * pu être confirmée sans accès direct au système) ; si aucune ne
   * fonctionne, on retombe sur une mise à jour directe du champ + notre
   * propre petit effet visuel de repli.
   */
  async function spendActorBenny(actor) {
    const candidates = [
      () => actor.spendBenny?.(),
      () => game.swade?.bennies?.spend?.(actor),
      () => game.swade?.spendBenny?.(actor),
    ];
    for (const attempt of candidates) {
      try {
        const result = await attempt();
        if (result !== undefined && result !== false) return { ok: true, native: true };
      } catch (err) {
        console.warn("Combats de masse | tentative de dépense native de Jeton échouée, repli sur la suivante.", err);
      }
    }
    const bennies = actor.system?.bennies;
    if (!bennies || (bennies.value ?? 0) <= 0) return { ok: false, native: false };
    await actor.update({ "system.bennies.value": bennies.value - 1 });
    return { ok: true, native: false };
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
    if ((actor.system?.bennies?.value ?? 0) <= 0) {
      ui.notifications.warn(`${actor.name} n'a plus de Jeton disponible.`);
      return currentTotal;
    }
    const { ok, native } = await spendActorBenny(actor);
    if (!ok) {
      ui.notifications.warn(`${actor.name} n'a plus de Jeton disponible.`);
      return currentTotal;
    }
    if (!native) showBennySpendFlourish(actor.name);
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
    const d = await delegateToOwner(actor, "mc_spendBennyAndReroll", { actorId: actor.id, currentTotal, ...rollSpec });
    if (!d.local) return d.result ?? currentTotal;
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

  // --------------------------------------------------------------------------
  //  Blocs réutilisés. IHM compacte : l'essentiel visible, le reste replié
  //  (<details>) ou en infobulle (ⓘ / title) pour tenir sur petit écran.
  // --------------------------------------------------------------------------

  // Tableau de bord des deux camps (barre de marqueurs, drapeaux en icônes,
  // bonus en attente en pastille). `scoreCamps` = camps décorés.
  const SCOREBOARD_BLOCK = `
    <div class="mc-score">
      {{#each scoreCamps as |camp|}}
      <div class="mc-chip {{#if camp.routed}}mc-chip-routed{{/if}}" style="--camp: {{camp.color}}">
        <div class="mc-chip-head">
          <span class="mc-chip-name" title="{{camp.name}}">{{camp.name}}</span>
          {{#if camp.hidden}}
          <span class="mc-chip-count">?</span>
          {{else}}
          <span class="mc-chip-count"><b>{{camp.forceMarkers}}</b>/{{camp.startMarkers}}</span>
          {{/if}}
        </div>
        {{#unless camp.hidden}}
        <div class="mc-bar"><span style="width: {{camp.pct}}%"></span></div>
        <div class="mc-chip-tags">
          {{#if camp.roundLoss}}<span class="mc-flag mc-flag-loss" title="Unités de combat perdues au round {{camp.roundLossRound}}">R{{camp.roundLossRound}} : −{{camp.roundLoss}}</span>{{/if}}
          {{#if camp.routed}}<span class="mc-flag mc-flag-bad" title="En déroute">🏳 Déroute</span>{{/if}}
          {{#if camp.retreated}}<span class="mc-flag mc-flag-bad" title="Retraite">↩ Retraite</span>{{/if}}
          {{#if camp.fortified}}<span class="mc-flag" title="Fortifié (+2 moral)">🏰</span>{{/if}}
          {{#if camp.fearless}}<span class="mc-flag" title="Morts-vivants / sans peur (+2 moral)">💀</span>{{/if}}
          {{#if camp.pinned}}<span class="mc-flag" title="Acculé (+2 moral)">🧱</span>{{/if}}
          {{#if camp.noMorale}}<span class="mc-flag" title="Sans moral : aucun jet de Moral, se bat jusqu'au dernier marqueur">⚙</span>{{/if}}
          {{#if camp.modifiers.length}}<span class="mc-flag" title="Modificateurs permanents : {{camp.modifiersText}}">⚑ {{camp.modifiersTotalLabel}}</span>{{/if}}
          {{#if camp.actionMods.length}}<span class="mc-flag mc-flag-round" title="En attente pour le prochain jet de Stratégie : {{camp.actionModsText}}">⏱ {{camp.actionModsTotalLabel}}</span>{{/if}}
        </div>
        {{/unless}}
        {{#if camp.showCommandant}}
        <div class="mc-chip-cmd" title="Commandant">
          🎖 {{#if camp.commandantName}}{{camp.commandantName}}{{else}}<i>abstrait (d6)</i>{{/if}}
          {{#if camp.commandantName}}
          <select class="mc-strategie-skill mc-mini" data-camp="{{camp.id}}" title="Compétence utilisée pour le jet de Stratégie">
            {{#each camp.strategieSkillChoices as |s|}}<option value="{{s}}" {{#if (eq s camp.strategieSkillSelected)}}selected{{/if}}>{{s}}</option>{{/each}}
            <option value="__unskilled__" {{#if (eq camp.strategieSkillSelected "__unskilled__")}}selected{{/if}}>Unskilled (d4-2)</option>
          </select>
          {{/if}}
        </div>
        {{/if}}
      </div>
      {{/each}}
    </div>
  `;

  const PARTICIPANTS_BLOCK = `
    <div class="mc-section-head">
      <span>⚔ Actions de combat</span>
      <span class="mc-count" title="Résolues / total">{{participantsDone}}/{{participantsTotal}}</span>
      <span class="mc-info" title="Chaque round, ajoute les Jokers (PJ ou PNJ, alliés ou adverses) qui agissent, et dans quel camp. Le jet de Stratégie reste verrouillé tant qu'une action ou un Moral est en attente.">ⓘ</span>
    </div>
    {{#if isGM}}{{#if participantActorChoices.length}}
    <div class="mc-row mc-add-participant">
      <select class="mc-participant-actor mc-grow">
        <option value="">— Joker —</option>
        {{#each participantActorChoices as |a|}}<option value="{{a.id}}">{{a.name}}</option>{{/each}}
      </select>
      <select class="mc-participant-camp">
        {{#each state.camps as |camp|}}<option value="{{camp.id}}" {{#if (eq camp.id ../defaultParticipantCamp)}}selected{{/if}}>{{camp.name}}</option>{{/each}}
      </select>
      <button data-action="addParticipant" class="mc-icon-btn" title="Ajouter à l'Action de combat">＋</button>
    </div>
    {{/if}}{{/if}}
    {{#unless participants.length}}<p class="mc-empty">Aucun participant. Les Jokers ajoutés restent inscrits d'un round à l'autre.</p>{{/unless}}
    <ul class="mc-plist">
      {{#each participants as |p|}}
      <li class="mc-p {{#if p.done}}mc-p-done{{/if}}" style="--camp: {{p.campColor}}">
        <div class="mc-row">
          <span class="mc-dot" title="{{p.campName}}"></span>
          <span class="mc-p-name mc-grow" title="{{p.actorName}} → {{p.campName}}">{{p.actorName}}</span>
          {{#if p.done}}
            <span class="mc-p-res" title="{{p.summary}}">✅ {{p.summary}}</span>
          {{else}}
            {{#unless p.pending}}<span class="mc-p-wait" title="{{#if p.waitingFor}}Jet attendu de {{p.waitingFor}}{{else}}En attente{{/if}}">⏳{{#if p.waitingFor}} {{p.waitingFor}}{{/if}}</span>{{/unless}}
          {{/if}}
          {{#if p.canRemove}}<a class="mc-x" data-action="removeParticipant" data-participant="{{p.id}}" title="Retirer">✕</a>{{/if}}
        </div>
        {{#if p.canControl}}
          {{#unless p.done}}{{#unless p.pending}}
          <div class="mc-row">
            <select class="mc-participant-skill mc-grow" data-participant="{{p.id}}" title="Compétence">
              {{#each p.skillChoices as |s|}}<option value="{{s}}" {{#if (eq s p.skillSelect)}}selected{{/if}}>{{s}}</option>{{/each}}
              {{#unless p.hasNativeUnskilled}}<option value="__unskilled__" {{#if (eq p.skillSelect "__unskilled__")}}selected{{/if}}>Unskilled (d4-2)</option>{{/unless}}
              <option value="__custom__" {{#if p.isCustom}}selected{{/if}}>Autre…</option>
            </select>
            <input type="text" class="mc-participant-custom {{#unless p.isCustom}}mc-hide{{/unless}}" data-participant="{{p.id}}" placeholder="Nom exact" value="{{p.skillCustom}}">
            <button data-action="rollParticipant" data-participant="{{p.id}}" class="mc-roll-btn" title="{{#if p.waitingFor}}Le jet s'ouvrira chez {{p.waitingFor}}{{else}}Lancer le jet{{/if}}">🎲</button>
          </div>
          {{/unless}}{{/unless}}
          {{#if p.pending}}
          <div class="mc-confirm">
            <input type="number" class="mc-pending-action-total" data-participant="{{p.id}}" value="{{p.pending.total}}" title="Total{{#if @root.isGM}} (corrige si besoin){{/if}}" {{#unless @root.isGM}}readonly{{/unless}}>
            {{#if p.canReroll}}{{#if p.pending.bennies}}<button data-action="rerollParticipant" data-participant="{{p.id}}" class="mc-icon-btn" title="Relancer avec un Jeton ({{p.pending.bennies}} dispo.) — garde le meilleur">🔄<sup>{{p.pending.bennies}}</sup></button>{{/if}}{{/if}}
            <button data-action="addD6Participant" data-participant="{{p.id}}" class="mc-icon-btn" title="Ajouter 1d6 explosif (Conviction après coup)">+d6</button>
            {{#if @root.isGM}}
            <label class="mc-crit" title="Échec critique (1 naturel)"><input type="checkbox" class="mc-pending-action-crit" data-participant="{{p.id}}">☠</label>
            <button data-action="confirmParticipant" data-participant="{{p.id}}" class="mc-ok-btn" title="Résoudre">✔</button>
            <button data-action="cancelParticipant" data-participant="{{p.id}}" class="mc-icon-btn" title="Annuler le jet">✖</button>
            {{else}}
            <span class="mc-hint">validation par le MJ</span>
            {{/if}}
          </div>
          {{/if}}
        {{/if}}
      </li>
      {{/each}}
    </ul>
  `;

  const LOG_BLOCK = `
    <details class="mc-fold" data-section="log" {{#if open.log}}open{{/if}}>
      <summary>📜 Journal <span class="mc-count">{{state.log.length}}</span></summary>
      <div class="mc-log">
        {{#each state.log as |entry|}}
        <div class="mc-log-entry"><span class="mc-log-round">R{{entry.round}}</span> {{entry.text}}</div>
        {{/each}}
      </div>
    </details>
  `;

  // Configuration d'UN camp
  const CAMP_SETUP_BLOCK = `
    <div class="mc-setup-grid">
    {{#each setupCamps as |camp|}}
    <div class="mc-card" style="--camp: {{camp.color}}">
      <div class="mc-row">
        <input type="color" class="mc-setup-color" data-idx="{{camp.idx}}" value="{{camp.color}}" title="Couleur">
        <input type="text" class="mc-setup-name mc-grow" data-idx="{{camp.idx}}" value="{{camp.name}}" placeholder="Nom du camp">
        <input type="number" class="mc-setup-markers mc-num" data-idx="{{camp.idx}}" value="{{camp.forceMarkers}}" title="Marqueurs de forces" min="0">
      </div>
      <div class="mc-row mc-wrap">
        <label class="mc-toggle" title="Fortifié (+2 moral)"><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="fortified" {{#if camp.fortified}}checked{{/if}}>🏰 Fortifié</label>
        <label class="mc-toggle" title="Morts-vivants / sans peur (+2 moral)"><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="fearless" {{#if camp.fearless}}checked{{/if}}>💀 Sans peur</label>
        <label class="mc-toggle" title="Acculé (+2 moral)"><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="pinned" {{#if camp.pinned}}checked{{/if}}>🧱 Acculé</label>
        <label class="mc-toggle" title="Sans moral (machines, insectes, zombies…) : ce camp ne fait jamais de jet de Moral et se bat jusqu'au dernier marqueur"><input type="checkbox" data-action="flag" data-camp="{{camp.id}}" data-flag="noMorale" {{#if camp.noMorale}}checked{{/if}}>⚙ Sans moral</label>
      </div>
      <div class="mc-row">
        <span class="mc-lbl">🎖</span>
        <select class="mc-commandant-select mc-grow" data-camp="{{camp.id}}" title="Commandant (jet de Stratégie et de Moral)">
          <option value="">— commandant abstrait (d6) —</option>
          {{#each camp.commandantChoices as |a|}}<option value="{{a.id}}" {{#if (eq a.id camp.commandantId)}}selected{{/if}}>{{a.name}}</option>{{/each}}
        </select>
      </div>
      {{#if camp.modifiers.length}}
      <div class="mc-row mc-wrap">
        {{#each camp.modifiers as |mod|}}
        <span class="mc-pill">{{mod.label}} {{mod.value}} <a data-action="rmMod" data-camp="{{camp.id}}" data-mod="{{mod.id}}" title="Supprimer">✕</a></span>
        {{/each}}
      </div>
      {{/if}}
      <div class="mc-row">
        <input type="text" placeholder="Modificateur (ex : Avantage tactique)" class="mc-mod-label mc-grow" data-camp="{{camp.id}}">
        <input type="number" placeholder="±" class="mc-mod-value mc-num" data-camp="{{camp.id}}">
        <button data-action="addMod" data-camp="{{camp.id}}" class="mc-icon-btn" title="Ajouter le modificateur permanent">＋</button>
      </div>
    </div>
    {{/each}}
    </div>
  `;

  const GM_TEMPLATE = `
  <div class="mc-app">
    {{#if state.initialized}}
    <nav class="mc-tabs">
      <a data-action="navRound" class="{{#if isRoundView}}active{{/if}}">▶ Round {{state.round}}</a>
      <a data-action="navSetup" class="{{#if isSetupView}}active{{/if}}">⚙ Config</a>
      {{#if hasMoraleQueue}}<a data-action="navMorale" class="mc-tab-alert {{#if isMoraleView}}active{{/if}}">⚠ Moral {{moraleQueueCount}}</a>{{/if}}
    </nav>
    {{/if}}

    {{#if isSetupView}}
      <div class="mc-section-head">
        <span>{{#if isReconfigure}}Configuration des camps{{else}}Nouveau combat de masse{{/if}}</span>
        <span class="mc-info" title="Nom, couleur, marqueurs, drapeaux, modificateurs permanents et commandant. Modifier en cours de combat ne réinitialise ni le round ni le journal.">ⓘ</span>
      </div>
      ${CAMP_SETUP_BLOCK}
      <button data-action="submitSetup" class="mc-main-btn">{{#if isReconfigure}}✔ Appliquer{{else}}▶ Démarrer le combat{{/if}}</button>
      {{#if isReconfigure}}<button data-action="cancelSetup" class="mc-link">← Retour au round</button>{{/if}}
    {{/if}}

    {{#if isRoundView}}
      ${SCOREBOARD_BLOCK}
      {{#if ended}}
      <div class="mc-ended" style="--camp: {{ended.color}}">
        <div class="mc-ended-title">🏁 Combat terminé</div>
        <div>{{ended.headline}}</div>
        <button data-action="endCombat" class="mc-main-btn">🔄 Nouveau combat (réinitialiser)</button>
      </div>
      {{else}}
      {{#if hasMoraleQueue}}<button data-action="navMorale" class="mc-alert-btn">⚠ {{moraleQueueCount}} jet(s) de Moral à faire</button>{{/if}}

      ${PARTICIPANTS_BLOCK}

      {{#if pendingStrategie}}
      <div class="mc-panel">
        <div class="mc-section-head">
          <span>Stratégie — confirmer</span>
          <span class="mc-info" title="{{pendingStrategie.campALabel}} : {{pendingStrategie.modsHintA}} — {{pendingStrategie.campBLabel}} : {{pendingStrategie.modsHintB}}. Corrige un total si besoin (relance, Conviction…).">ⓘ</span>
        </div>
        <div class="mc-confirm">
          <span class="mc-grow mc-ell" title="{{pendingStrategie.campALabel}}">{{pendingStrategie.campALabel}}</span>
          <input type="number" class="mc-pending-a" value="{{pendingStrategie.totalA}}">
          {{#if pendingStrategie.benniesA}}<button data-action="rerollStrategieA" class="mc-icon-btn" title="Relancer avec un Jeton ({{pendingStrategie.benniesA}} dispo.)">🔄<sup>{{pendingStrategie.benniesA}}</sup></button>{{/if}}
          <button data-action="addD6StrategieA" class="mc-icon-btn" title="+1d6 explosif">+d6</button>
        </div>
        <div class="mc-confirm">
          <span class="mc-grow mc-ell" title="{{pendingStrategie.campBLabel}}">{{pendingStrategie.campBLabel}}</span>
          <input type="number" class="mc-pending-b" value="{{pendingStrategie.totalB}}">
          {{#if pendingStrategie.benniesB}}<button data-action="rerollStrategieB" class="mc-icon-btn" title="Relancer avec un Jeton ({{pendingStrategie.benniesB}} dispo.)">🔄<sup>{{pendingStrategie.benniesB}}</sup></button>{{/if}}
          <button data-action="addD6StrategieB" class="mc-icon-btn" title="+1d6 explosif">+d6</button>
        </div>
        <div class="mc-row">
          <button data-action="confirmStrategie" class="mc-main-btn mc-grow">✔ Appliquer le résultat</button>
          <button data-action="cancelStrategie" class="mc-icon-btn" title="Annuler">✖</button>
        </div>
      </div>
      {{else}}
      <button data-action="rollStrategie" class="mc-main-btn" {{#unless canRollStrategie}}disabled title="{{strategieBlockReason}}"{{/unless}}>⚔ Jet de Stratégie</button>
      {{#unless canRollStrategie}}<p class="mc-hint">{{strategieBlockReason}}</p>{{/unless}}
      {{/if}}
      {{/if}}

      <details class="mc-fold" data-section="tools" {{#if open.tools}}open{{/if}}>
        <summary>🧰 Outils</summary>
        <div class="mc-row mc-wrap">
          <button data-action="rollEffets" class="mc-sm-btn">🎲 Effets des combats</button>
          <button data-action="clearParticipants" class="mc-sm-btn">🗑 Vider les actions</button>
        </div>
        <div class="mc-row">
          <select class="mc-force-morale-camp mc-grow">
            {{#each state.camps as |camp|}}<option value="{{camp.id}}">{{camp.name}}</option>{{/each}}
          </select>
          <button data-action="forceMorale" class="mc-sm-btn">➕ Forcer un Moral</button>
        </div>
        <label class="mc-check"><input type="checkbox" data-action="toggleOnlyFatigue" {{#if state.config.onlyFatigueForJokers}}checked{{/if}}> Jokers : Fatigue au lieu des Blessures (variante)</label>
        <label class="mc-check"><input type="checkbox" data-action="toggleReveal" {{#if state.revealEnemyToPlayers}}checked{{/if}}> Révéler le camp adverse aux joueurs</label>
        <div class="mc-row mc-wrap">
          <button data-action="inviteSpectators" class="mc-sm-btn" title="Poste dans le chat un lien pour suivre le combat, et ouvre la fenêtre chez les joueurs qui ont déjà la macro">📣 Inviter les joueurs à suivre</button>
          <button data-action="endCombat" class="mc-sm-btn mc-danger">🏳 Terminer le combat</button>
        </div>
      </details>
    {{/if}}

    {{#if isMoraleView}}
      <div class="mc-section-head">
        <span>⚠ Jets de Moral</span>
        <span class="mc-info" title="Ces camps ont perdu des marqueurs de forces ce round : jet d'Âme du commandant avant le round suivant.">ⓘ</span>
      </div>
      {{#each moraleCamps as |camp|}}
      <div class="mc-card" style="--camp: {{camp.color}}">
        <div class="mc-row">
          <b class="mc-grow" style="color: var(--camp)">{{camp.name}}</b>
          <span><b>{{camp.forceMarkers}}</b>/{{camp.startMarkers}}</span>
        </div>
        <div class="mc-row">
          <span class="mc-grow mc-ell">🎖 {{#if camp.commandantName}}{{camp.commandantName}}{{else}}<i>abstrait (d6)</i>{{/if}}</span>
          {{#unless camp.hasPendingMorale}}<button data-action="rollMorale" data-camp="{{camp.id}}" class="mc-roll-btn" title="Lancer le jet de Moral">🎲</button>{{/unless}}
        </div>
      </div>
      {{/each}}
      {{#each pendingMoraleList as |pm|}}
      <div class="mc-panel">
        <div class="mc-section-head">
          <span>Moral {{pm.campName}} — confirmer</span>
          <span class="mc-info" title="Modificateurs : {{pm.modsHint}}">ⓘ</span>
        </div>
        <div class="mc-confirm">
          <input type="number" class="mc-pending-morale-total" data-camp="{{pm.campId}}" value="{{pm.total}}">
          {{#if pm.bennies}}<button data-action="rerollMorale" data-camp="{{pm.campId}}" class="mc-icon-btn" title="Relancer avec un Jeton ({{pm.bennies}} dispo.)">🔄<sup>{{pm.bennies}}</sup></button>{{/if}}
          <button data-action="addD6Morale" data-camp="{{pm.campId}}" class="mc-icon-btn" title="+1d6 explosif">+d6</button>
          <label class="mc-crit" title="Échec critique (1 naturel)"><input type="checkbox" class="mc-pending-morale-crit" data-camp="{{pm.campId}}">☠</label>
          <button data-action="confirmMorale" data-camp="{{pm.campId}}" class="mc-ok-btn" title="Valider">✔</button>
          <button data-action="cancelMorale" data-camp="{{pm.campId}}" class="mc-icon-btn" title="Annuler">✖</button>
        </div>
      </div>
      {{/each}}
      <button data-action="navRound" class="mc-link">← Retour au round</button>
    {{/if}}

    ${LOG_BLOCK}
  </div>`;

  const PLAYER_TEMPLATE = `
  <div class="mc-app">
    {{#unless state.initialized}}
      <p class="mc-empty">Le Meneur n'a pas encore lancé de combat de masse.</p>
    {{else}}
      <div class="mc-section-head"><span>▶ Round {{state.round}}</span><span class="mc-phase">{{phaseLabel}}</span></div>
      ${SCOREBOARD_BLOCK}
      {{#if ended}}
      <div class="mc-ended" style="--camp: {{ended.color}}">
        <div class="mc-ended-title">🏁 Combat terminé</div>
        <div>{{ended.headline}}</div>
      </div>
      {{else}}
      ${PARTICIPANTS_BLOCK}
      {{/if}}

      <details class="mc-fold" data-section="perso" {{#if open.perso}}open{{/if}}>
        <summary>🎒 Mon camp et mes ressources</summary>
        <div class="mc-row">
          <span class="mc-lbl">Camp</span>
          <select class="mc-my-camp mc-grow">
            {{#each state.camps as |camp|}}<option value="{{camp.id}}" {{#if (eq camp.id myCamp.id)}}selected{{/if}}>{{camp.name}}</option>{{/each}}
          </select>
        </div>
        {{#if myActors.length}}
        <div class="mc-row">
          <span class="mc-lbl">Perso</span>
          <select class="mc-my-actor mc-grow">
            {{#each myActors as |a|}}<option value="{{a.id}}" {{#if (eq a.id ../selectedActorId)}}selected{{/if}}>{{a.name}}</option>{{/each}}
          </select>
        </div>
        {{/if}}
        <div class="mc-row">
          <span class="mc-lbl mc-grow">Munitions <b>{{myResources.ammo}}</b></span>
          <button data-action="res" data-key="ammo" data-delta="-1" class="mc-icon-btn">−</button>
          <button data-action="res" data-key="ammo" data-delta="1" class="mc-icon-btn">＋</button>
        </div>
        <div class="mc-row">
          <span class="mc-lbl mc-grow">Points de pouvoir <b>{{myResources.pp}}</b></span>
          <button data-action="res" data-key="pp" data-delta="-1" class="mc-icon-btn">−</button>
          <button data-action="res" data-key="pp" data-delta="1" class="mc-icon-btn">＋</button>
        </div>
      </details>
    {{/unless}}
    ${LOG_BLOCK}
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
        width: 440,
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
        // Jet en attente : dans l'état PARTAGÉ (visible MJ + joueur). Jetons
        // recalculés "à chaud" depuis la fiche.
        const pending = p.pending ? { ...p.pending, bennies: actor?.system?.bennies?.value ?? 0 } : null;
        // Compétence sélectionnée : celle mémorisée, sinon défaut stable
        // (Fighting si présent, sinon la première). Ne change plus qu'à
        // l'initiative de l'utilisateur.
        const defaultSkill = skillChoices.find(s => s.toLowerCase() === "fighting") ?? skillChoices[0] ?? "__unskilled__";
        const skill = p.skill || defaultSkill;
        const isCustom = !!skill && skill !== "__unskilled__" && !skillChoices.includes(skill);
        const skillSelect = isCustom ? "__custom__" : skill;
        // Relance par le JOUEUR lui-même (sur son personnage) ou par le MJ.
        const canReroll = !!pending && (game.user.isGM || actor?.isOwner);
        // À qui le jet sera-t-il demandé ? (joueur connecté propriétaire,
        // autre que soi) — affiché pour que le MJ sache que la fenêtre de
        // jet s'ouvrira chez ce joueur.
        const owner = findOwningUser(game.actors.get(p.actorId));
        const waitingFor = owner && owner.id !== game.user.id ? owner.name : null;
        return {
          ...p,
          campName: camp?.name ?? "?",
          campColor: camp?.color ?? "#666",
          done: p.status === "done",
          canControl,
          canRemove: game.user.isGM,
          waitingFor,
          skillChoices,
          hasNativeUnskilled,
          skillSelect,
          skillCustom: isCustom ? skill : "",
          isCustom,
          pending,
          canReroll,
        };
      });
    }

    /** Données communes d'affichage d'un camp (barre, totaux de modifs). */
    _decorateCamp(camp, extra = {}) {
      const sum = arr => (arr || []).reduce((a, m) => a + Number(m.value || 0), 0);
      const sign = n => (n >= 0 ? `+${n}` : `${n}`);
      const pct = camp.startMarkers > 0 ? Math.max(0, Math.min(100, Math.round(100 * camp.forceMarkers / camp.startMarkers))) : 0;
      // Pertes du dernier jet de Stratégie (restent affichées jusqu'au suivant).
      const st = getState();
      const h = (st.history || []).at(-1);
      const idx = st.camps.findIndex(c => c.id === camp.id);
      const roundLoss = h ? (idx === 0 ? h.lossA : h.lossB) : 0;
      const roundLossRound = h?.round ?? 0;
      return {
        ...camp,
        pct,
        roundLoss,
        roundLossRound,
        modifiersText: describeMods(camp.modifiers || []),
        modifiersTotalLabel: sign(sum(camp.modifiers)),
        actionModsText: describeMods(camp.actionMods || []),
        actionModsTotalLabel: sign(sum(camp.actionMods)),
        ...extra,
      };
    }

    _endViewData(state) {
      const e = state.ended;
      const winner = state.camps.find(c => c.id === e.winnerId);
      const loser = state.camps.find(c => c.id === e.loserId);
      let headline;
      if (e.type === "mutual") headline = e.reason === "annihilated" ? "Aucun vainqueur : anéantissement mutuel" : "Aucun vainqueur : les deux armées se retirent";
      else headline = `Victoire de ${winner?.name} — ${loser?.name} ${e.reason === "annihilated" ? "est anéantie" : e.reason === "rout" ? "est en déroute" : "bat en retraite"}`;
      return { headline, color: winner?.color ?? "#7a1f1f" };
    }

    _commonViewData(state, participants) {
      const moraleQueue = state.moraleQueue || [];
      const pendingCount = participants.filter(p => !p.done).length;
      let strategieBlockReason = "";
      if (pendingCount) strategieBlockReason = `⏳ ${pendingCount} action(s) de combat à résoudre`;
      else if (moraleQueue.length) strategieBlockReason = "⚠ Jet(s) de Moral à faire d'abord";
      return {
        participants,
        participantsDone: participants.filter(p => p.done).length,
        participantsTotal: participants.length,
        strategieBlockReason,
        open: this._open ?? {},
        isGM: game.user.isGM,
        ended: state.ended ? this._endViewData(state) : null,
        phaseLabel: !state.initialized ? ""
          : state.ended ? "🏁 Combat terminé"
          : moraleQueue.length ? "⚠ Jets de Moral en cours"
          : pendingCount ? `⏳ Actions de combat : ${participants.length - pendingCount}/${participants.length} résolues`
          : "⚔ En attente du jet de Stratégie",
      };
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
            if (camp.strategieSkill) this._strategieSkill[camp.id] = camp.strategieSkill;
            if (!this._strategieSkill[camp.id] || (this._strategieSkill[camp.id] !== UNSKILLED_VALUE && !strategieSkillChoices.includes(this._strategieSkill[camp.id]))) {
              // Choix par défaut : "Battle" si présent, sinon la première
              // compétence de la fiche, sinon Tentative sans formation.
              this._strategieSkill[camp.id] = strategieSkillChoices.includes(MC_CONFIG.SKILL_STRATEGIE)
                ? MC_CONFIG.SKILL_STRATEGIE
                : (strategieSkillChoices[0] ?? UNSKILLED_VALUE);
            }
            strategieSkillSelected = this._strategieSkill[camp.id];
          }
          return this._decorateCamp(camp, {
            commandantName: commandant?.name,
            showCommandant: true,
            hasPendingMorale: !!this._pendingMorale?.[camp.id],
            // Un acteur déjà commandant de l'AUTRE camp ne peut pas être
            // choisi ici (mais reste proposé s'il est déjà LE commandant
            // de CE camp, pour rester sélectionné dans la liste).
            commandantChoices: commandantActors.filter(a => a.id !== otherCamp.commandantId).map(a => ({ id: a.id, name: a.name })),
            strategieSkillChoices,
            strategieSkillSelected,
          });
        });

        let view = !state.initialized ? "setup" : (this._view || "round");
        if (view === "morale" && moraleQueue.length === 0) view = "round";
        this._view = view;

        const moraleCamps = enrichedCamps.filter(c => moraleQueue.includes(c.id));
        const setupCamps = enrichedCamps.map((c, idx) => ({ ...c, idx, label: idx === 0 ? "Camp A" : "Camp B" }));
        const engagedIds = new Set((state.roundActions || []).map(p => p.actorId));
        const participantActorChoices = wildcardActors
          .filter(a => !commandantIds.has(a.id) && !engagedIds.has(a.id))
          .map(a => ({ id: a.id, name: a.name }));

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

        const participants = this._buildParticipantsViewModel(state, () => true);
        return {
          state, enrichedCamps, moraleCamps, setupCamps,
          scoreCamps: enrichedCamps,
          isSetupView: view === "setup",
          isRoundView: view === "round",
          isMoraleView: view === "morale",
          isReconfigure: state.initialized,
          hasMoraleQueue: moraleQueue.length > 0,
          moraleQueueCount: moraleQueue.length,
          participantActorChoices,
          defaultParticipantCamp: state.camps[0]?.id,
          canRollStrategie,
          pendingStrategie,
          pendingMoraleList,
          ...this._commonViewData(state, participants),
        };
      } else {
        const myRes = state.playerResources[game.user.id] ?? { ammo: 0, pp: 0, campId: state.camps[0]?.id };
        const myCamp = state.camps.find(c => c.id === myRes.campId) ?? state.camps[0];
        const enemyCamp = state.camps.find(c => c.id !== myCamp?.id);
        const myActorDocs = game.actors.filter(a => a.isOwner && isWildcardActor(a) && !commandantIds.has(a.id));
        const myActors = myActorDocs.map(a => ({ id: a.id, name: a.name }));
        const myActorIds = new Set(myActors.map(a => a.id));
        const selectedActorId = this._selectedActorId ?? myActors[0]?.id ?? "";
        // Mon camp toujours visible ; le camp adverse seulement si le MJ le
        // révèle (sinon pastille masquée "?").
        const scoreCamps = [myCamp, enemyCamp].filter(Boolean).map(c =>
          this._decorateCamp(c, { hidden: c.id !== myCamp.id && !state.revealEnemyToPlayers }));
        // On ne propose que ses persos pas encore engagés ce round.
        const engaged = new Set((state.roundActions || []).map(p => p.actorId));
        const participants = this._buildParticipantsViewModel(state, (p) => myActorIds.has(p.actorId));
        return {
          state, myCamp, enemyCamp, scoreCamps,
          myResources: myRes,
          myActors,
          selectedActorId,
          participantActorChoices: myActors.filter(a => !engaged.has(a.id)),
          defaultParticipantCamp: myCamp?.id,
          canRollStrategie,
          ...this._commonViewData(state, participants),
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

      // Sections repliables : on mémorise l'état ouvert/fermé entre deux
      // rendus (l'évènement "toggle" ne remonte pas, d'où la liaison directe).
      html.find("details[data-section]").on("toggle", (ev) => {
        this._open ??= {};
        this._open[ev.currentTarget.dataset.section] = ev.currentTarget.open;
      });

      // Champ "nom exact" affiché seulement si "Autre…" est choisi.
      // La compétence choisie est mémorisée dans l'état partagé.
      html.on("change", ".mc-participant-skill", async (ev) => {
        const id = ev.currentTarget.dataset.participant;
        const value = ev.currentTarget.value;
        const custom = html.find(`.mc-participant-custom[data-participant='${id}']`);
        custom.toggleClass("mc-hide", value !== "__custom__");
        if (value === "__custom__") { custom.trigger("focus"); return; } // enregistré à la saisie
        await applyPatch("setParticipantSkill", id, value);
      });
      html.on("change", ".mc-participant-custom", async (ev) => {
        const v = ev.currentTarget.value.trim();
        if (v) await applyPatch("setParticipantSkill", ev.currentTarget.dataset.participant, v);
      });

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
        // Anti double-clic pendant qu'un jet (éventuellement délégué) est en cours.
        this._rolling ??= new Set();
        if (this._rolling.has(participantId)) return;
        this._rolling.add(participantId);
        ev.currentTarget.disabled = true;
        let total;
        try {
          total = await rollForActor(actor, skillName, [], `Action de combat — ${p.actorName}`);
        } finally {
          this._rolling.delete(participantId);
        }
        if (total === null || total === undefined) { ui.notifications.warn("Jet annulé ou sans réponse."); this.render(); return; }
        if (skillName !== p.skill) await applyPatch("setParticipantSkill", participantId, skillName);
        await applyPatch("setParticipantPending", participantId, { total, skillName });
        this.render();
      });

      html.on("click", "[data-action='addD6Participant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const input = html.find(`.mc-pending-action-total[data-participant='${participantId}']`)[0];
        await rollExplodingD6AndAdd(input);
        await applyPatch("setParticipantPending", participantId, { total: Number(input.value) });
      });

      // Correction manuelle du total par le MJ : partagée avec le joueur.
      html.on("change", ".mc-pending-action-total", async (ev) => {
        if (!game.user.isGM) return;
        await applyPatch("setParticipantPending", ev.currentTarget.dataset.participant, { total: Number(ev.currentTarget.value) });
      });

      // Relance avec un Jeton : le JOUEUR peut le faire lui-même, depuis son
      // client, sans attendre le MJ (le MJ le peut aussi : il est alors
      // délégué au joueur propriétaire s'il est connecté).
      html.on("click", "[data-action='rerollParticipant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const p = (getState().roundActions || []).find(x => x.id === participantId);
        if (!p?.pending) return;
        const actor = game.actors.get(p.actorId);
        if (!actor) return;
        ev.currentTarget.disabled = true;
        const currentTotal = Number(p.pending.total) || 0;
        const spec = { skillName: p.pending.skillName, kind: "skill", flavor: `Action de combat — ${p.actorName}` };
        const kept = actor.isOwner && !game.user.isGM
          ? await spendBennyAndReroll(actor, currentTotal, async () => await rollSkillTotal(actor, spec.skillName, [], spec.flavor))
          : await rerollForActor(actor, currentTotal, spec);
        await applyPatch("setParticipantPending", participantId, { total: kept });
        this.render();
      });

      html.on("click", "[data-action='confirmParticipant']", async (ev) => {
        const participantId = ev.currentTarget.dataset.participant;
        const totalInput = html.find(`.mc-pending-action-total[data-participant='${participantId}']`)[0];
        const critInput = html.find(`.mc-pending-action-crit[data-participant='${participantId}']`)[0];
        const total = Number(totalInput.value);
        const critFail = !!critInput?.checked;
        const p = (getState().roundActions || []).find(x => x.id === participantId);
        if (!p?.pending) return;
        await this._resolveActionOutcome(participantId, p.campId, p.actorId, p.actorName, total, p.pending.skillName, critFail);
        this.render();
      });

      html.on("click", "[data-action='cancelParticipant']", async (ev) => {
        await applyPatch("setParticipantPending", ev.currentTarget.dataset.participant, null);
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
          await inviteSpectators(getState());
        } else {
          await applyPatch("reconfigureCamps", campA, campB);
        }
        this._view = "round";
        this.render();
      });

      html.on("click", "[data-action='inviteSpectators']", async () => {
        await inviteSpectators(getState());
        ui.notifications.info("Invitation postée dans le chat.");
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

      html.on("change", ".mc-strategie-skill", async (ev) => {
        this._strategieSkill ??= {};
        this._strategieSkill[ev.currentTarget.dataset.camp] = ev.currentTarget.value;
        await applyPatch("setStrategieSkill", ev.currentTarget.dataset.camp, ev.currentTarget.value);
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
        const choice = await mcChoose({
          title: "Terminer le combat de masse ?",
          content: `<div class="mc-dialog-body">
            <p class="mc-dialog-lead">🏳 Tout réinitialiser ?</p>
            <p>Camps, marqueurs, journal, participants et ressources repartent à zéro.${getState().ended ? "" : " Un bilan final est posté dans le chat."}</p>
            <p class="mc-dialog-warn">Action irréversible.</p>
          </div>`,
          buttons: [{ action: "end", label: "🏳 Terminer" }, { action: "cancel", label: "Annuler" }],
          defaultAction: "cancel",
        });
        if (choice !== "end") return;
        const state = getState();
        // Si l'issue a déjà été annoncée, pas de second bilan.
        if (!state.ended && state.initialized) await this._postRoundRecap(state, { final: true });
        await applyPatch("resetAll");
        this._pendingActions = {};
        this._pendingStrategie = null;
        this._pendingMorale = {};
        this._view = "setup";
        this.render();
      });

      html.on("click", "[data-action='rollStrategie']", async () => {
        const state = getState();
        if (state.ended) { ui.notifications.info("Le combat est terminé."); return; }
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
        await this._postStrategieLosses(state);
        if (state.ended) {
          this._view = "round";
          await this._announceEnd(state);
        } else if ((state.moraleQueue || []).length > 0) {
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
        if (state.ended) {
          this._pendingMorale = {};
          this._view = "round";
          await this._announceEnd(state);
        } else if ((state.moraleQueue || []).length === 0) {
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
        const choice = (await mcChoose({
          title: "Prouesse en Action de combat !",
          content: `<div class="mc-dialog-body">
            <p class="mc-dialog-lead">🌟 ${actorName} — Prouesse (${total})</p>
            <p>Choisis l'effet :</p>
          </div>`,
          buttons: [
            { action: "table", label: "🎲 Effets des combats" },
            { action: "bonus", label: "＋2 au jet de Stratégie" },
          ],
          defaultAction: "bonus",
        })) ?? "bonus";
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
      const after = getState();
      if (after.ended && !after.endAnnounced) await this._announceEnd(after);
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
    /** Poste dans le chat un récapitulatif lisible du round (ou du combat
     *  s'il se termine) : marqueurs perdus/restants par camp, en blocs
     *  empilés plutôt qu'un tableau large — bien plus lisible dans la
     *  colonne de chat, souvent étroite. */
    /** Carte de chat juste après le jet de Stratégie : pertes de chaque
     *  camp, explicites, AVANT les jets de Moral. */
    async _postStrategieLosses(state) {
      const h = (state.history || []).at(-1);
      if (!h) return;
      const [a, b] = state.camps;
      const winner = state.camps.find(c => c.id === h.winnerId);
      const verdict = !winner ? "Égalité — les deux camps s'usent"
        : h.prowess ? `Prouesse de <b style="color:${winner.color}">${winner.name}</b>`
        : `Victoire de <b style="color:${winner.color}">${winner.name}</b>`;
      const line = (camp, loss, total) => `
        <div style="display:flex; align-items:center; gap:8px; border-left:5px solid ${camp.color}; padding:4px 8px; margin:5px 0; background:rgba(0,0,0,0.04); border-radius:0 4px 4px 0;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:bold; color:${camp.color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${camp.name}</div>
            <div style="font-size:12px; opacity:0.8;">Stratégie : ${total} · reste <b>${camp.forceMarkers}</b>/${camp.startMarkers}</div>
          </div>
          <div style="font-size:20px; font-weight:bold; white-space:nowrap; color:${loss > 0 ? "#b30000" : "#2e7d32"};">${loss > 0 ? `−${loss}` : "0"}</div>
        </div>`;
      const moraleNote = state.ended ? "" : (state.moraleQueue || []).length
        ? `<div style="font-size:12px; text-align:center; margin-top:4px;">⚠ Jet de Moral : ${(state.moraleQueue || []).map(id => state.camps.find(c => c.id === id)?.name).filter(Boolean).join(", ")}</div>`
        : "";
      await ChatMessage.create({ content: `
        <div style="border:2px solid #7a1f1f; border-radius:8px; padding:8px 10px; background:rgba(122,31,31,0.05);">
          <div style="text-align:center; font-weight:bold; font-size:15px;">⚔ Round ${h.round} — unités de combat perdues</div>
          <div style="text-align:center; font-size:13px; margin:2px 0 4px;">${verdict}</div>
          ${line(a, h.lossA, h.totalA)}
          ${line(b, h.lossB, h.totalB)}
          ${moraleNote}
        </div>` });
    }

    /** Poste (une seule fois) la carte d'issue du combat. */
    async _announceEnd(state) {
      if (!state.ended || state.endAnnounced) return;
      await applyPatch("markEndAnnounced");
      const e = state.ended;
      const winner = state.camps.find(c => c.id === e.winnerId);
      const loser = state.camps.find(c => c.id === e.loserId);
      const W = winner ? `<b style="color:${winner.color}">${winner.name}</b>` : "";
      const L = loser ? `<b style="color:${loser.color}">${loser.name}</b>` : "";
      let icon = "🏆", title, story;
      if (e.type === "mutual") {
        icon = "⚔";
        title = "Aucun vainqueur";
        story = e.reason === "annihilated"
          ? "Les deux armées se sont anéanties l'une l'autre : il ne reste personne pour revendiquer le champ de bataille."
          : "Épuisées, les deux armées rompent le combat en même temps et se retirent, chacune de son côté.";
      } else {
        title = `Victoire de ${winner.name} !`;
        story = e.reason === "annihilated"
          ? `${L} est anéantie : plus une seule unité ne tient le terrain. ${W} reste maîtresse du champ de bataille.`
          : e.reason === "rout"
          ? `Le moral de ${L} s'effondre : l'armée se débande et fuit en désordre. ${W} reste maîtresse du champ de bataille.`
          : `Le moral de ${L} vacille : ses chefs ordonnent la retraite et l'armée se replie en bon ordre. ${W} tient le terrain.`;
      }
      const rounds = (state.history || []).length;
      const roundsTxt = rounds <= 1 ? "un seul round d'affrontement" : `${rounds} rounds d'affrontement`;
      const wins = id => (state.history || []).filter(h => h.winnerId === id).length;
      const momentum = winner && rounds > 1 ? ` ${winner.name} a pris l'avantage sur ${wins(winner.id)} round${wins(winner.id) > 1 ? "s" : ""}.` : "";
      const tally = state.camps.map(c => `
        <div style="display:flex; align-items:center; gap:6px; border-left:5px solid ${c.color}; padding:3px 8px; margin:4px 0; background:rgba(0,0,0,0.04); border-radius:0 4px 4px 0;">
          <span style="flex:1; font-weight:bold; color:${c.color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.name}</span>
          <span style="white-space:nowrap;"><b>${c.forceMarkers}</b>/${c.startMarkers}</span>
        </div>`).join("");
      const heroes = (state.highlights || []).filter(h => /^Prouesse/.test(h.summary)).slice(-3);
      const heroesHtml = heroes.length
        ? `<div style="font-size:12px; margin-top:6px;"><b>Hauts faits :</b> ${heroes.map(h => `${h.actorName} (round ${h.round})`).join(", ")}.</div>`
        : "";
      await ChatMessage.create({ content: `
        <div style="border:3px double #7a1f1f; border-radius:10px; padding:10px 12px; background:rgba(122,31,31,0.07);">
          <div style="text-align:center; font-size:26px; line-height:1;">${icon}</div>
          <div style="text-align:center; font-weight:bold; font-size:17px; margin:4px 0 6px;">${title}</div>
          <div style="font-size:13px; line-height:1.45; text-align:center;">${story}</div>
          <div style="font-size:12px; text-align:center; opacity:0.85; margin:6px 0 4px;">Après ${roundsTxt}.${momentum}</div>
          ${tally}
          ${heroesHtml}
        </div>` });
    }

    async _postRoundRecap(state, { final = false } = {}) {
      const start = state.roundStartMarkers || {};
      const blocks = state.camps.map(camp => {
        const before = start[camp.id] ?? camp.forceMarkers;
        const lost = Math.max(0, before - camp.forceMarkers);
        const statusParts = [];
        if (camp.fortified) statusParts.push("Fortifié");
        if (camp.fearless) statusParts.push("Sans peur");
        if (camp.pinned) statusParts.push("Acculé");
        if (camp.routed) statusParts.push("🏳 En déroute");
        const statusText = statusParts.length ? statusParts.join(" · ") : "En ordre de bataille";
        return `
        <div style="border-left:5px solid ${camp.color}; padding:4px 10px; margin-bottom:8px; background:rgba(0,0,0,0.03); border-radius:0 4px 4px 0;">
          <div style="font-weight:bold; font-size:14px; color:${camp.color};">${camp.name}</div>
          <div style="font-size:13px; margin:2px 0;">
            <strong style="font-size:16px;">${camp.forceMarkers}</strong><span style="opacity:0.7;"> / ${camp.startMarkers} marqueurs</span>
            ${lost > 0 ? `<span style="opacity:0.75;"> — perdu ${lost} ce round</span>` : ""}
          </div>
          <div style="font-size:12px; opacity:0.85;">${statusText}</div>
        </div>`;
      }).join("");
      const title = final ? "Combat de masse terminé" : `Bilan du round ${state.round}`;
      const content = `
        <div style="border:2px solid #7a1f1f; border-radius:8px; padding:10px; background:rgba(122,31,31,0.05);">
          <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:8px;">⚔️ ${title}</div>
          ${blocks}
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
    #mass-combat-app .window-content { padding: 8px 10px; }
    .mc-app { --mc-red: #7a1f1f; --mc-gold: #b8860b; --mc-ok: #2e7d32; --mc-line: rgba(0,0,0,0.15);
      font-size: 14px; line-height: 1.35; container-type: inline-size; }
    .mc-app * { box-sizing: border-box; }
    /* Boutons / champs : on neutralise les hauteurs imposées par Foundry */
    .mc-app button, .mc-app select, .mc-app input[type=text], .mc-app input[type=number] {
      font-size: 13px !important; height: auto !important; min-height: 28px; line-height: 1.2 !important;
      padding: 3px 6px !important; margin: 0 !important; border-radius: 5px; }
    .mc-app button { cursor: pointer; width: auto; flex: 0 0 auto; }
    .mc-app input[type=color] { width: 30px; height: 28px; padding: 0; border: none; flex: 0 0 auto; }
    .mc-row { display: flex; align-items: center; gap: 5px; margin: 4px 0; min-width: 0; }
    .mc-wrap { flex-wrap: wrap; }
    .mc-grow { flex: 1 1 auto; min-width: 0; }
    .mc-ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mc-num { width: 56px !important; flex: 0 0 56px; text-align: center; }
    .mc-hide { display: none !important; }
    .mc-lbl { font-size: 13px; opacity: 0.85; white-space: nowrap; }
    .mc-empty, .mc-hint { font-size: 12px; opacity: 0.7; margin: 4px 0; text-align: center; }
    .mc-info { cursor: help; opacity: 0.55; font-size: 13px; }
    .mc-phase { font-size: 12px; font-weight: normal; color: #6b4e00; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mc-count { font-size: 12px; background: rgba(0,0,0,0.08); border-radius: 9px; padding: 0 7px; }

    /* Onglets */
    .mc-tabs { display: flex; gap: 2px; margin: -2px 0 8px; border-bottom: 2px solid var(--mc-line); }
    .mc-tabs a { flex: 1; text-align: center; padding: 5px 2px; font-size: 13px; font-weight: bold; cursor: pointer;
      border-bottom: 3px solid transparent; margin-bottom: -2px; opacity: 0.7; white-space: nowrap; }
    .mc-tabs a.active { opacity: 1; color: var(--mc-red); border-bottom-color: var(--mc-red); }
    .mc-tabs a.mc-tab-alert { color: var(--mc-gold); opacity: 1; }

    .mc-section-head { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px;
      font-weight: bold; font-size: 14px; color: var(--mc-red); }
    .mc-section-head > span:first-child { flex: 1 1 auto; }

    /* Tableau de bord des camps */
    .mc-score { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .mc-chip { border: 1px solid var(--mc-line); border-left: 5px solid var(--camp); border-radius: 6px;
      padding: 5px 7px; background: rgba(255,255,255,0.45); min-width: 0; }
    .mc-chip-routed { opacity: 0.7; }
    .mc-chip-head { display: flex; align-items: baseline; gap: 4px; }
    .mc-chip-name { flex: 1; font-weight: bold; color: var(--camp); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mc-chip-count { font-size: 13px; white-space: nowrap; }
    .mc-chip-count b { font-size: 17px; }
    .mc-bar { height: 5px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden; margin: 3px 0; }
    .mc-bar span { display: block; height: 100%; background: var(--camp); }
    .mc-chip-tags { display: flex; flex-wrap: wrap; gap: 3px; min-height: 0; }
    .mc-flag { font-size: 11px; background: rgba(0,0,0,0.07); border-radius: 8px; padding: 0 5px; cursor: help; }
    .mc-flag-bad { background: #b30000; color: #fff; }
    .mc-flag-round { background: rgba(184,134,11,0.25); }
    .mc-flag-loss { background: rgba(179,0,0,0.12); color: #9a0000; font-weight: bold; }
    .mc-ended { border: 2px solid var(--camp); border-radius: 8px; padding: 8px 10px; margin: 8px 0; text-align: center;
      background: rgba(0,0,0,0.04); font-size: 14px; }
    .mc-ended-title { font-weight: bold; font-size: 16px; margin-bottom: 2px; }
    .mc-chip-cmd { font-size: 12px; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 3px; align-items: center; overflow: hidden; }
    .mc-app select.mc-mini { font-size: 11px !important; min-height: 22px; padding: 1px 3px !important; max-width: 100%; }

    /* Participants */
    .mc-plist { list-style: none; margin: 0; padding: 0; }
    .mc-p { border: 1px solid var(--mc-line); border-left: 4px solid var(--camp); border-radius: 5px; padding: 3px 6px; margin-bottom: 4px; }
    .mc-p .mc-row { margin: 2px 0; }
    .mc-p-done { opacity: 0.8; background: rgba(46,125,50,0.06); }
    .mc-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--camp); flex: 0 0 9px; }
    .mc-p-name { font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mc-p-res { font-size: 12px; color: var(--mc-ok); max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mc-p-wait { font-size: 12px; color: var(--mc-gold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
    .mc-x { cursor: pointer; opacity: 0.5; padding: 0 2px; }
    .mc-x:hover { opacity: 1; color: #b30000; }

    /* Boutons */
    .mc-app .mc-main-btn { display: block; width: 100%; margin: 8px 0 4px !important; min-height: 34px;
      font-size: 14px !important; font-weight: bold; background: var(--mc-red) !important; color: #fff !important; border: none !important; }
    .mc-app .mc-main-btn:disabled { background: #9a9a9a !important; cursor: not-allowed; }
    .mc-app .mc-roll-btn { background: var(--mc-red) !important; color: #fff !important; border: none !important; min-width: 34px; font-size: 15px !important; }
    .mc-app .mc-ok-btn { background: var(--mc-ok) !important; color: #fff !important; border: none !important; min-width: 32px; }
    .mc-app .mc-icon-btn { min-width: 30px; padding: 3px 5px !important; }
    .mc-app .mc-icon-btn sup { font-size: 9px; }
    .mc-app .mc-sm-btn { font-size: 12px !important; }
    .mc-app .mc-danger { color: #b30000 !important; border-color: #b30000 !important; }
    .mc-app .mc-alert-btn { display: block; width: 100%; margin: 6px 0 !important; background: rgba(184,134,11,0.15) !important;
      border: 1px solid var(--mc-gold) !important; color: #6b4e00 !important; font-weight: bold; }
    .mc-app .mc-link { background: none !important; border: none !important; text-decoration: underline; font-size: 12px !important; opacity: 0.8; }

    /* Confirmation d'un jet */
    .mc-confirm { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 4px 0; }
    .mc-confirm input[type=number] { width: 54px !important; text-align: center; font-weight: bold; font-size: 15px !important; }
    .mc-crit { display: inline-flex; align-items: center; gap: 2px; font-size: 14px; cursor: pointer; padding: 0 3px; }
    .mc-crit input { margin: 0 !important; }
    .mc-panel { border: 2px solid var(--mc-gold); border-radius: 7px; padding: 4px 8px 6px; margin: 8px 0; background: rgba(184,134,11,0.07); }
    .mc-panel .mc-section-head { margin-top: 2px; }

    /* Cartes (config, moral) */
    .mc-setup-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .mc-card { border: 1px solid var(--mc-line); border-left: 5px solid var(--camp); border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; background: rgba(255,255,255,0.45); }
    .mc-toggle { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; padding: 1px 7px 1px 3px;
      border: 1px solid var(--mc-line); border-radius: 12px; cursor: pointer; white-space: nowrap; }
    .mc-toggle input { margin: 0 !important; }
    .mc-pill { font-size: 12px; background: rgba(0,0,0,0.07); border-radius: 10px; padding: 1px 7px; }
    .mc-pill a { cursor: pointer; opacity: 0.6; margin-left: 2px; }
    .mc-check { display: flex; align-items: center; gap: 5px; font-size: 12px; margin: 5px 0; }
    .mc-check input { margin: 0 !important; }

    /* Sections repliables */
    .mc-fold { margin-top: 8px; border-top: 1px solid var(--mc-line); padding-top: 4px; }
    .mc-fold > summary { cursor: pointer; font-weight: bold; font-size: 13px; padding: 3px 0; list-style-position: inside; }
    .mc-log { max-height: 160px; overflow-y: auto; font-size: 12px; padding: 2px 0; }
    .mc-log-entry { margin-bottom: 3px; }
    .mc-log-round { font-weight: bold; color: var(--mc-red); margin-right: 3px; }

    /* Fenêtre plus large : deux colonnes pour la configuration */
    @container (min-width: 520px) { .mc-setup-grid { grid-template-columns: 1fr 1fr; } }
    /* Très étroit : camps l'un sous l'autre */
    @container (max-width: 330px) { .mc-score { grid-template-columns: 1fr; } }

    /* Petites boîtes de dialogue de la macro */
    .mc-dialog .mc-dialog-body { font-size: 14px; line-height: 1.45; padding: 4px 2px; }
    .mc-dialog .mc-dialog-lead { font-size: 16px; font-weight: bold; margin: 0 0 6px; }
    .mc-dialog .mc-dialog-sub { font-size: 12px; opacity: 0.75; }
    .mc-dialog .mc-dialog-warn { color: #b30000; font-weight: bold; }
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

  // Rafraîchissement en direct chez tout le monde (MJ et spectateurs).
  // La toute première écriture d'un réglage "world" CRÉE le document Setting
  // (hook createSetting, pas updateSetting) : on écoute donc les deux.
  if (window.__mcUpdateHook) {
    Hooks.off("updateSetting", window.__mcUpdateHook);
    Hooks.off("createSetting", window.__mcUpdateHook);
  }
  window.__mcUpdateHook = (setting) => {
    if (setting.key === `${MC_CONFIG.NAMESPACE}.${SETTING_KEY}` && window.__mcApp?.rendered) {
      window.__mcApp.render();
    }
  };
  Hooks.on("updateSetting", window.__mcUpdateHook);
  Hooks.on("createSetting", window.__mcUpdateHook);

  window.__mcApp.render(true, { focus: true });

})();