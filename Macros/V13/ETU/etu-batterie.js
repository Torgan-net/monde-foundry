/**
 * ============================================================================
 *  ETU — Batterie d'Appareil Électronique (par objet d'inventaire)
 *  Compatible Foundry VTT v13 et v14 — Système SWADE
 * ----------------------------------------------------------------------------
 *  Cible les OBJETS de l'inventaire du personnage qui ont une Additional
 *  Stat "battery" configurée (téléphone, laptop, etc.), et gère leur niveau
 *  (Bon / Faible / Vide). Pas de suivi automatique de la durée de charge :
 *  juste consulter, décrémenter d'un cran, ou fixer directement le niveau —
 *  la recharge (3h pour Faible→Bon, 10 min pour Vide→Faible) reste gérée
 *  manuellement par le MJ.
 *
 *  PRÉREQUIS : chaque objet concerné doit avoir l'Additional Stat "battery"
 *  activée sur sa fiche d'Item (system.additionalStats.battery.value).
 * ============================================================================
 */

(async () => {
 try {

  // -------------------------------------------------------------------------
  // 0. CONFIGURATION
  // -------------------------------------------------------------------------
  const STAT_BATTERIE = "battery";
  const NIVEAUX = ["Vide", "Faible", "Bon"]; // ordre croissant

  // -------------------------------------------------------------------------
  // 1. THÈME VISUEL — EN STYLES EN LIGNE (la balise <style> injectée dans le
  //    contenu d'un Dialog est filtrée par Foundry ; seuls les styles inline
  //    sur chaque élément passent — voir la macro Examens).
  // -------------------------------------------------------------------------
  const S = {
    dialog: "font-family:Georgia,'Times New Roman',serif;color:#f2ede0;background:linear-gradient(160deg,#182948,#24365f 55%,#182948);border:1px solid #a02020;border-radius:6px;padding:16px 18px;",
    crest: "display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;border:2px solid #a02020;color:#f2ede0;background:rgba(160,32,32,0.15);font-size:10px;font-weight:bold;margin:0 auto 6px;",
    h1: "font-size:17px;letter-spacing:3px;text-transform:uppercase;color:#f2ede0;margin:2px 0;font-weight:bold;",
    sub: "font-size:11px;letter-spacing:1.5px;color:#c7cfe0;text-transform:uppercase;",
    fieldLabel: "display:block;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#e0685c;margin-bottom:4px;font-weight:bold;",
    select: "width:100%;background:rgba(255,255,255,0.1);color:#f2ede0;border:1px solid rgba(242,237,224,0.25);border-radius:4px;padding:7px 9px;font-family:inherit;font-size:13px;color-scheme:dark;",
    hint: "font-size:11px;color:#9fb0d0;margin:0 0 12px;line-height:1.4;",
    chatH3: "margin:0 0 6px;color:#f2ede0;font-size:16px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;border-bottom:2px solid #a02020;padding-bottom:7px;",
    chatDetail: "font-size:12px;color:#d3c3e0;margin:6px 0;"
  };
  function etuWrap(inner) { return `<div style="${S.dialog}">${inner}</div>`; }
  function etuHeader(title, subtitle) {
    return `<div style="text-align:center;margin-bottom:16px;">
      <div style="${S.crest}">ETU</div>
      <h1 style="${S.h1}">${title}</h1>
      <div style="${S.sub}">${subtitle}</div>
    </div>`;
  }
  function etuField(label, inputHtml) {
    return `<div style="margin-bottom:12px;"><label style="${S.fieldLabel}">${label}</label>${inputHtml}</div>`;
  }
  function etuOption(value, label, selected = false) {
    return `<option style="background:#1d2c4d;color:#f2ede0;" value="${value}" ${selected ? "selected" : ""}>${label}</option>`;
  }

  // -------------------------------------------------------------------------
  // 2. UTILITAIRES DIALOGUE
  // -------------------------------------------------------------------------
  const hasDialogV2 = !!(foundry?.applications?.api?.DialogV2);
  async function formDialog({ title, content, okLabel = "Valider" }) {
    if (hasDialogV2) {
      let result = null;
      await foundry.applications.api.DialogV2.wait({
        window: { title },
        content,
        buttons: [
          { action: "ok", label: okLabel, default: true,
            callback: (event, button) => { result = button?.form ? Object.fromEntries(new FormData(button.form)) : {}; } },
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
            ok: { label: okLabel, callback: (html) => resolve(Object.fromEntries(new FormData(html[0].querySelector("form")))) },
            cancel: { label: "Annuler", callback: () => resolve(null) }
          },
          default: "ok"
        }).render(true);
      });
    }
  }
  function notify(type, msg) { ui.notifications[type]?.(msg) ?? ui.notifications.info(msg); }

  // -------------------------------------------------------------------------
  // 3. RÉCUPÉRATION DE L'ACTEUR ET DE SES OBJETS AVEC BATTERIE
  // -------------------------------------------------------------------------
  const controlled = canvas.tokens.controlled;
  let actor;
  if (controlled.length === 1) actor = controlled[0].actor;
  else if (controlled.length === 0) actor = game.user.character;
  if (!actor) { notify("warn", "Sélectionne un unique token (ou assigne-toi un personnage) avant de lancer la macro."); return; }
  if (controlled.length > 1) { notify("warn", "Plusieurs tokens sélectionnés : sélectionne-en un seul."); return; }

  const objetsAvecBatterie = actor.items.filter(i => i.system?.additionalStats?.[STAT_BATTERIE] !== undefined);
  if (!objetsAvecBatterie.length) {
    notify("warn", `Aucun objet avec l'Additional Stat "${STAT_BATTERIE}" trouvé dans l'inventaire de ${actor.name}.`);
    return;
  }

  // -------------------------------------------------------------------------
  // 4. CHOIX DE L'OBJET
  // -------------------------------------------------------------------------
  const optionsObjets = objetsAvecBatterie.map(i => {
    const niveau = i.system.additionalStats[STAT_BATTERIE].value || "Bon";
    return etuOption(i.id, `${i.name} (${niveau})`);
  }).join("");

  const choixObjet = await formDialog({
    title: "Batterie d'appareil — ETU",
    okLabel: "Suivant",
    content: etuWrap(`
      ${etuHeader("Service Technique ETU", `${actor.name} — Choix de l'appareil`)}
      ${etuField("Appareil concerné", `<select name="objet" style="${S.select}">${optionsObjets}</select>`)}
    `)
  });

  if (!choixObjet || !choixObjet.objet) return;
  const item = objetsAvecBatterie.find(i => i.id === choixObjet.objet);
  if (!item) return;

  // -------------------------------------------------------------------------
  // 5. LECTURE DE L'ÉTAT ACTUEL (sur l'ITEM, pas l'acteur)
  // -------------------------------------------------------------------------
  const niveauActuel = item.system.additionalStats[STAT_BATTERIE].value || "Bon";

  // -------------------------------------------------------------------------
  // 6. DIALOGUE D'ACTION
  // -------------------------------------------------------------------------
  const choix = await formDialog({
    title: "Batterie d'appareil — ETU",
    okLabel: "Valider",
    content: etuWrap(`
      ${etuHeader("Service Technique ETU", `${item.name} — Batterie : ${niveauActuel}`)}
      ${etuField("Action", `
        <select name="action" style="${S.select}">
          ${etuOption("rien", "Ne rien faire (juste consulter)")}
          ${etuOption("decrementer", "Décrémenter d'un cran (échec sous malus de signal, non branché)")}
          ${etuOption("forcer", "Fixer directement le niveau")}
        </select>`)}
      ${etuField('Si "Fixer directement le niveau"', `
        <select name="niveauForce" style="${S.select}">
          ${etuOption("Bon", "Bon")}
          ${etuOption("Faible", "Faible")}
          ${etuOption("Vide", "Vide")}
        </select>`)}
    `)
  });

  if (!choix || !choix.action || choix.action === "rien") return;

  let nouveauNiveau = niveauActuel;
  let noteChat = "";

  if (choix.action === "decrementer") {
    const idx = NIVEAUX.indexOf(niveauActuel);
    if (idx <= 0) {
      noteChat = "Déjà au niveau le plus bas (Vide) — rien à décrémenter.";
    } else {
      nouveauNiveau = NIVEAUX[idx - 1];
      noteChat = `Batterie décrémentée : ${niveauActuel} → ${nouveauNiveau}.`;
    }

  } else if (choix.action === "forcer") {
    nouveauNiveau = choix.niveauForce;
    noteChat = `Niveau fixé manuellement à "${nouveauNiveau}".`;
  }

  // -------------------------------------------------------------------------
  // 7. APPLICATION (sur l'ITEM) ET MESSAGE DE CHAT
  // -------------------------------------------------------------------------
  if (nouveauNiveau !== niveauActuel) {
    try {
      await item.update({ [`system.additionalStats.${STAT_BATTERIE}.value`]: nouveauNiveau });
    } catch (e) {
      console.warn("[ETU — Batterie] Avertissement lors de la mise à jour (peut être bénin) :", e);
    }
    // On vérifie après coup si la valeur a réellement été appliquée, plutôt que
    // de se fier uniquement à une exception levée par update() (Foundry lève
    // parfois un avertissement bénin sans que l'écriture échoue réellement).
    const valeurReelle = item.system?.additionalStats?.[STAT_BATTERIE]?.value;
    if (valeurReelle !== nouveauNiveau) {
      notify("warn", `Impossible de mettre à jour l'Additional Stat "${STAT_BATTERIE}" sur "${item.name}". Vérifie qu'elle est bien activée sur cet objet.`);
    }
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <div style="${S.dialog}">
        <h3 style="${S.chatH3}">🔋 Batterie — ${item.name}</h3>
        <div style="${S.chatDetail}"><strong>Personnage :</strong> ${actor.name}</div>
        <div style="${S.chatDetail}">${noteChat}</div>
        <div style="${S.chatDetail}"><strong>Niveau actuel :</strong> ${nouveauNiveau}</div>
      </div>
    `
  });

  notify("info", `Batterie de "${item.name}" (${actor.name}) : ${nouveauNiveau}.`);

 } catch (err) {
   console.error("[ETU — Batterie]", err);
   ui.notifications.error(`ETU Batterie — Erreur : ${err.message}`, { permanent: true, console: false });
 }
})();