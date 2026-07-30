/**
 * ============================================================================
 *  ETU — Passage des Examens de Semestre
 *  Compatible Foundry VTT v13 et v14 — Système SWADE
 * ----------------------------------------------------------------------------
 *  Gère le jet d'Examen (Compétence de Filière + Bonus d'études + Difficulté
 *  d'Examen selon le Rang), la relance via Jeton (Benny), le bonus optionnel
 *  après jet (fixe ou via un point de Conviction en d6!), la résolution
 *  (échec critique / échec / réussite / réussite avec Prouesse), et le jet sur la
 *  table de Perks correspondant à la Filière (Scientifique/Littéraire/Autre).
 *
 *  APPROXIMATIONS ASSUMÉES (à valider/ajuster) :
 *  - Le Rang SWADE est pré-deviné depuis system.advances.rank (chemin non
 *    100% confirmé) mais TOUJOURS modifiable dans le dialogue.
 *  - Le flag "favori" (Accès rapide) est posé via flags.swade.favorite —
 *    non confirmé, à vérifier visuellement après test.
 *  - Les Atouts accordés sont créés comme de simples Items (nom + description
 *    courte), pas importés d'un compendium officiel : leurs règles complètes
 *    restent à appliquer manuellement par le joueur/MJ comme pour tout Atout.
 *  - Le Payday (50% de l'allocation) utilise la même détection de catégorie
 *    de richesse que la macro Allocation Semestrielle.
 *  - La Conviction est simplifiée : utilisation = -1 à sa valeur + 1d6! ajouté
 *    au total, sans réimplémenter toute la mécanique SWADE de Conviction.
 * ============================================================================
 */

