/**
 * ============================================================================
 *  ETU — Gestion des Activités Extra-scolaires
 *  Compatible Foundry VTT v13 et v14 — Système SWADE
 * ----------------------------------------------------------------------------
 *  - Sélectionner un token sur le canvas avant de lancer la macro.
 *  - La macro liste les activités éligibles, propose des sous-choix quand
 *    nécessaire, retire les effets de l'activité précédente, applique les
 *    nouveaux Active Effects (bonus/malus chiffrables) et poste un message
 *    de chat récapitulant les effets non automatisables (Relations, Benny,
 *    Conviction, argent de poche, restrictions contextuelles...).
 *
 *  TOUS les Active Effects (compétences, attributs, caractéristiques étendues)
 *  sont créés directement sur l'ACTEUR :
 *    - Attribut            : key = "system.attributes.<attr>.die.modifier"
 *    - Compétence          : key = "@Skill{Nom Anglais}[system.die.modifier]"
 *                            -> syntaxe spéciale SWADE permettant à un effet
 *                               posé sur l'acteur de cibler une compétence
 *                               embarquée par son nom.
 *    - Caractéristique étendue ("Additional Stat" SWADE, ex. Bonus d'études)
 *                          : key = "system.additionalStats.<cle>.value"
 *                            -> simple compteur numérique, sans structure de
 *                               dé ; <cle> doit correspondre exactement à la
 *                               clé configurée dans les Tweaks du monde.
 *
 *  IMPORTANT — à vérifier/adapter à ton monde :
 *  - Les noms de compétences dans @Skill{...} doivent correspondre EXACTEMENT
 *    (casse comprise) au nom anglais de l'Item-compétence sur la fiche
 *    (les compétences SWADE restent nommées en anglais même dans un monde
 *    en français ; seuls les attributs sont traduits).
 *  - Le chemin de l'argent (`system.details.currentFunds`) est celui du
 *    système SWADE standard ; adapte-le si tu utilises un module qui le
 *    modifie.
 * ============================================================================
 */

