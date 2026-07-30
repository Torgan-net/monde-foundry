/**
 * ============================================================================
 *  ETU — Allocation Semestrielle (Semester Allowance)
 *  Compatible Foundry VTT v13 et v14 — Système SWADE
 * ----------------------------------------------------------------------------
 *  Remet à niveau l'argent de poche disponible du personnage sélectionné en
 *  fonction de sa catégorie de richesse (Pauvre/Classe moyenne/Riche/
 *  Extrêmement riche), déterminée automatiquement via ses Atouts/Handicaps
 *  (Pauvreté, Riche, Extrêmement Riche) mais modifiable manuellement dans
 *  le dialogue avant application.
 *
 *  Règle appliquée : l'allocation REMPLACE le montant actuel (elle ne
 *  s'additionne pas) — "les dépenses annexes absorbent toute épargne
 *  restante", et elle ne dépasse jamais le plafond de la catégorie.
 *
 *  Barème ($) :
 *    Pauvre (Handicap Pauvreté)........... 250$
 *    Classe moyenne........................ 500$
 *    Riche (Atout Riche)................... 1000$
 *    Extrêmement riche (Atout Extrêmement Riche) 1500$
 *
 *  Barème (Richesse dé, si le réglage système est actif) :
 *    Pauvre................................ d4
 *    Classe moyenne........................ d6
 *    Riche.................................. d8
 *    Extrêmement riche...................... d10
 *  (le modificateur de Richesse est remis à 0 au passage)
 * ============================================================================
 */

(async () => {
 try {

  // -------------------------------------------------------------------------
  // 0. CONFIGURATION
  // -------------------------------------------------------------------------
  const FUNDS_PATH = "system.details.currentFunds";

  const CATEGORIES = [
    { id: "poor", label: "Pauvre (Handicap Pauvreté)", argent: 250, de: 4 },
    { id: "middle", label: "Classe moyenne", argent: 500, de: 6 },
    { id: "rich", label: "Riche (Atout Riche)", argent: 1000, de: 8 },
    { id: "filthyRich", label: "Extrêmement riche (Atout Extrêmement Riche)", argent: 1500, de: 10 }
  ];

  function richesseActive() {
    try {
      return game.settings.get("swade", "wealthType") === "wealthDie";
    } catch (e) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // 1. THÈME VISUEL — EN STYLES EN LIGNE (la balise <style> injectée dans le
  //    contenu d'un Dialog est filtrée par Foundry ; seuls les styles inline
  //    sur chaque élément passent — voir les autres macros ETU).
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
  // 2. UTILITAIRES DIALOGUE (V13/V14, sans <form> imbriqué)
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
  // 3. RÉCUPÉRATION DES ACTEURS (un ou plusieurs tokens sélectionnés)
  // -------------------------------------------------------------------------
  const controlled = canvas.tokens.controlled;
  let acteurs;
  if (controlled.length === 0) {
    acteurs = game.user.character ? [game.user.character] : [];
  } else {
    const vus = new Set();
    acteurs = controlled
      .map(t => t.actor)
      .filter(a => a && a.type === "character" && !vus.has(a.id) && vus.add(a.id));
  }
  if (!acteurs.length) { notify("warn", "Sélectionne au moins un token de personnage (ou assigne-toi un personnage)."); return; }

  // -------------------------------------------------------------------------
  // 4. DÉTECTION AUTOMATIQUE DE LA CATÉGORIE (via Atouts/Handicaps)
  //    Vérifie les noms d'Item en anglais (Poverty, Rich, Filthy Rich), comme
  //    pour les compétences — à corriger si tes Items sont nommés autrement.
  // -------------------------------------------------------------------------
  function detecterCategorie(acteur) {
    const aFilthyRich = acteur.items.some(i => i.type === "edge" && /filthy\s*rich/i.test(i.name));
    if (aFilthyRich) return "filthyRich";
    const aRiche = acteur.items.some(i => i.type === "edge" && /^rich$/i.test(i.name.trim()));
    if (aRiche) return "rich";
    const aPauvre = acteur.items.some(i => i.type === "hindrance" && /poverty/i.test(i.name));
    if (aPauvre) return "poor";
    return "middle";
  }

  const modeRichesse = richesseActive();

  // -------------------------------------------------------------------------
  // 5. DIALOGUE DE CONFIRMATION — une ligne par acteur, catégorie modifiable
  // -------------------------------------------------------------------------
  function optionsPour(categorieDetectee) {
    return CATEGORIES.map(c => {
      const valeur = modeRichesse ? `d${c.de}` : `${c.argent}$`;
      return etuOption(c.id, `${c.label} — ${valeur}`, c.id === categorieDetectee);
    }).join("");
  }

  const lignesActeurs = acteurs.map(a =>
    etuField(a.name, `<select name="categorie__${a.id}" style="${S.select}">${optionsPour(detecterCategorie(a))}</select>`)
  ).join("");

  const choix = await formDialog({
    title: "Allocation Semestrielle — ETU",
    okLabel: "Créditer",
    content: etuWrap(`
      ${etuHeader("Bureau des Bourses et Aides", "Nouveau semestre")}
      <p style="${S.hint}">
        Catégorie détectée automatiquement via les Atouts/Handicaps pour chaque personnage — modifie si besoin avant de valider.
        ${modeRichesse ? "Système Richesse (dé) actif." : "Système Argent ($) actif."}
      </p>
      ${lignesActeurs}
    `)
  });

  if (!choix) return;

  // -------------------------------------------------------------------------
  // 6. APPLICATION À CHAQUE ACTEUR (remplace le montant, ne s'additionne pas)
  // -------------------------------------------------------------------------
  for (const acteur of acteurs) {
    const categorieId = choix[`categorie__${acteur.id}`];
    const categorie = CATEGORIES.find(c => c.id === categorieId);
    if (!categorie) continue;

    let resume = "";
    if (modeRichesse) {
      await acteur.update({
        "system.details.wealth.die": categorie.de,
        "system.details.wealth.modifier": 0
      });
      resume = `Richesse remise à <strong>d${categorie.de}</strong> (modificateur remis à 0).`;
    } else {
      await acteur.update({ [FUNDS_PATH]: categorie.argent });
      resume = `Argent de poche remis à <strong>${categorie.argent}$</strong>.`;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: acteur }),
      content: `
        <div style="${S.dialog}">
          <h3 style="${S.chatH3}">💰 Allocation semestrielle</h3>
          <div style="${S.chatDetail}">${acteur.name} — <strong>Catégorie :</strong> ${categorie.label}</div>
          <div style="${S.chatDetail}">${resume}</div>
        </div>
      `
    });
  }

  notify("info", `Allocation semestrielle appliquée à ${acteurs.length} personnage(s).`);

 } catch (err) {
   console.error("[ETU — Allocation Semestrielle]", err);
   ui.notifications.error(`ETU Allocation — Erreur : ${err.message}`, { permanent: true, console: false });
 }
})();