(async () => {
 try {

  // ===========================================================================
  // 0. CONFIGURATION GÉNÉRALE
  // ===========================================================================
  const FLAG_SCOPE = game.system.id;
  const FUNDS_PATH = "system.details.currentFunds";

  const RANGS = [
    { id: "freshman", label: "Novice (Freshman)", difficulte: 0, deTable: 6 },
    { id: "sophomore", label: "Aguerri (Sophomore)", difficulte: -1, deTable: 8 },
    { id: "junior", label: "Vétéran (Junior)", difficulte: -2, deTable: 10 },
    { id: "senior", label: "Héroïque (Senior)", difficulte: -4, deTable: 12 },
    { id: "grad", label: "Légendaire (Grad Student)", difficulte: -4, deTable: 12 }
  ];

  const FILIERES = [
    { id: "science", label: "Scientifique", table: "science", competenceSuggeree: "Science" },
    { id: "litteraire", label: "Littéraire", table: "academics", competenceSuggeree: "Academics" },
    { id: "autre", label: "Autre", table: "other", competenceSuggeree: null }
  ];

  const CATEGORIES_RICHESSE = [
    { id: "poor", label: "Pauvre", argent: 250, de: 4 },
    { id: "middle", label: "Classe moyenne", argent: 500, de: 6 },
    { id: "rich", label: "Riche", argent: 1000, de: 8 },
    { id: "filthyRich", label: "Extrêmement riche", argent: 1500, de: 10 }
  ];

  function richesseActive() {
    try { return game.settings.get("swade", "wealthType") === "wealthDie"; }
    catch (e) { return false; }
  }

  // ===========================================================================
  // 1. THÈME VISUEL
  // ===========================================================================
  // ===========================================================================
  // 1. THÈME VISUEL — EN STYLES EN LIGNE (la balise <style> injectée dans le
  //    contenu d'un Dialog semble filtrée par Foundry ; les styles inline sur
  //    chaque élément, eux, passent).
  // ===========================================================================
  const S = {
    dialog: "font-family:Georgia,'Times New Roman',serif;color:#f2ede0;background:linear-gradient(160deg,#182948,#24365f 55%,#182948);border:1px solid #a02020;border-radius:6px;padding:16px 18px;",
    crest: "display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;border:2px solid #a02020;color:#f2ede0;background:rgba(160,32,32,0.15);font-size:10px;font-weight:bold;margin:0 auto 6px;",
    h1: "font-size:17px;letter-spacing:3px;text-transform:uppercase;color:#f2ede0;margin:2px 0;font-weight:bold;",
    sub: "font-size:11px;letter-spacing:1.5px;color:#c7cfe0;text-transform:uppercase;",
    fieldLabel: "display:block;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#e0685c;margin-bottom:4px;font-weight:bold;",
    select: "width:100%;background:rgba(255,255,255,0.1);color:#f2ede0;border:1px solid rgba(242,237,224,0.25);border-radius:4px;padding:7px 9px;font-family:inherit;font-size:13px;color-scheme:dark;",
    hint: "font-size:11px;color:#9fb0d0;margin:0 0 12px;line-height:1.4;",
    card: "display:block;border:1px solid rgba(242,237,224,0.2);border-radius:5px;background:rgba(255,255,255,0.06);padding:8px 10px;cursor:pointer;margin-bottom:6px;",
    cardTitle: "font-weight:bold;font-size:13px;color:#f2ede0;",
    cardDesc: "font-size:11px;color:#9fb0d0;margin:3px 0 0 22px;line-height:1.3;",
    sectionTitle: "font-size:13px;color:#f2ede0;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:18px 0 2px;padding-bottom:5px;border-bottom:2px solid #a02020;",
    resultBox: "text-align:center;margin:4px 0 14px;padding:14px;border-radius:6px;background:rgba(0,0,0,0.25);border:1px solid rgba(242,237,224,0.15);",
    verdictReussite: "font-size:17px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#7fbf6a;",
    verdictEchec: "font-size:17px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#e0685c;",
    verdictCritique: "font-size:17px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#ff5555;",
    totalNombre: "font-size:32px;font-weight:bold;color:#f2ede0;",
    chatH3: "margin:0 0 6px;color:#f2ede0;font-size:16px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;border-bottom:2px solid #a02020;padding-bottom:7px;",
    chatDetail: "font-size:12px;color:#d3c3e0;margin:6px 0;",
    perkCard: "margin:10px 0;padding:10px 12px;border-radius:6px;background:rgba(0,0,0,0.15);border:1px solid #a02020;",
    perkTable: "font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#e0685c;font-weight:bold;margin-bottom:2px;",
    perkTitle: "font-size:14px;color:#f2ede0;font-weight:bold;letter-spacing:.3px;",
    perkDesc: "font-size:12px;color:#b9c4dd;margin:4px 0 6px;font-style:italic;",
    perkEffet: "font-size:12px;color:#d3c3e0;font-weight:bold;",
    perkPermanent: "display:inline-block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#ff5555;border:1px solid #ff5555;border-radius:3px;padding:1px 5px;margin-left:6px;",
    majeureTitre: "font-size:16px;color:#e0685c;text-transform:uppercase;letter-spacing:1px;font-weight:bold;margin-top:16px;padding-bottom:5px;border-bottom:2px solid rgba(242,237,224,0.3);"
  };

  function etuWrap(inner) { return `<div style="${S.dialog}">${inner}</div>`; }
  function etuHeader(title, subtitle) {
    return `<div style="text-align:center;margin-bottom:16px;">
      <div style="${S.crest}">ETU</div>
      <h1 style="${S.h1}">${title}</h1>
      <div style="${S.sub}">${subtitle}</div>
    </div>`;
  }
  // Titre de section avec séparateur, pour bien distinguer les groupes de choix
  function etuSectionTitre(titre, sousTitre = "") {
    return `<div style="${S.sectionTitle}">${titre}</div>${sousTitre ? `<div style="${S.hint}">${sousTitre}</div>` : ""}`;
  }
  function etuField(label, inputHtml) {
    return `<div style="margin-bottom:12px;"><label style="${S.fieldLabel}">${label}</label>${inputHtml}</div>`;
  }
  function etuCartes(nom, options, valeurDefaut) {
    return `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">${options.map(o => `
      <label style="${S.card}">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="${nom}" value="${o.value}" ${o.value === valeurDefaut ? "checked" : ""} style="margin:0;flex-shrink:0;">
          <span style="${S.cardTitle}">${o.titre}</span>
        </div>
        ${o.description ? `<div style="${S.cardDesc}">${o.description}</div>` : ""}
      </label>`).join("")}</div>`;
  }

  // ===========================================================================
  // 2. UTILITAIRES DIALOGUE
  // ===========================================================================
  const hasDialogV2 = !!(foundry?.applications?.api?.DialogV2);
  async function formDialog({ title, content, okLabel = "Valider", boutons = null, onRender = null }) {
    if (hasDialogV2) {
      let result = null;
      const listeBoutons = boutons ?? [
        { action: "ok", label: okLabel, default: true,
          callback: (event, button) => { result = button?.form ? Object.fromEntries(new FormData(button.form)) : {}; } },
        { action: "cancel", label: "Annuler" }
      ];
      const config = { window: { title }, content, buttons: listeBoutons, rejectClose: false };
      if (onRender) config.render = onRender; // callback API légitime, pas un <script> injecté (filtré côté contenu)
      await foundry.applications.api.DialogV2.wait(config);
      return result;
    } else {
      return new Promise((resolve) => {
        new Dialog({
          title,
          content: `<form>${content}</form>`,
          buttons: {
            ok: { label: okLabel, callback: (html) => resolve(Object.fromEntries(new FormData(html[0].querySelector("form")))) },
            cancel: { label: "Annuler", callback: () => resolve(null) }
          },
          default: "ok",
          render: onRender ?? undefined
        }).render(true);
      });
    }
  }
  function notify(type, msg) { ui.notifications[type]?.(msg) ?? ui.notifications.info(msg); }

  // ===========================================================================
  // 3. RÉCUPÉRATION DE L'ACTEUR
  // ===========================================================================
  const controlled = canvas.tokens.controlled;
  let actor;
  if (controlled.length === 1) actor = controlled[0].actor;
  else if (controlled.length === 0) actor = game.user.character;
  if (!actor) { notify("warn", "Sélectionne un unique token (ou assigne-toi un personnage) avant de lancer la macro."); return; }
  if (controlled.length > 1) { notify("warn", "Plusieurs tokens sélectionnés : sélectionne-en un seul."); return; }

  // ===========================================================================
  // 4. NETTOYAGE DES EFFETS DU PRÉCÉDENT EXAMEN (sauf ceux marqués permanents)
  // ===========================================================================
  async function retirerEffetsExamenPrecedent() {
    const anciens = actor.effects.filter(e => e.getFlag(FLAG_SCOPE, "etuExam") && !e.getFlag(FLAG_SCOPE, "etuExamPermanent"));
    if (anciens.length) await actor.deleteEmbeddedDocuments("ActiveEffect", anciens.map(e => e.id));
  }

  // ===========================================================================
  // 5. DIALOGUE DE PARAMÉTRAGE (Statut académique / Rang / Filière(s) / Majeure(s))
  // ===========================================================================
  function deviverRangDefaut() {
    const rangBrut = (actor.system?.advances?.rank ?? 0);
    if (rangBrut >= 4) return "grad";
    if (rangBrut === 3) return "senior";
    if (rangBrut === 2) return "junior";
    if (rangBrut === 1) return "sophomore";
    return "freshman";
  }

  const rangDefaut = deviverRangDefaut();
  const competencesActeur = actor.items.filter(i => i.type === "skill").map(i => i.name);
  const dejaDoubleMajor = actor.effects.some(e => e.getFlag(FLAG_SCOPE, "etuDoubleMajor"));
  const statutInitial = dejaDoubleMajor ? "double" : "simple";

  const optionsFiliere = FILIERES.map(f => `<option style="background:#1d2c4d;color:#f2ede0;" value="${f.id}">${f.label}</option>`).join("");
  const optionsCompetence = competencesActeur.map(c => `<option style="background:#1d2c4d;color:#f2ede0;" value="${c}">${c}</option>`).join("");

  const parametres = await formDialog({
    title: "Examen de Semestre — ETU",
    okLabel: "Configurer le jet",
    content: etuWrap(`
      ${etuHeader("Bureau des Examens", `${actor.name} — Préparation de l'examen`)}

      ${etuSectionTitre("Statut académique")}
      ${etuCartes("statut", [
        { value: "simple", titre: "Filière unique", description: "Une seule Compétence de Filière, un seul jet d'examen." },
        { value: "double", titre: "Double Filière", description: "Deux Majeures, deux jets indépendants, -2 Bonus d'études permanent." },
        { value: "general", titre: "Études Générales", description: "Majeure non déclarée — jet d'Intellect -1 à la place." }
      ], dejaDoubleMajor ? "double" : "simple")}

      ${etuSectionTitre("Année d'études", `Rang académique — modifiable pour les cas particuliers (ex. "Vétéran de Pinebox").`)}
      ${etuCartes("rang", RANGS.map(r => ({ value: r.id, titre: r.label, description: `Difficulté d'examen ${r.difficulte >= 0 ? "+" : ""}${r.difficulte}, table en d${r.deTable}` })), rangDefaut)}

      ${etuSectionTitre("Filière &amp; Compétence de Filière", `Ignoré en "Études Générales" (aucune Compétence de Filière).`)}
      <div id="etu-bloc-filiere-principale" style="display:${statutInitial === "general" ? "none" : "block"};">
        ${etuField("Filière (détermine la table de résultats)", `<select name="filiere1" style="${S.select}">${optionsFiliere}</select>`)}
        ${etuField("Compétence de Filière (modifiable)", `<select name="competence1" style="${S.select}">${optionsCompetence}</select>`)}
      </div>
      <div id="etu-bloc-filiere-supp" style="display:${dejaDoubleMajor ? "block" : "none"};">
        ${etuField("Filière Supplémentaire (Double Filière)", `<select name="filiere2" style="${S.select}">${optionsFiliere}</select>`)}
        ${etuField("Compétence de Filière Supplémentaire (Double Filière)", `<select name="competence2" style="${S.select}">${optionsCompetence}</select>`)}
      </div>
    `),
    onRender: (event, dialog) => {
      const racine = dialog.element ?? dialog;
      const blocPrincipal = racine.querySelector?.("#etu-bloc-filiere-principale");
      const blocSupp = racine.querySelector?.("#etu-bloc-filiere-supp");
      const carteGeneral = racine.querySelector?.('input[name="statut"][value="general"]')?.closest("label");
      if (!blocPrincipal && !blocSupp && !carteGeneral) return;

      // Règle du livre : "General Studies students MUST declare a Major
      // before becoming juniors" — donc plus disponible à partir de Vétéran (Junior).
      const rangsInterditsEtudesGenerales = ["junior", "senior", "grad"];

      const majFiliereBlocs = () => {
        const valeur = racine.querySelector('input[name="statut"]:checked')?.value;
        if (blocPrincipal) blocPrincipal.style.display = valeur === "general" ? "none" : "block";
        if (blocSupp) blocSupp.style.display = valeur === "double" ? "block" : "none";
      };

      const majCarteEtudesGenerales = () => {
        if (!carteGeneral) return;
        const rangValeur = racine.querySelector('input[name="rang"]:checked')?.value;
        const doitMasquer = rangsInterditsEtudesGenerales.includes(rangValeur);
        carteGeneral.style.display = doitMasquer ? "none" : "block";
        if (doitMasquer) {
          const radioGeneral = racine.querySelector('input[name="statut"][value="general"]');
          if (radioGeneral?.checked) {
            const radioSimple = racine.querySelector('input[name="statut"][value="simple"]');
            if (radioSimple) { radioSimple.checked = true; majFiliereBlocs(); }
          }
        }
      };

      racine.querySelectorAll('input[name="statut"]').forEach(radio => radio.addEventListener("change", majFiliereBlocs));
      racine.querySelectorAll('input[name="rang"]').forEach(radio => radio.addEventListener("change", majCarteEtudesGenerales));
      majCarteEtudesGenerales(); // état initial cohérent avec le Rang pré-sélectionné
    }
  });

  if (!parametres) return;
  const rang = RANGS.find(r => r.id === parametres.rang);
  const statut = parametres.statut;
  if (!rang || !statut) { notify("warn", "Configuration incomplète."); return; }

  // Gestion de l'effet PERMANENT "Double Major" (-2 Bonus d'études, jamais
  // retiré par le nettoyage automatique de fin d'examen)
  const effetDoubleMajorExistant = actor.effects.find(e => e.getFlag(FLAG_SCOPE, "etuDoubleMajor"));
  if (statut === "double" && !effetDoubleMajorExistant) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "ETU — Double Filière (permanent)",
      img: "icons/svg/upgrade.svg",
      origin: actor.uuid,
      disabled: false,
      transfer: false,
      changes: [{ key: "system.additionalStats.scholarship.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2", priority: 20 }],
      flags: { [FLAG_SCOPE]: { etuDoubleMajor: true } }
    }]);
  } else if (statut !== "double" && effetDoubleMajorExistant) {
    const confirmationMinor = await formDialog({
      title: "Statut Double Filière — ETU",
      okLabel: "Confirmer",
      content: etuWrap(`
        ${etuHeader("Bureau des Examens", "Retirer le statut Double Filière ?")}
        <p style="font-size:12px;color:#d3c3e0;">Le personnage a actuellement le statut Double Filière actif (-2 Bonus d'études permanent). Le retirer revient à déclarer l'ancienne Filière comme "mineure".</p>
        ${etuField("Retirer le statut Double Filière ?", `<select name="retirer" style="${S.select}"><option style="background:#1d2c4d;color:#f2ede0;" value="non">Non, le conserver</option><option style="background:#1d2c4d;color:#f2ede0;" value="oui">Oui, le retirer</option></select>`)}
      `)
    });
    if (confirmationMinor?.retirer === "oui") await actor.deleteEmbeddedDocuments("ActiveEffect", [effetDoubleMajorExistant.id]);
  }

  // Liste des "passages" d'examen à traiter (1 ou 2 selon le statut)
  const majeuresATraiter = [];
  if (statut === "general") {
    majeuresATraiter.push({ label: "Études Générales (Intellect)", nomCompetence: null, filiere: FILIERES.find(f => f.id === parametres.filiere1), estGeneralStudies: true });
  } else if (statut === "double") {
    majeuresATraiter.push({ label: `Filière (${parametres.competence1})`, nomCompetence: parametres.competence1, filiere: FILIERES.find(f => f.id === parametres.filiere1), estGeneralStudies: false });
    majeuresATraiter.push({ label: `Filière Supplémentaire (${parametres.competence2})`, nomCompetence: parametres.competence2, filiere: FILIERES.find(f => f.id === parametres.filiere2), estGeneralStudies: false });
  } else {
    majeuresATraiter.push({ label: `Filière (${parametres.competence1})`, nomCompetence: parametres.competence1, filiere: FILIERES.find(f => f.id === parametres.filiere1), estGeneralStudies: false });
  }

  // Bonus d'études capturé UNE SEULE FOIS avant tout jet de cette session
  // d'examen (les deux Majeures d'un Double Major utilisent la même valeur
  // de départ, non affectée par le résultat de l'autre Majeure)
  const bonusEtudesInitial = Number(actor.system?.additionalStats?.scholarship?.value ?? 0);

  // ===========================================================================
  // 6. DÉCLENCHEMENT DU JET NATIF SWADE + LECTURE AUTOMATIQUE DU RÉSULTAT
  //    On intercepte le message de chat créé par le jet (Hooks.once), qui
  //    contient un objet Roll standard Foundry (.total fiable) — ça évite de
  //    dépendre d'un format de retour incertain de item.roll(). Seul point
  //    resté manuel : confirmer un éventuel échec critique (double 1 naturel),
  //    indétectable depuis le seul total final.
  // ===========================================================================
  async function jouerJetEtLireTotal(majeure, bonusEtudes, difficulteExamen, bonusCumule) {
    return new Promise((resolve) => {
      let resolu = false;
      const finaliser = (total, automatique, critiqueDetecte) => {
        if (resolu) return;
        resolu = true;
        resolve({ total, automatique, critiqueDetecte });
      };

      const hookId = Hooks.on("createChatMessage", (message) => {
        if (resolu) return;
        if (message.speaker?.actor !== actor.id) return;
        const roll = message.rolls?.[0];
        if (!roll) return;
        Hooks.off("createChatMessage", hookId);

        // Détection automatique de l'échec critique : on inspecte les dés
        // individuels (dé de compétence + dé sauvage) pour voir si les DEUX
        // affichent un 1 au tout premier lancer (avant explosion éventuelle).
        // Si la structure ne s'y prête pas (ex. un seul dé trouvé), on renvoie
        // null et la question sera posée manuellement en repli.
        let critiqueDetecte = null;
        try {
          const des = roll.dice ?? [];
          if (des.length >= 2) {
            critiqueDetecte = des.every(d => d.results?.[0]?.result === 1);
          }
        } catch (e) {
          console.warn("[ETU — Examens] Impossible d'inspecter les dés individuels du jet :", e);
        }

        finaliser(roll.total, true, critiqueDetecte);
      });

      // Modificateurs passés DIRECTEMENT au jet (pas d'Active Effect, qui
      // s'est révélé buggé — le dialogue natif accumulait une ligne à
      // chaque appel). "additionalMods" est une supposition sur le nom du
      // paramètre ; à vérifier via la capture du dialogue (une ligne par
      // composante doit apparaître, avec la bonne valeur chacune).
      // Bonus d'études et Difficulté d'examen séparés (demande explicite),
      // + une éventuelle troisième ligne si un bonus après-jet a déjà été
      // cumulé lors d'une relance précédente sur cette même Majeure.
      const modsSupplementaires = [
        { name: "ETU — Bonus d'études", label: "ETU — Bonus d'études", value: bonusEtudes },
        { name: "ETU — Difficulté d'examen", label: "ETU — Difficulté d'examen", value: difficulteExamen },
        ...(bonusCumule ? [{ name: "ETU — Bonus cumulé (Examen)", label: "ETU — Bonus cumulé (Examen)", value: bonusCumule }] : [])
      ];
      const modificateurAAppliquer = bonusEtudes + difficulteExamen + bonusCumule;

      (async () => {
        try {
          if (majeure.estGeneralStudies) {
            await actor.rollAttribute("smarts", { additionalMods: modsSupplementaires });
          } else {
            const item = actor.items.find(i => i.name === majeure.nomCompetence && i.type === "skill");
            await item.roll({ additionalMods: modsSupplementaires });
          }
        } catch (e) {
          console.warn("[ETU — Examens] Déclenchement automatique du jet impossible :", e);
          notify("warn", `Lance manuellement le jet de "${majeure.estGeneralStudies ? "Intellect" : majeure.nomCompetence}" sur la fiche, et ajoute toi-même : Bonus d'études ${bonusEtudes >= 0 ? "+" : ""}${bonusEtudes}, Difficulté d'examen ${difficulteExamen >= 0 ? "+" : ""}${difficulteExamen}${bonusCumule ? `, Bonus cumulé ${bonusCumule >= 0 ? "+" : ""}${bonusCumule}` : ""} via le champ "Nom"/"Valeur" + "Ajout" du dialogue de jet.`);
        }
      })();
    });
  }

  // ===========================================================================
  // 7-9. TRAITEMENT COMPLET D'UNE MAJEURE : jet natif (résultat lu automatiquement)
  //      + confirmation manuelle d'échec critique + relance gratuite (Compétence
  //      Majeure) + résolution (échec critique/échec/réussite) + jet sur la
  //      table de Perks
  // ===========================================================================
  async function traiterUneMajeure(majeure) {
    const resume = [];
    const desAffiche = majeure.estGeneralStudies
      ? (actor.system?.attributes?.smarts?.die?.sides ?? 4)
      : (actor.items.find(i => i.name === majeure.nomCompetence && i.type === "skill")?.system?.die?.sides ?? 4);
    const difficulteSupp = majeure.estGeneralStudies ? -1 : 0; // "Smarts -1" en Études Générales
    const difficulteExamen = rang.difficulte + difficulteSupp;

    let bonusCumule = 0;
    let verdict = null;
    let continuer = true;
    let relanceGratuiteDisponible = !majeure.estGeneralStudies; // Compétence de Filière : 1 relance gratuite/examen
    let besoinNouveauJet = true;
    let totalActuel = 0;
    let automatiqueActuel = true;
    let critiqueActuel = null; // true/false si détecté automatiquement, null si à demander

    while (continuer) {
      if (besoinNouveauJet) {
        notify("info", `Jet en cours pour ${majeure.label} — Bonus d'études ${bonusEtudesInitial >= 0 ? "+" : ""}${bonusEtudesInitial} et Difficulté d'examen ${difficulteExamen >= 0 ? "+" : ""}${difficulteExamen} transmis automatiquement au dialogue de jet ; vérifie qu'ils apparaissent bien dans la liste des modificateurs avant de lancer.`);
        const resultatJet = await jouerJetEtLireTotal(majeure, bonusEtudesInitial, difficulteExamen, bonusCumule);
        totalActuel = resultatJet.total;
        automatiqueActuel = resultatJet.automatique;
        critiqueActuel = resultatJet.critiqueDetecte;
        besoinNouveauJet = false;
      }

      const bennies = actor.system?.bennies?.value ?? 0;

      const blocCritique = critiqueActuel === null
        ? `${etuField("Est-ce un échec critique (double 1 naturel — compétence ET dé sauvage) ?", "")}
           ${etuCartes("critique", [
             { value: "non", titre: "Non", description: "Résultat normal, calculé depuis le total." },
             { value: "oui", titre: "Oui — Échec critique", description: "Double 1 naturel, remplace le résultat normal." }
           ], "non")}`
        : `<div style="${S.hint}">Échec critique (double 1 naturel) : <strong style="color:${critiqueActuel ? "#ff5555" : "#7fbf6a"};">${critiqueActuel ? "OUI, détecté automatiquement" : "Non, détecté automatiquement"}</strong></div>
           <input type="hidden" name="critique" value="${critiqueActuel ? "oui" : "non"}">`;

      const rapport = await formDialog({
        title: "Résultat du jet — ETU",
        okLabel: "Continuer",
        content: etuWrap(`
          ${etuHeader("Bureau des Examens", `${actor.name} — ${majeure.label}`)}
          <div style="${S.resultBox}">
            <div style="${S.sub}">Total ${automatiqueActuel ? "détecté" : "saisi"}</div>
            <div style="${S.totalNombre}">${totalActuel}</div>
          </div>
          ${blocCritique}
          ${etuSectionTitre("Action supplémentaire", "Facultatif, avant de valider.")}
          ${etuField("Action", `
            <select name="action" style="${S.select}">
              <option style="background:#1d2c4d;color:#f2ede0;" value="valider">Valider ce résultat tel quel</option>
              ${bennies > 0 ? `<option style="background:#1d2c4d;color:#f2ede0;" value="jeton">Relancer avec un Jeton (${bennies} disponible(s)) — non natif à SWADE</option>` : ""}
              ${relanceGratuiteDisponible ? `<option style="background:#1d2c4d;color:#f2ede0;" value="relanceGratuite">Relance GRATUITE (Compétence de Filière — usage unique)</option>` : ""}
              <option style="background:#1d2c4d;color:#f2ede0;" value="bonusFixe">Ajouter un bonus après jet (nombre fixe ou formule, ex. Conviction 1d6!)</option>
            </select>`)}
          <p style="${S.hint}">La dépense de Conviction AVANT/PENDANT le jet est gérée directement dans le dialogue de jet natif SWADE, pas ici.</p>
          ${etuField('Si "bonus après jet" — nombre ou formule Foundry', `<input type="text" name="valeurBonus" value="1" placeholder="ex. 2 ou 1d6x pour la Conviction" style="${S.select}">`)}
        `)
      });

      if (!rapport) return null;

      if (rapport.action === "jeton") {
        try {
          await actor.spendBenny();
        } catch (e) {
          console.warn("[ETU — Examens] actor.spendBenny() indisponible, décrémentation manuelle en repli :", e);
          await actor.update({ "system.bennies.value": bennies - 1 });
        }
        besoinNouveauJet = true;
        continue;

      } else if (rapport.action === "relanceGratuite") {
        relanceGratuiteDisponible = false;
        besoinNouveauJet = true;
        continue;

      } else if (rapport.action === "bonusFixe") {
        try {
          const jetBonus = await new Roll(rapport.valeurBonus || "0").evaluate();
          bonusCumule += jetBonus.total;
          totalActuel += jetBonus.total; // s'ajoute au total déjà obtenu, PAS de nouveau jet
        } catch (e) {
          notify("warn", `Formule de bonus invalide ("${rapport.valeurBonus}") — ignorée.`);
        }
        continue;
      }

      if (rapport.critique === "oui") {
        verdict = { type: "critique", raises: 0 };
      } else if (totalActuel < 4) {
        verdict = { type: "echec", raises: 0 };
      } else {
        verdict = { type: "reussite", raises: Math.floor((totalActuel - 4) / 4) };
      }
      continuer = false;
    }

    resume.push(`<div style="${S.majeureTitre}">${majeure.label}${majeure.estGeneralStudies ? "" : ` (d${desAffiche})`}</div>`);

    if (verdict.type === "critique") {
      await appliquerEffetsSimples(`Probation Académique (${majeure.label})`, [effetStatEtendue("scholarship", -2), effetCompetence("Persuasion", -2)], "au prochain examen");
      resume.push(`<div style="${S.chatDetail}"><strong style="color:#ff5555;">ÉCHEC CRITIQUE</strong> — Probation Académique : Bonus d'études -2 et Persuasion -2 jusqu'au prochain examen.</div>`);

    } else if (verdict.type === "echec") {
      await appliquerEffetsSimples(`Échec à l'examen (${majeure.label})`, [effetStatEtendue("scholarship", -2)], "au prochain examen");
      resume.push(`<div style="${S.chatDetail}"><strong style="color:#e0685c;">Échec</strong> — Bonus d'études -2 jusqu'au prochain examen.</div>`);

    } else {
      async function jeterSurTable(idTable, bonusJet = 0) {
        const jet = await new Roll(`1d${rang.deTable}`).evaluate();
        const resultatNumero = Math.min(12, Math.max(1, jet.total + bonusJet));
        return { numero: resultatNumero, table: idTable };
      }

      // Injecte la description (VF) du perk dans les Active Effects créés par
      // perk.appliquer(), en repérant ceux apparus DEPUIS l'appel (comparaison
      // d'IDs) — évite de modifier les 36 perks individuellement. La description
      // du perk est ajoutée en tête ; une description déjà présente (ex. note
      // de compétence pour Scholar) est conservée en dessous.
      async function injecterDescriptionPerk(idsAvant, descriptionPerk) {
        const nouveaux = actor.effects.filter(e => !idsAvant.has(e.id));
        for (const effet of nouveaux) {
          const descriptionActuelle = effet.description ?? "";
          const nouvelleDescription = descriptionActuelle
            ? `${descriptionPerk}<br><br>${descriptionActuelle}`
            : descriptionPerk;
          try { await effet.update({ description: nouvelleDescription }); } catch (e) { /* ignore si le champ n'existe pas */ }
        }
      }

      async function resoudrePerk(idTable, numero, profondeur = 0) {
        const perk = TABLES[idTable][numero];
        resume.push(`<div style="${S.perkCard}"><div style="${S.perkTable}">Table ${NOM_TABLE_FR[idTable]} — ${numero}</div><div style="${S.perkTitle}">${perk.titre}</div><div style="${S.perkDesc}">${perk.description}</div>`);
        const idsAvant = new Set(actor.effects.map(e => e.id));
        const retour = await perk.appliquer(majeure.nomCompetence ?? "Intellect");
        await injecterDescriptionPerk(idsAvant, perk.description);

        if (retour === "JACKPOT") {
          const rejet = await jeterSurTable(idTable);
          resume.push(`<div style="${S.perkEffet}">JACKPOT : nouveau jet sur la même table, résultat rendu <strong>permanent</strong>.</div></div>`);
          if (profondeur < 5) await resoudrePerkPermanent(idTable, rejet.numero);

        } else if (retour === "MULTIDISCIPLINAIRE") {
          resume.push(`</div>`);
          const [choixA, choixB] = ALTERNATIVES_MULTIDISCIPLINAIRE[idTable];
          const choixTableAlt = await formDialog({
            title: "Pluridisciplinaire — ETU",
            okLabel: "Relancer",
            content: etuWrap(`
              ${etuHeader("Bureau des Examens", "Sur quelle autre table relancer (+1) ?")}
              ${etuField("Table", `
                <select name="tableAlt" style="${S.select}">
                  <option style="background:#1d2c4d;color:#f2ede0;" value="${choixA}">${NOM_TABLE_FR[choixA]}</option>
                  <option style="background:#1d2c4d;color:#f2ede0;" value="${choixB}">${NOM_TABLE_FR[choixB]}</option>
                </select>`)}
            `)
          });
          if (choixTableAlt?.tableAlt && profondeur < 5) {
            const rejet = await jeterSurTable(choixTableAlt.tableAlt, 1);
            await resoudrePerk(choixTableAlt.tableAlt, rejet.numero, profondeur + 1);
          }
        } else {
          resume.push(`<div style="${S.perkEffet}">${retour}</div></div>`);
        }
      }

      async function resoudrePerkPermanent(idTable, numero) {
        const perk = TABLES[idTable][numero];
        resume.push(`<div style="${S.perkCard}"><div style="${S.perkTable}">Table ${NOM_TABLE_FR[idTable]} — ${numero}</div><div style="${S.perkTitle}">${perk.titre}<span style="${S.perkPermanent}">Permanent</span></div><div style="${S.perkDesc}">${perk.description}</div>`);
        const idsAvant = new Set(actor.effects.map(e => e.id));
        const retour = await perk.appliquer(majeure.nomCompetence ?? "Intellect");
        await injecterDescriptionPerk(idsAvant, perk.description);
        if (retour === "JACKPOT" || retour === "MULTIDISCIPLINAIRE") {
          resume.push(`<div style="${S.perkEffet}">Nouveau Jackpot/Pluridisciplinaire enchaîné — relance manuelle recommandée.</div></div>`);
        } else {
          resume.push(`<div style="${S.perkEffet}">${retour}</div></div>`);
        }
      }

      const premierJet = await jeterSurTable(majeure.filiere.table);
      resume.push(`<div style="${S.chatDetail}"><strong style="color:#7fbf6a;">Réussite${verdict.raises > 0 ? " avec Prouesse" : ""}</strong> — jet sur la table ${NOM_TABLE_FR[majeure.filiere.table]} (d${rang.deTable}).</div>`);

      if (verdict.raises > 0) {
        const secondJet = await jeterSurTable(majeure.filiere.table);
        const choixDoubleJet = await formDialog({
          title: "Réussite avec Prouesse — ETU",
          okLabel: "Choisir",
          content: etuWrap(`
            ${etuHeader("Bureau des Examens", "Prouesse obtenue : choisis l'un des deux résultats")}
            ${etuField("Résultat à retenir", `
              <select name="choixResultat" style="${S.select}">
                <option style="background:#1d2c4d;color:#f2ede0;" value="${premierJet.numero}">Résultat ${premierJet.numero} — ${TABLES[majeure.filiere.table][premierJet.numero].titre}</option>
                <option style="background:#1d2c4d;color:#f2ede0;" value="${secondJet.numero}">Résultat ${secondJet.numero} — ${TABLES[majeure.filiere.table][secondJet.numero].titre}</option>
              </select>`)}
          `)
        });
        const numeroRetenu = Number(choixDoubleJet?.choixResultat ?? premierJet.numero);
        await resoudrePerk(majeure.filiere.table, numeroRetenu);
      } else {
        await resoudrePerk(majeure.filiere.table, premierJet.numero);
      }
    }

    return resume;
  }

  // ===========================================================================
  // 8. TABLES DE PERKS (Academics / Science / Other) — descriptions reformulées
  // ===========================================================================
  // Crée l'Atout (Item réel) et, si une durée est précisée (Atout temporaire),
  // un Active Effect favorisé compagnon (visible en Accès rapide) qui trace
  // cette durée et sera retiré au prochain examen (sauf permanent=true).
  // Sans durée : l'Atout est considéré acquis DÉFINITIVEMENT, pas d'AE créé.
  // Recherche un Atout par son nom anglais canonique dans TOUS les compendiums
  // d'Items chargés. Priorité aux compendiums venant d'un MODULE installé
  // (ex. le compendium officiel SWADE Core Rules, s'il est présent) plutôt
  // que le pack basique fourni avec le système lui-même — les modules dédiés
  // contiennent généralement plus de détails/automatisation. Le pack du
  // système sert de repli si rien n'est trouvé ailleurs.
  async function trouverAtoutCompendium(nomAnglais) {
    const packsItems = game.packs.filter(p => p.documentName === "Item");
    const packsTries = [...packsItems].sort((a, b) => {
      const aEstSysteme = a.metadata.packageType === "system" ? 1 : 0;
      const bEstSysteme = b.metadata.packageType === "system" ? 1 : 0;
      return aEstSysteme - bEstSysteme; // les packs "module" passent avant les packs "system"
    });

    for (const pack of packsTries) {
      try {
        const index = await pack.getIndex();
        const entree = index.find(i => i.type === "edge" && i.name.toLowerCase() === nomAnglais.toLowerCase());
        if (entree) return await pack.getDocument(entree._id);
      } catch (e) {
        console.warn(`[ETU — Examens] Impossible de lire le compendium "${pack.metadata.label}" :`, e);
      }
    }
    return null;
  }

  // Importe l'Atout RÉEL depuis un compendium (règles/description officielles
  // incluses) plutôt que d'en fabriquer un vide. Si introuvable dans aucun
  // compendium chargé, prévient et n'ajoute rien (à faire manuellement).
  // Si une durée est précisée (Atout temporaire), crée en plus un Active
  // Effect favorisé compagnon qui trace cette durée (aucun changement
  // mécanique dessus — l'Atout importé porte les vraies règles).
  async function creerAtout(nomAnglais, duree = null, permanent = false, noteComplement = "") {
    const source = await trouverAtoutCompendium(nomAnglais);
    if (!source) {
      notify("warn", `Atout "${nomAnglais}" introuvable dans les compendiums chargés — ajoute-le manuellement depuis un compendium SWADE.`);
      return null;
    }

    const [edge] = await actor.createEmbeddedDocuments("Item", [source.toObject()]);
    try { await edge.setFlag("swade", "favorite", true); } catch (e) {}

    if (duree) {
      const [effet] = await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: `ETU — ${edge.name} (${duree})`,
        img: edge.img ?? "icons/svg/upgrade.svg",
        origin: actor.uuid,
        disabled: false,
        transfer: false,
        changes: [],
        description: noteComplement || `Atout importé du compendium : ${edge.name}. Durée : ${duree}.`,
        flags: { [FLAG_SCOPE]: { etuExam: true, etuExamPermanent: permanent } }
      }]);
      try { await effet.setFlag("swade", "favorite", true); } catch (e) {}
    }
    return edge;
  }

  // Rappel purement narratif (aucun changement mécanique), pour les perks sans
  // Atout ni bonus chiffré (ex. ignorer un Handicap, substituer un composant).
  async function creerRappelActif(titre, texte, duree, permanent = false) {
    const [effet] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `ETU — ${titre} (${duree})`,
      img: "icons/svg/clockwork.svg",
      origin: actor.uuid,
      disabled: false,
      transfer: false,
      changes: [],
      description: texte,
      flags: { [FLAG_SCOPE]: { etuExam: true, etuExamPermanent: permanent } }
    }]);
    try { await effet.setFlag("swade", "favorite", true); } catch (e) {}
    return effet;
  }

  function effetCompetence(nomAnglais, valeur) {
    return { key: `@Skill{${nomAnglais}}[system.die.modifier]`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(valeur) };
  }
  function effetCompetenceCran(nomAnglais, crans) {
    return { key: `@Skill{${nomAnglais}}[system.die.sides]`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(crans * 2) };
  }
  function effetStatEtendue(cle, valeur) {
    return { key: `system.additionalStats.${cle}.value`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(valeur) };
  }

  // Traduit un tableau de "changes" en résumé technique lisible (VF), pour
  // affichage dans la description de l'Active Effect (ex. "Bonus d'études : +2").
  function resumerChangementsTechnique(changes) {
    if (!changes.length) return "";
    const lignes = changes.map(c => {
      const valeur = Number(c.value);
      const signe = valeur > 0 ? "+" : "";
      const matchSkillModifier = c.key.match(/^@Skill\{(.+)\}\[system\.die\.modifier\]$/);
      const matchSkillCran = c.key.match(/^@Skill\{(.+)\}\[system\.die\.sides\]$/);
      let nom;
      if (matchSkillModifier) nom = matchSkillModifier[1];
      else if (matchSkillCran) nom = `${matchSkillCran[1]} (cran de dé)`;
      else if (c.key === "system.additionalStats.scholarship.value") nom = "Bonus d'études";
      else if (c.key.startsWith("system.attributes.")) nom = c.key.split(".")[2];
      else nom = c.key;
      return `${nom} : ${signe}${valeur}`;
    });
    return lignes.join(" · ");
  }

  async function garantirCompetence(nomAnglais, attribut, desDepart = 4) {
    const existe = actor.items.find(i => i.type === "skill" && i.name === nomAnglais);
    if (existe) return false;
    await actor.createEmbeddedDocuments("Item", [{
      name: nomAnglais, type: "skill",
      system: { die: { sides: desDepart, modifier: 0 }, attribute: attribut }
    }]);
    return true;
  }

  // Effets chiffrés (hors Atouts) : un seul Active Effect combinant les
  // changements ET la durée dans son nom, favorisé pour l'Accès rapide.
  // Le descriptif inclut le détail technique (quel bonus, sur quoi).
  async function appliquerEffetsSimples(titre, changes, duree, permanent = false) {
    const [effet] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `ETU — ${titre} (${duree})`,
      img: "icons/svg/upgrade.svg",
      origin: actor.uuid,
      disabled: false,
      transfer: false,
      changes: changes.map(c => ({ ...c, priority: 20 })),
      description: `Effet mécanique : ${resumerChangementsTechnique(changes)}. Actif jusqu'à ${duree}.`,
      flags: { [FLAG_SCOPE]: { etuExam: true, etuExamPermanent: permanent } }
    }]);
    try { await effet.setFlag("swade", "favorite", true); } catch (e) {}
  }

  async function detecterCategorieRichesse() {
    const aFilthyRich = actor.items.some(i => i.type === "edge" && /filthy\s*rich/i.test(i.name));
    if (aFilthyRich) return CATEGORIES_RICHESSE.find(c => c.id === "filthyRich");
    const aRiche = actor.items.some(i => i.type === "edge" && /^rich$/i.test(i.name.trim()));
    if (aRiche) return CATEGORIES_RICHESSE.find(c => c.id === "rich");
    const aPauvre = actor.items.some(i => i.type === "hindrance" && /poverty/i.test(i.name));
    if (aPauvre) return CATEGORIES_RICHESSE.find(c => c.id === "poor");
    return CATEGORIES_RICHESSE.find(c => c.id === "middle");
  }

  const TABLE_ACADEMICS = {
    1: { titre: "Confiance", description: "La réussite inattendue vous redonne foi en vous.",
      appliquer: async () => { await actor.update({ "system.details.conviction.value": (actor.system.details.conviction.value ?? 0) + 1 }); return "Un point de Conviction gagné."; } },
    2: { titre: "Groupe d'étude efficace", description: "Vos méthodes de révision ont porté leurs fruits sur le terrain.",
      appliquer: async () => { await creerAtout("Investigator", "1 session de jeu"); return "Atout Investigator accordé pour une session de jeu (cumulable si déjà possédé)."; } },
    3: { titre: "Touche-à-tout", description: "Votre cerveau déborde d'informations diverses.",
      appliquer: async () => { await creerAtout("Jack-of-all-Trades", "1 session de jeu"); return "Atout Jack-of-all-Trades accordé pour une session de jeu."; } },
    4: { titre: "Petit génie", description: "Le succès en appelle un autre.",
      appliquer: async () => { await appliquerEffetsSimples("Petit génie", [effetStatEtendue("scholarship", 2)], "au prochain examen"); return "+2 Bonus d'études."; } },
    5: { titre: "Cerveau surpuissant", description: "La maîtrise de votre matière principale devient remarquable.",
      appliquer: async (competenceActuelle) => {
        const dejaScholar = actor.items.some(i => i.type === "edge" && /scholar/i.test(i.name));
        if (dejaScholar) { await actor.update({ "system.details.conviction.value": (actor.system.details.conviction.value ?? 0) + 1 }); return "Atout Scholar déjà possédé : un point de Conviction gagné à la place."; }
        await creerAtout("Scholar");
        return `Atout Scholar accordé — pense à préciser manuellement la compétence concernée : ${competenceActuelle}.`;
      } },
    6: { titre: "Intelligence étrange", description: "Le cours de mythologie s'avère payant.",
      appliquer: async () => { await appliquerEffetsSimples("Intelligence étrange", [effetCompetence("Occult", 1)], "au prochain examen"); return "+1 Occultisme (hors rituels)."; } },
    7: { titre: "Level Up", description: "Vous avez vraiment appris quelque chose ce semestre.",
      appliquer: async (competenceActuelle) => { await appliquerEffetsSimples("Level Up", [effetCompetenceCran(competenceActuelle, 1)], "au prochain examen"); return `+1 cran de dé sur ${competenceActuelle} (max d12).`; } },
    8: { titre: "Maître du Trivia", description: "Vous allez déchirer au quiz du Pizza Barn.",
      appliquer: async () => { await appliquerEffetsSimples("Maître du Trivia", [effetCompetenceCran("Common Knowledge", 1)], "au prochain examen"); return "+1 cran de dé sur Connaissance générale."; } },
    9: { titre: "Faiseur de tests", description: "Il y a les examens, et il y a les Tests.",
      appliquer: async () => { await creerAtout("Feint", "jusqu'au prochain examen"); return "Atout Feint accordé (usage lors des Tests de Combat) jusqu'au prochain examen."; } },
    10: { titre: "Réflexes affûtés", description: "Ces examens vous ont appris à réfléchir vite sur vos pieds.",
      appliquer: async () => { await creerAtout("Improvisational Fighter"); return "Atout Improvisational Fighter accordé."; } },
    11: { titre: "Pluridisciplinaire", description: "Un cours hors filière vous a marqué.",
      appliquer: async () => "MULTIDISCIPLINAIRE" },
    12: { titre: "Jackpot", description: "Un coup de maître.", appliquer: async () => "JACKPOT" }
  };

  const TABLE_SCIENCE = {
    1: { titre: "Rat de bibliothèque", description: "Un bon scientifique commence par la recherche documentaire.",
      appliquer: async () => { const creee = await garantirCompetence("Research", "smarts"); if (!creee) await appliquerEffetsSimples("Rat de bibliothèque", [effetCompetenceCran("Research", 2)], "au prochain examen"); return creee ? "Compétence Research acquise à d4." : "+2 crans de dé sur Research."; } },
    2: { titre: "Bricoleur", description: "Vous avez sûrement vu une vidéo sur comment réparer ça.",
      appliquer: async () => { const creee = await garantirCompetence("Repair", "smarts"); if (creee) return "Compétence Repair acquise à d4 (au lieu de l'Atout, faute de compétence)."; await creerAtout("Mr. Fix It"); return "Atout Mr. Fix It accordé."; } },
    3: { titre: "Ingénieur de l'improvisation", description: "Face à un problème, vous vous en sortez par la débrouille.",
      appliquer: async () => { const creee = await garantirCompetence("Repair", "smarts"); if (creee) return "Compétence Repair acquise à d4 (au lieu de l'Atout, faute de compétence)."; await creerAtout("McGyver"); return "Atout McGyver accordé."; } },
    4: { titre: "L33t $kilz", description: "Ce cours de code vous a marqué.",
      appliquer: async () => { const creee = await garantirCompetence("Hacking", "smarts"); if (!creee) await appliquerEffetsSimples("L33t $kilz", [effetCompetenceCran("Hacking", 2)], "au prochain examen"); return creee ? "Compétence Hacking acquise à d4." : "+2 crans de dé sur Hacking."; } },
    5: { titre: "Combattant méthodique", description: "Parfois, mieux vaut être méthodique que rapide.",
      appliquer: async () => {
        const deja = actor.items.some(i => i.type === "edge" && /calculating/i.test(i.name));
        if (deja) { await actor.update({ "system.bennies.value": (actor.system.bennies.value ?? 0) + 1 }); return "Atout Calculating déjà possédé : un Jeton gagné à la place."; }
        await creerAtout("Calculating", "1 session de jeu");
        return "Atout Calculating accordé pour une session de jeu.";
      } },
    6: { titre: "Sang-froid", description: "La moitié du secret pour réussir un examen : ne pas paniquer.",
      appliquer: async () => { await creerAtout("Level Headed", "1 combat"); return "Atout Level Headed accordé pour un combat."; } },
    7: { titre: "Coup de chance", description: "Mieux vaut avoir de la chance que d'être bon.",
      appliquer: async () => {
        const aChance = actor.items.some(i => i.type === "edge" && /^luck$/i.test(i.name.trim()));
        const aGrandeChance = actor.items.some(i => i.type === "edge" && /great luck/i.test(i.name));
        if (aGrandeChance) return "Atout Great Luck déjà possédé : rien de plus (la chance a des limites).";
        if (aChance) { await creerAtout("Great Luck"); return "Atout Great Luck accordé."; }
        await creerAtout("Luck"); return "Atout Luck accordé.";
      } },
    8: { titre: "Obstinément déterminé", description: "Votre concentration et votre détermination ont payé.",
      appliquer: async () => { await creerAtout("Strong Willed", "1 session de jeu"); return "Atout Strong Willed accordé pour une session de jeu (cumulable si déjà possédé)."; } },
    9: { titre: "Réseau social", description: "Votre partenaire de labo est plutôt cool, finalement.",
      appliquer: async () => { await creerAtout("Connections"); return "Atout Connections accordé (avec un étudiant, à préciser)."; } },
    10: { titre: "Chevalier de la nuit blanche", description: "Vous maîtrisez l'art de fonctionner après une nuit blanche.",
      appliquer: async () => { await creerRappelActif("Nuit blanche maîtrisée", "Peut ignorer un niveau de Fatigue.", "prochain examen"); return "Peut ignorer un niveau de Fatigue jusqu'au prochain examen."; } },
    11: { titre: "Pluridisciplinaire", description: "Un cours hors filière vous a marqué.",
      appliquer: async () => "MULTIDISCIPLINAIRE" },
    12: { titre: "Jackpot", description: "Un coup de maître.", appliquer: async () => "JACKPOT" }
  };

  const TABLE_OTHER = {
    1: { titre: "Confiance charismatique", description: "Ce succès vous donne un sacré coup de confiance.",
      appliquer: async () => { await creerAtout("Charismatic", "1 session de jeu"); return "Atout Charismatic accordé pour une session de jeu (relance gratuite si déjà possédé)."; } },
    2: { titre: "Célèbre", description: "Même le professeur vante vos mérites !",
      appliquer: async () => { await creerAtout("Fame", "1 session de jeu"); return "Atout Fame accordé pour une session de jeu (cumulable si déjà possédé)."; } },
    3: { titre: "Bon camarade d'étude", description: "Vous êtes un excellent partenaire de révisions.",
      appliquer: async () => { await creerAtout("Reliable", "1 session de jeu"); return "Atout Reliable accordé pour une session de jeu (cumulable si déjà possédé)."; } },
    4: { titre: "Chouchou du personnel", description: "Vous avez charmé quelqu'un de l'administration.",
      appliquer: async () => { await creerAtout("Connections", "jusqu'à la prochaine Progression"); return "Atout Connections accordé (avec un membre du personnel non-enseignant) jusqu'à la prochaine Progression."; } },
    5: { titre: "Jour de paye", description: "\"Tiens, un peu d'argent en plus pour tes efforts.\"",
      appliquer: async () => {
        const cat = await detecterCategorieRichesse();
        if (richesseActive()) { return `Bonus ponctuel équivalent à 50% de l'allocation (${cat.label}) — à convertir manuellement en Richesse (pas de conversion $→dé automatisée).`; }
        const bonus = Math.round(cat.argent * 0.5);
        const actuel = foundry.utils.getProperty(actor, FUNDS_PATH) ?? 0;
        await actor.update({ [FUNDS_PATH]: actuel + bonus });
        return `+${bonus}$ (50% de l'allocation ${cat.label}).`;
      } },
    6: { titre: "Esprit gardien", description: "Trop de temps passé à la bibliothèque a réveillé un esprit agité.",
      appliquer: async () => { await creerAtout("Spirit Guardian"); return "Atout Spirit Guardian accordé (cumulable : un ami supplémentaire à chaque nouvelle obtention)."; } },
    7: { titre: "Amélioration personnelle", description: "Un Handicap pèse moins lourd ce semestre.",
      appliquer: async () => { await creerRappelActif("Amélioration personnelle", "Ignore les limitations d'un Handicap au choix, jusqu'au prochain examen.", "prochain examen"); return "Ignore les limitations d'un Handicap jusqu'au prochain examen (à choisir avec le MJ)."; } },
    8: { titre: "Trésor caché", description: "Ce bout de papier coincé dans un livre n'était pas anodin.",
      appliquer: async () => { await actor.createEmbeddedDocuments("Item", [{ name: "Talisman à usage unique", type: "gear", system: { description: "Talisman à usage unique (voir p.64 du livre de règles)." } }]); return "Talisman à usage unique ajouté à l'inventaire."; } },
    9: { titre: "Sorcière des fourneaux", description: "Une révélation tardive en pleine session de révisions.",
      appliquer: async () => { await creerRappelActif("Sorcière des fourneaux", "Peut substituer un composant Commun à un composant Exotique lors d'un rituel (dirigé ou en soutien).", "prochain examen"); return "Peut substituer un composant Commun à un Exotique en rituel, jusqu'au prochain examen."; } },
    10: { titre: "GROS service", description: "Quelqu'un vous doit une fière chandelle.",
      appliquer: async () => { await creerAtout("Followers"); return "Usage unique de l'Atout Followers accordé."; } },
    11: { titre: "Pluridisciplinaire", description: "Un cours hors filière vous a marqué.",
      appliquer: async () => "MULTIDISCIPLINAIRE" },
    12: { titre: "Jackpot", description: "Un coup de maître.", appliquer: async () => "JACKPOT" }
  };

  const TABLES = { academics: TABLE_ACADEMICS, science: TABLE_SCIENCE, other: TABLE_OTHER };
  const NOM_TABLE_FR = { academics: "Littéraire", science: "Scientifique", other: "Autre" };
  const ALTERNATIVES_MULTIDISCIPLINAIRE = {
    academics: ["science", "other"],
    science: ["academics", "other"],
    other: ["academics", "science"]
  };

  // ===========================================================================
  // 9. EXÉCUTION : traite chaque Filière (1, ou 2 en Double Filière)
  // ===========================================================================
  await retirerEffetsExamenPrecedent();

  const resumesParMajeure = [];
  for (const majeure of majeuresATraiter) {
    const resume = await traiterUneMajeure(majeure);
    if (resume) resumesParMajeure.push(resume.join(""));
  }

  // ===========================================================================
  // 10. MESSAGE DE CHAT RÉCAPITULATIF
  // ===========================================================================
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="${S.dialog}">
        <h3 style="${S.chatH3}">🎓 Examen de Semestre — ${actor.name}</h3>
        <div style="${S.chatDetail}"><strong>Statut :</strong> ${statut === "double" ? "Double Filière" : statut === "general" ? "Études Générales" : "Filière unique"} &nbsp;|&nbsp; <strong>Rang :</strong> ${rang.label}</div>
        <div style="${S.chatDetail}"><strong>Bonus d'études</strong> (au moment du jet) : ${bonusEtudesInitial >= 0 ? "+" : ""}${bonusEtudesInitial}</div>
        ${resumesParMajeure.join("<hr style='border:none;border-top:2px solid #a02020;margin:14px 0;'>")}
      </div>
    `
  });

  notify("info", `Examen(s) de ${actor.name} résolu(s).`);

 } catch (err) {
   console.error("[ETU — Examens]", err);
   ui.notifications.error(`ETU Examens — Erreur : ${err.message}`, { permanent: true, console: false });
 }
})();