(async () => {
 try {

  // -------------------------------------------------------------------------
  // 0. CONFIGURATION — à adapter si besoin
  // -------------------------------------------------------------------------
  // Foundry exige que le scope d'un flag soit un package RÉELLEMENT actif
  // (le système, un module actif, ou "core") — une chaîne arbitraire comme
  // "etu-extracurricular" est rejetée par getFlag/setFlag. On utilise donc
  // l'id du système (ex. "swade") et on préfixe nos clés pour éviter toute
  // collision avec de vrais flags du système.
  const FLAG_SCOPE = game.system.id;
  const FUNDS_PATH = "system.details.currentFunds";
  const AE_ADD = CONST.ACTIVE_EFFECT_MODES.ADD;

  // Additional Stat de type texte, affichée sur la fiche, indiquant l'activité en cours
  const STAT_TEXTE_ACTIVITE = "etu-extracurricular";

  // Système de Richesse (dé) — règles personnelles d'Arnok pour les activités à impact
  // financier. Détection automatique via le réglage système SWADE : quand
  // game.settings.get('swade', 'wealthType') vaut "wealthDie", le mode Richesse (dé)
  // est actif. Repli sur RICHESSE_ACTIVE_SECOURS si la clé n'existe pas/plus
  // (version future du système, erreur, etc.).
  const RICHESSE_ACTIVE_SECOURS = true;
  function richesseActive() {
    try {
      return game.settings.get("swade", "wealthType") === "wealthDie";
    } catch (e) {
      return RICHESSE_ACTIVE_SECOURS;
    }
  }

  // Noms de compétences EN ANGLAIS, casse exacte (doivent matcher les Items sur la fiche)
  const COMP = {
    athletisme: "Athletics",
    persuasion: "Persuasion",
    performance: "Performance",
    recherche: "Research",
    connaissanceGenerale: "Common Knowledge",
    occultisme: "Occult"
  };

  // Libellés FR pour l'affichage dans le chat uniquement (jamais utilisés dans les clés d'effet)
  const LABEL_COMP_FR = {
    "Athletics": "Athlétisme",
    "Persuasion": "Persuasion",
    "Performance": "Performance",
    "Research": "Recherche",
    "Common Knowledge": "Connaissance générale",
    "Occult": "Occultisme"
  };

  // Clés internes d'attribut (anglais, imposées par le système) + libellé FR pour l'affichage
  const ATTR = { force: "strength", vigueur: "vigor" };
  const LABEL_ATTR_FR = { agility: "Agilité", strength: "Force", vigor: "Vigueur", smarts: "Intellect", spirit: "Âme" };

  // Caractéristiques étendues (Additional Stats SWADE) — clé = celle configurée dans les Tweaks du monde
  const STAT_ETENDUE = { erudition: "scholarship" };
  const LABEL_STAT_FR = { scholarship: "Bonus d'études" };

  // -------------------------------------------------------------------------
  // 1. UTILITAIRES FOUNDRY V13 / V14
  // -------------------------------------------------------------------------
  const hasDialogV2 = !!(foundry?.applications?.api?.DialogV2);

  /**
   * Affiche une boîte de dialogue à partir d'un contenu HTML SANS balise <form>
   * (DialogV2 fournit déjà un formulaire englobant ; en ajouter un second créerait
   * un <form> imbriqué invalide et empêcherait la lecture correcte des données).
   */
  async function formDialog({ title, content, okLabel = "Valider" }) {
    if (hasDialogV2) {
      let result = null;
      await foundry.applications.api.DialogV2.wait({
        window: { title },
        content,
        buttons: [
          {
            action: "ok",
            label: okLabel,
            default: true,
            callback: (event, button) => {
              result = button?.form ? Object.fromEntries(new FormData(button.form)) : {};
            }
          },
          { action: "cancel", label: "Annuler" }
        ],
        rejectClose: false
      });
      return result;
    } else {
      return new Promise((resolve) => {
        new Dialog({
          title,
          content: `<form>${content}</form>`,
          buttons: {
            ok: {
              label: okLabel,
              callback: (html) => {
                const form = html[0].querySelector("form");
                resolve(Object.fromEntries(new FormData(form)));
              }
            },
            cancel: { label: "Annuler", callback: () => resolve(null) }
          },
          default: "ok"
        }).render(true);
      });
    }
  }

  function notify(type, msg) {
    ui.notifications[type]?.(msg) ?? ui.notifications.info(msg);
  }

  // -------------------------------------------------------------------------
  // 1bis. THÈME VISUEL — EN STYLES EN LIGNE (la balise <style> injectée dans
  //    le contenu d'un Dialog est filtrée par Foundry ; seuls les styles
  //    inline sur chaque élément passent). Mêmes signatures qu'avant pour
  //    ne pas avoir à retoucher chaque configuration d'activité.
  // -------------------------------------------------------------------------
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
    cardReason: "font-size:11px;font-style:italic;font-weight:bold;color:#ff5555;margin:4px 0 0 22px;",
    chatH3: "margin:0 0 6px;color:#f2ede0;font-size:16px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;border-bottom:2px solid #a02020;padding-bottom:7px;",
    chatDetail: "font-size:12px;color:#d3c3e0;margin:6px 0;",
    flavor: "font-size:11px;font-style:italic;color:#9fb0d0;margin:4px 0 8px;",
    bonus: "color:#7fbf6a;",
    malus: "color:#e0685c;",
    funds: "font-size:12px;color:#f2ede0;margin:6px 0;",
    notes: "border-top:1px dashed rgba(242,237,224,0.3);margin-top:10px;padding-top:8px;font-size:11px;color:#c7cfe0;",
    notesTitle: "color:#e0685c;text-transform:uppercase;letter-spacing:1px;font-size:10px;font-weight:bold;"
  };

  function etuWrap(inner) {
    return `<div style="${S.dialog}">${inner}</div>`;
  }

  function etuHeader(title, subtitle) {
    return `<div style="text-align:center;margin-bottom:16px;">
      <div style="${S.crest}">ETU</div>
      <h1 style="${S.h1}">${title}</h1>
      <div style="${S.sub}">${subtitle}</div>
    </div>`;
  }

  // Injecte automatiquement le style sur le <select>/<input> contenu, pour ne
  // pas avoir à retoucher chaque appel existant dans les ~15 activités.
  function etuField(label, inputHtml) {
    const inputStylise = inputHtml
      .replace(/<select(?![^>]*style=)/g, `<select style="${S.select}"`)
      .replace(/<input(?![^>]*style=)/g, `<input style="${S.select}"`);
    return `<div style="margin-bottom:12px;"><label style="${S.fieldLabel}">${label}</label>${inputStylise}</div>`;
  }

  // -------------------------------------------------------------------------
  // 2. RÉCUPÉRATION DE L'ACTEUR
  // -------------------------------------------------------------------------
  const controlled = canvas.tokens.controlled;
  let actor;
  if (controlled.length === 1) {
    actor = controlled[0].actor;
  } else if (controlled.length === 0) {
    actor = game.user.character;
  }
  if (!actor) {
    notify("warn", "Sélectionne un unique token (ou assigne-toi un personnage) avant de lancer la macro.");
    return;
  }
  if (controlled.length > 1) {
    notify("warn", "Plusieurs tokens sélectionnés : sélectionne-en un seul.");
    return;
  }

  // -------------------------------------------------------------------------
  // 3. LECTURE DES DONNÉES DE L'ACTEUR (lecture seule)
  // -------------------------------------------------------------------------
  function dieAttribut(key) {
    return actor.system?.attributes?.[key]?.die?.sides ?? 4;
  }

  // Atout "Polyvalent" (Adaptable) : permet de choisir DEUX activités
  // extra-scolaires différentes pour le semestre au lieu d'une seule.
  function estPolyvalent() {
    return actor.items.some(i => (i.system?.swid ?? "").toLowerCase() === "polyvalent");
  }

  // -------------------------------------------------------------------------
  // 4. CONSTRUCTEURS D'EFFETS (tous posés sur l'ACTEUR)
  // -------------------------------------------------------------------------
  function effetAttribut(attrKey, valeur) {
    return { key: `system.attributes.${attrKey}.die.modifier`, mode: AE_ADD, value: valeur, type: "attribut", nomInterne: attrKey };
  }
  function effetCompetence(nomAnglais, valeur) {
    return { key: `@Skill{${nomAnglais}}[system.die.modifier]`, mode: AE_ADD, value: valeur, type: "competence", nomInterne: nomAnglais };
  }
  // Caractéristique étendue ("Additional Stat" SWADE) : simple compteur numérique, pas de dé.
  function effetStatEtendue(cle, valeur) {
    return { key: `system.additionalStats.${cle}.value`, mode: AE_ADD, value: valeur, type: "statEtendue", nomInterne: cle };
  }

  // Richesse (dé) — champ direct sur l'acteur : system.details.wealth.die (nombre de
  // faces, ex. 6 pour d6) et system.details.wealth.modifier (bonus/malus plat).
  function effetRichesseModifier(valeur) {
    return { key: "system.details.wealth.modifier", mode: AE_ADD, value: valeur, type: "richesse", nomInterne: "wealth" };
  }
  function effetRichesseCranMontee() {
    return { key: "system.details.wealth.die", mode: AE_ADD, value: 2, type: "richesse", nomInterne: "wealth" };
  }
  // "Diminuer d'un cran" : chaque palier vaut 2 (d4=4, d6=6, d8=8...). Si l'acteur est
  // déjà au plancher (d4), on ne peut pas descendre en dessous : on bascule alors sur un
  // malus de -2 au modificateur (convention "d4-2") plutôt que de retirer 2 aux faces.
  function effetRichesseCranDescente() {
    const deActuel = actor.system?.details?.wealth?.die ?? 6;
    if (deActuel <= 4) return effetRichesseModifier(-2);
    return { key: "system.details.wealth.die", mode: AE_ADD, value: -2, type: "richesse", nomInterne: "wealth" };
  }

  // -------------------------------------------------------------------------
  // 5. TABLE DES ACTIVITÉS
  // -------------------------------------------------------------------------
  const ACTIVITES = [

    {
      id: "athlete",
      label: "Athlète",
      description: "Sport universitaire (foot, basket, natation...). Requiert Agilité, Force ou Vigueur à d8+.",
      requirement: () => dieAttribut("agility") >= 8 || dieAttribut("strength") >= 8 || dieAttribut("vigor") >= 8,
      raisonInelig: "Requiert Agilité, Force ou Vigueur à d8+.",
      configure: async () => formDialog({
        title: "Athlète — configuration",
        okLabel: "Confirmer",
        content: etuWrap(`
          ${etuHeader("Athlète", "Département de la vie sportive")}
            ${etuField("Trait bonifié", `
              <select name="trait">
                <option style="background:#1d2c4d;color:#f2ede0;" value="athletisme">Athlétisme</option>
                <option style="background:#1d2c4d;color:#f2ede0;" value="force">Force (et dégâts)</option>
                <option style="background:#1d2c4d;color:#f2ede0;" value="vigueur">Vigueur</option>
              </select>`)}
            ${etuField("Entraînement", `
              <select name="niveau">
                <option style="background:#1d2c4d;color:#f2ede0;" value="normal">Normal (+1 / Bonus d'études -2)</option>
                <option style="background:#1d2c4d;color:#f2ede0;" value="intensif">Intensif (+2 / Bonus d'études -4)</option>
              </select>`)}
        `)
      }),
      build: (a, cfg) => {
        if (!cfg) return null;
        const bonus = cfg.niveau === "intensif" ? 2 : 1;
        const malusErudition = cfg.niveau === "intensif" ? 4 : 2;
        const effets = [];
        if (cfg.trait === "athletisme") effets.push(effetCompetence(COMP.athletisme, bonus));
        if (cfg.trait === "force") effets.push(effetAttribut(ATTR.force, bonus));
        if (cfg.trait === "vigueur") effets.push(effetAttribut(ATTR.vigueur, bonus));
        effets.push(effetStatEtendue(STAT_ETENDUE.erudition, -malusErudition));
        return { effets, notesManuelles: [], argent: 0 };
      }
    },

    {
      id: "auditing",
      label: "Cours en auditeur libre",
      description: "+2 Bonus d'études, -1 Persuasion et Performance (envers les autres étudiants).",
      requirement: () => true,
      build: () => ({
        effets: [
          effetStatEtendue(STAT_ETENDUE.erudition, 2),
          effetCompetence(COMP.persuasion, -1),
          effetCompetence(COMP.performance, -1)
        ],
        notesManuelles: ["Le malus de Persuasion/Performance ne s'applique qu'envers d'autres étudiants."],
        argent: 0
      })
    },

    {
      id: "computerLibrary",
      label: "Assistant informatique / bibliothèque",
      description: "+2 Recherche (accès hors-horaires à la salle informatique ou à la bibliothèque, au choix).",
      requirement: () => true,
      configure: async () => formDialog({
        title: "Assistant informatique / bibliothèque",
        okLabel: "Confirmer",
        content: etuWrap(`
          ${etuHeader("Assistant Technique", "Services informatiques &amp; bibliothèque Sam Rayburn")}
            ${etuField("Lieu d'affectation", `
              <select name="lieu"><option style="background:#1d2c4d;color:#f2ede0;" value="informatique">Salle informatique</option><option style="background:#1d2c4d;color:#f2ede0;" value="bibliotheque">Bibliothèque</option></select>`)}
        `)
      }),
      build: (a, cfg) => ({
        effets: [effetCompetence(COMP.recherche, 2)],
        notesManuelles: [`Bonus de Recherche valable pour les informations trouvables via : ${cfg?.lieu === "bibliotheque" ? "la bibliothèque" : "la salle informatique"}.`],
        argent: 0
      })
    },

    {
      id: "fitness",
      label: "Forme physique",
      description: "+2 aux jets de résistance à la Fatigue (physique ou mentale). Non automatisable (pas de trait dédié).",
      requirement: () => true,
      build: () => ({
        effets: [],
        notesManuelles: ["RAPPEL MJ : +2 à tout jet de résistance à la Fatigue (Vigueur ou Âme selon la source) — à appliquer manuellement au moment du jet."],
        argent: 0
      })
    },

    {
      id: "fraternity",
      label: "Fraternité / Sororité",
      description: "Relations (Connections) + Persuasion +2 envers les frères/sœurs, Bonus d'études -1.",
      requirement: () => true,
      build: () => ({
        effets: [
          effetCompetence(COMP.persuasion, 2),
          effetStatEtendue(STAT_ETENDUE.erudition, -1)
        ],
        notesManuelles: [
          "Le bonus de Persuasion ne s'applique qu'envers les frères/sœurs de la fraternité/sororité.",
          "Avantage RELATIONS (Connections) à noter manuellement envers les membres de la fraternité/sororité."
        ],
        argent: 0
      })
    },

    {
      id: "gaming",
      label: "Sessions de Jeux",
      description: "+2 Connaissance générale (mythes, légendes, surnaturel), optionnellement Occultisme si le MJ l'autorise.",
      requirement: () => true,
      configure: async () => formDialog({
        title: "Gaming",
        okLabel: "Confirmer",
        content: etuWrap(`
          ${etuHeader("Club de Gaming", "Guilde ludique de Pinebox")}
            ${etuField("Le MJ autorise-t-il le bonus sur Occultisme ?", `
              <select name="occulte"><option style="background:#1d2c4d;color:#f2ede0;" value="non">Non</option><option style="background:#1d2c4d;color:#f2ede0;" value="oui">Oui</option></select>`)}
        `)
      }),
      build: (a, cfg) => {
        const effets = [effetCompetence(COMP.connaissanceGenerale, 2)];
        if (cfg?.occulte === "oui") effets.push(effetCompetence(COMP.occultisme, 2));
        return { effets, notesManuelles: [], argent: 0 };
      }
    },

    {
      id: "partTimeJob",
      label: "Job à temps partiel",
      description: "Argent en échange de temps de travail (impact variable sur le Bonus d'études).",
      requirement: () => true,
      configure: async () => formDialog({
        title: "Job à temps partiel",
        okLabel: "Confirmer",
        content: etuWrap(`
          ${etuHeader("Bureau de l'Emploi Étudiant", "Job à temps partiel")}
            ${etuField("Difficulté", `
              <select name="difficulte">
                <option style="background:#1d2c4d;color:#f2ede0;" value="facile">Facile — +50$, aucun malus</option>
                <option style="background:#1d2c4d;color:#f2ede0;" value="difficile">Difficile — +100$, Bonus d'études -1</option>
                <option style="background:#1d2c4d;color:#f2ede0;" value="tres_difficile">Très difficile — +250$, Bonus d'études -2</option>
              </select>`)}
        `)
      }),
      build: (a, cfg) => {
        const table = {
          facile: { argent: 50, malus: 0 },
          difficile: { argent: 100, malus: 1 },
          tres_difficile: { argent: 250, malus: 2 }
        };
        const t = table[cfg?.difficulte] ?? table.facile;
        const effets = t.malus > 0 ? [effetStatEtendue(STAT_ETENDUE.erudition, -t.malus)] : [];

        if (richesseActive()) {
          if (cfg?.difficulte === "facile") effets.push(effetRichesseModifier(1));
          else if (cfg?.difficulte === "difficile") effets.push(effetRichesseModifier(2));
          else if (cfg?.difficulte === "tres_difficile") effets.push(effetRichesseCranDescente());
          return {
            effets,
            notesManuelles: ["Système Richesse actif : la rémunération s'applique à la Richesse plutôt qu'en argent."],
            argent: 0
          };
        }
        return { effets, notesManuelles: [], argent: t.argent };
      }
    },

    {
      id: "partyHardy",
      label: "Fêtard Acharné",
      description: "Persuasion +2, Relations (usage unique), Bonus d'études -2.",
      requirement: () => true,
      build: () => ({
        effets: [
          effetCompetence(COMP.persuasion, 2),
          effetStatEtendue(STAT_ETENDUE.erudition, -2)
        ],
        notesManuelles: ["Avantage RELATIONS (Connections) : un usage unique ce semestre, envers le corps étudiant en général."],
        argent: 0
      })
    },

    {
      id: "performer",
      label: "Performance Artistique",
      description: "Performance +2, Persuasion +2 (auprès des jeunes du coin), Bonus d'études -2.",
      requirement: () => true,
      build: () => ({
        effets: [
          effetCompetence(COMP.performance, 2),
          effetCompetence(COMP.persuasion, 2),
          effetStatEtendue(STAT_ETENDUE.erudition, -2)
        ],
        notesManuelles: ["Les bonus de Performance/Persuasion ne s'appliquent qu'auprès des jeunes de la ville/du campus."],
        argent: 0
      })
    },

    {
      id: "romance",
      label: "Romance",
      description: "Bonus d'études -1, argent de poche -10%. Gagne un point de Conviction si l'être aimé est menacé (narratif).",
      requirement: () => true,
      build: () => ({
        effets: [
          effetStatEtendue(STAT_ETENDUE.erudition, -1),
          ...(richesseActive() ? [effetRichesseModifier(-1)] : [])
        ],
        notesManuelles: [
          ...(richesseActive()
            ? ["Système Richesse actif : le modificateur de Richesse -1 remplace la réduction de 10% de l'argent de poche."]
            : ["Réduction de 10% de l'argent de poche ce semestre (à appliquer manuellement)."]),
          "RAPPEL MJ : accorder un point de Conviction si l'intérêt romantique est en danger/menacé."
        ],
        argent: 0
      })
    },

    {
      id: "rotc",
      label: "Entraînement Militaire",
      description: "Relations avec les autres cadets (narratif). Aucun bonus chiffré.",
      requirement: () => true,
      build: () => ({
        effets: [],
        notesManuelles: ["Avantage RELATIONS (Connections) envers les autres cadets du ROTC, pour ce semestre."],
        argent: 0
      })
    },

    {
      id: "studentOrg",
      label: "Association étudiante",
      description: "+1 à une compétence au choix, Bonus d'études -1.",
      requirement: () => true,
      configure: async () => {
        const competences = actor.items.filter(i => i.type === "skill").map(i => i.name);
        if (!competences.length) { notify("warn", "Aucune compétence trouvée sur la fiche."); return null; }
        return formDialog({
          title: "Association étudiante",
          okLabel: "Confirmer",
          content: etuWrap(`
            ${etuHeader("Vie Associative", "Foyer Stanbury — Clubs &amp; associations")}
              ${etuField("Compétence bonifiée (nom exact, casse incluse)", `
                <select name="competence">${competences.map(c => `<option style="background:#1d2c4d;color:#f2ede0;" value="${c}">${c}</option>`).join("")}</select>`)}
          `)
        });
      },
      build: (a, cfg) => {
        if (!cfg?.competence) return null;
        if (cfg.competence === COMP.occultisme) {
          notify("warn", "Attention : ce club/association donne un bonus sur Occultisme — vérifie que c'est cohérent avec ton scénario !");
        }
        return {
          effets: [
            effetCompetence(cfg.competence, 1),
            effetStatEtendue(STAT_ETENDUE.erudition, -1)
          ],
          notesManuelles: [],
          argent: 0
        };
      }
    },

    {
      id: "teacherAide",
      label: "Assistant / Tuteur enseignant",
      description: "Requiert une Compétence majeure à d8+. Rémunération selon le type et le dé de la compétence majeure.",
      requirement: () => actor.items.some(i => i.type === "skill" && (i.system?.die?.sides ?? 4) >= 8),
      raisonInelig: "Requiert une Compétence majeure à d8+.",
      configure: async () => {
        const majeures = actor.items.filter(i => i.type === "skill" && (i.system?.die?.sides ?? 4) >= 8);
        return formDialog({
          title: "Assistant / Tuteur enseignant",
          okLabel: "Confirmer",
          content: etuWrap(`
            ${etuHeader("Corps Enseignant", "Assistanat &amp; tutorat")}
              ${etuField("Compétence majeure", `
                <select name="competence">${majeures.map(i => `<option style="background:#1d2c4d;color:#f2ede0;" value="${i.name}" data-sides="${i.system.die.sides}">${i.name} (d${i.system.die.sides})</option>`).join("")}</select>`)}
              ${etuField("Rôle", `
                <select name="role"><option style="background:#1d2c4d;color:#f2ede0;" value="tuteur">Tuteur (paie pleine)</option><option style="background:#1d2c4d;color:#f2ede0;" value="assistant">Assistant (demi-paie + Relations + accès)</option></select>`)}
          `)
        });
      },
      build: (a, cfg) => {
        if (!cfg?.competence) return null;
        const it = actor.items.find(i => i.name === cfg.competence && i.type === "skill");
        const sides = it?.system?.die?.sides ?? 8;
        const notes = ["Pas de malus de Bonus d'études (le travail s'intègre aux études)."];
        if (cfg.role === "assistant") notes.push("Avantage RELATIONS (Connections) avec le professeur + accès tardif au bâtiment/bureau/salle concerné.");

        if (richesseActive()) {
          const effets = [];
          if (cfg.role === "tuteur") {
            if (sides === 8) effets.push(effetRichesseCranMontee());
            else if (sides === 10) { effets.push(effetRichesseCranMontee()); effets.push(effetRichesseModifier(1)); }
            else if (sides === 12) { effets.push(effetRichesseCranMontee()); effets.push(effetRichesseModifier(2)); }
          } else {
            if (sides === 8) effets.push(effetRichesseModifier(1));
            else if (sides === 10) effets.push(effetRichesseModifier(2));
            else if (sides === 12) effets.push(effetRichesseCranMontee());
          }
          notes.push("Système Richesse actif : la rémunération s'applique à la Richesse plutôt qu'en argent.");
          return { effets, notesManuelles: notes, argent: 0 };
        }

        const pleinePaie = 25 * sides;
        const argent = cfg.role === "assistant" ? Math.round(pleinePaie / 2) : pleinePaie;
        return { effets: [], notesManuelles: notes, argent };
      }
    },

    {
      id: "tutoring",
      label: "Tutorat (payant)",
      description: "L'étudiant engage un tuteur : +1 Bonus d'études (100$) ou +2 Bonus d'études (250$).",
      requirement: () => true,
      configure: async () => formDialog({
        title: "Tutorat (payant)",
        okLabel: "Confirmer",
        content: etuWrap(`
          ${etuHeader("Centre d'Aide aux Études", "Tutorat privé")}
            ${etuField("Investissement", `
              <select name="montant"><option style="background:#1d2c4d;color:#f2ede0;" value="100">100$ — +1 Bonus d'études</option><option style="background:#1d2c4d;color:#f2ede0;" value="250">250$ — +2 Bonus d'études</option></select>`)}
        `)
      }),
      build: (a, cfg) => {
        const montant = Number(cfg?.montant ?? 100);
        const bonus = montant >= 250 ? 2 : 1;

        if (richesseActive()) {
          const effetRichesse = montant >= 250 ? effetRichesseCranDescente() : effetRichesseModifier(-2);
          return {
            effets: [effetStatEtendue(STAT_ETENDUE.erudition, bonus), effetRichesse],
            notesManuelles: ["Système Richesse actif : le coût du tutorat s'applique à la Richesse plutôt qu'en argent."],
            argent: 0
          };
        }
        return { effets: [effetStatEtendue(STAT_ETENDUE.erudition, bonus)], notesManuelles: [], argent: -montant };
      }
    },

    {
      id: "volunteer",
      label: "Bénévolat",
      description: "Persuasion +2 (envers le groupe concerné), Relations (usage unique), +1 Benny au prochaines sessions.",
      requirement: () => true,
      build: () => ({
        effets: [effetCompetence(COMP.persuasion, 2)],
        notesManuelles: [
          "Le bonus de Persuasion ne s'applique qu'envers le groupe/cause concerné et les autres bénévoles.",
          "Avantage RELATIONS (Connections) : usage unique, en lien avec la cause servie.",
          "RAPPEL MJ : +1 Benny au début de chaque session tant que cette activité est active (à accorder manuellement, non automatisable de façon fiable)."
        ],
        argent: 0
      })
    }
  ];

  // -------------------------------------------------------------------------
  // 6. RETRAIT DE L'ACTIVITÉ PRÉCÉDENTE (tout est sur l'acteur désormais)
  // -------------------------------------------------------------------------
  async function retirerActiviteActuelle() {
    const aeActeur = actor.effects.filter(e => e.getFlag(FLAG_SCOPE, "etuManaged"));
    if (aeActeur.length) await actor.deleteEmbeddedDocuments("ActiveEffect", aeActeur.map(e => e.id));
  }

  // -------------------------------------------------------------------------
  // 7. APPLICATION DE LA NOUVELLE ACTIVITÉ
  // -------------------------------------------------------------------------
  async function appliquerEffets(libelleActivites, effets, descriptionsActivites = []) {
    if (!effets.length) return;
    const changes = effets.map(eff => ({ key: eff.key, mode: eff.mode, value: String(eff.value), priority: 20 }));
    const resumeTechnique = effets.map(eff => {
      const signe = eff.value > 0 ? "+" : "";
      return `${nomAffichage(eff)} : ${signe}${eff.value}`;
    }).join(" · ");
    const description = [
      descriptionsActivites.join("<br>"),
      `<br><br>Effet mécanique : ${resumeTechnique}.`
    ].filter(Boolean).join("");
    const aeData = {
      name: `ETU — ${libelleActivites}`,
      img: "icons/svg/upgrade.svg",
      origin: actor.uuid,
      disabled: false,
      transfer: false,
      changes,
      description,
      flags: { [FLAG_SCOPE]: { etuManaged: true } }
    };
    await actor.createEmbeddedDocuments("ActiveEffect", [aeData]);
  }

  async function appliquerArgent(montant) {
    if (!montant) return;
    const actuel = foundry.utils.getProperty(actor, FUNDS_PATH) ?? 0;
    try {
      await actor.update({ [FUNDS_PATH]: actuel + montant });
    } catch (e) {
      notify("warn", `Impossible de mettre à jour l'argent automatiquement (${FUNDS_PATH}). Ajoute manuellement ${montant}$.`);
    }
  }

  async function appliquerStatTexteActivite(libelle) {
    const cheminValeur = `system.additionalStats.${STAT_TEXTE_ACTIVITE}.value`;
    try {
      await actor.update({ [cheminValeur]: libelle });
    } catch (e) {
      notify("warn", `Impossible de mettre à jour l'Additional Stat "${STAT_TEXTE_ACTIVITE}" (${cheminValeur}). Vérifie qu'elle est bien activée sur la fiche.`);
    }
  }

  // -------------------------------------------------------------------------
  // 8. DIALOGUE PRINCIPAL — CHOIX DE L'ACTIVITÉ (1 ou 2 si Polyvalent)
  // -------------------------------------------------------------------------
  const polyvalent = estPolyvalent();
  const nbChoix = polyvalent ? 2 : 1;
  if (polyvalent) {
    notify("info", `${actor.name} possède l'Atout Polyvalent : choix de 2 activités extra-scolaires ce semestre.`);
  }

  const activitesChoisies = [];
  const resultatsChoisis = [];

  for (let tour = 1; tour <= nbChoix; tour++) {
    const idsDejaChoisis = activitesChoisies.map(a => a.id);
    const candidats = ACTIVITES.filter(act => !idsDejaChoisis.includes(act.id));
    const premierEligible = candidats.find(act => act.requirement(actor))?.id;

    const cartesHtml = candidats.map(act => {
      const eligible = act.requirement(actor);
      const checked = eligible && act.id === premierEligible ? "checked" : "";
      const raisonHtml = !eligible
        ? `<div style="${S.cardReason}">Non éligible — ${act.raisonInelig ?? "prérequis non rempli."}</div>`
        : "";
      const styleCarte = eligible ? S.card : `${S.card}cursor:not-allowed;background:rgba(0,0,0,0.2);`;
      const styleTitre = eligible ? S.cardTitle : `${S.cardTitle}opacity:.45;`;
      const styleDesc = eligible ? S.cardDesc : `${S.cardDesc}opacity:.35;`;
      return `
        <label style="${styleCarte}">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="radio" name="activite" value="${act.id}" ${eligible ? "" : "disabled"} ${checked} style="margin:0;flex-shrink:0;">
            <span style="${styleTitre}">${act.label}</span>
          </div>
          <div style="${styleDesc}">${act.description}</div>
          ${raisonHtml}
        </label>`;
    }).join("");

    const sousTitre = polyvalent
      ? `${actor.name} — Choix ${tour}/${nbChoix} du semestre (Polyvalent)`
      : `${actor.name} — Choix du semestre`;

    const choix = await formDialog({
      title: "Activité extra-scolaire — ETU",
      okLabel: "Inscrire",
      content: etuWrap(`
        ${etuHeader("Bureau des Activités Étudiantes", sousTitre)}
          <div style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;padding-right:4px;">${cartesHtml}</div>
      `)
    });

    if (!choix || !choix.activite) {
      if (activitesChoisies.length === 0) return; // rien choisi du tout, on arrête
      break; // au moins une activité déjà choisie, on s'arrête là
    }

    const activite = candidats.find(a => a.id === choix.activite);
    if (!activite) break;

    if (!activite.requirement(actor)) {
      notify("error", `${actor.name} ne remplit pas les prérequis pour "${activite.label}" (${activite.raisonInelig ?? "prérequis non rempli"}).`);
      break;
    }

    let config = null;
    if (activite.configure) {
      config = await activite.configure(actor);
      if (config === null) break; // annulé, on garde ce qui a déjà été choisi
    }

    const resultat = activite.build(actor, config);
    if (!resultat) {
      notify("warn", "Configuration incomplète, activité ignorée.");
      break;
    }

    activitesChoisies.push(activite);
    resultatsChoisis.push(resultat);
  }

  if (!activitesChoisies.length) return;

  // -------------------------------------------------------------------------
  // 9. EXÉCUTION (combine les effets/argent/notes de toutes les activités choisies)
  // -------------------------------------------------------------------------
  const tousLesEffets = resultatsChoisis.flatMap(r => r.effets);
  const toutesLesNotes = resultatsChoisis.flatMap(r => r.notesManuelles);
  const argentTotal = resultatsChoisis.reduce((somme, r) => somme + (r.argent || 0), 0);
  const libelleCombine = activitesChoisies.map(a => a.label).join(" + ");

  await retirerActiviteActuelle();
  await appliquerEffets(libelleCombine, tousLesEffets, activitesChoisies.map(a => `<strong>${a.label}</strong> : ${a.description}`));
  await appliquerArgent(argentTotal);
  await appliquerStatTexteActivite(libelleCombine);

  await actor.setFlag(FLAG_SCOPE, "etuCurrent", {
    activites: activitesChoisies.map(a => ({ id: a.id, label: a.label })),
    appliedAt: Date.now()
  });

  // -------------------------------------------------------------------------
  // 10. MESSAGE DE CHAT RÉCAPITULATIF
  // -------------------------------------------------------------------------
  function nomAffichage(eff) {
    if (eff.type === "competence") return LABEL_COMP_FR[eff.nomInterne] ?? eff.nomInterne;
    if (eff.type === "statEtendue") return LABEL_STAT_FR[eff.nomInterne] ?? eff.nomInterne;
    if (eff.type === "richesse") return eff.key.endsWith(".die") ? "Richesse (cran de dé)" : "Richesse (modificateur)";
    return LABEL_ATTR_FR[eff.nomInterne] ?? eff.nomInterne;
  }

  const sectionsActivites = activitesChoisies.map((activite, i) => {
    const resultat = resultatsChoisis[i];
    const listeEffets = resultat.effets.map(e => {
      const signe = e.value > 0 ? "+" : "";
      const styleLigne = e.value > 0 ? S.bonus : S.malus;
      return `<li style="${styleLigne}">${nomAffichage(e)} : ${signe}${e.value}</li>`;
    }).join("");
    return `
      <h3 style="${S.chatH3}">🐦‍⬛ ${activite.label}</h3>
      <div style="${S.flavor}">${activite.description}</div>
      ${listeEffets ? `<ul style="margin:4px 0 8px;padding-left:18px;">${listeEffets}</ul>` : ""}
    `;
  }).join("");

  const notes = toutesLesNotes.length
    ? `<div style="${S.notes}"><div style="${S.notesTitle}">Note de service — à gérer manuellement</div><ul style="margin:4px 0 0;padding-left:18px;">${toutesLesNotes.map(n => `<li>${n}</li>`).join("")}</ul></div>`
    : "";

  const argentTxt = argentTotal
    ? `<div style="${S.funds}">💵 Trésorerie : ${argentTotal > 0 ? "+" : ""}${argentTotal}$</div>`
    : "";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="${S.dialog}">
        ${sectionsActivites}
        ${argentTxt}
        ${notes}
      </div>
    `
  });

  notify("info", `Activité(s) "${libelleCombine}" appliquée(s) à ${actor.name}.`);

 } catch (err) {
   console.error("[ETU — Activités Extra-scolaires]", err);
   ui.notifications.error(`ETU Activités — Erreur : ${err.message}`, { permanent: true, console: false });
 }
})();