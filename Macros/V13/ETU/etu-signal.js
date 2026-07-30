/**
 * ============================================================================
 *  ETU — Niveau de Signal (Signal Penalties)
 *  Compatible Foundry VTT v13 et v14 — Système SWADE
 * ----------------------------------------------------------------------------
 *  Sélectionne un ou plusieurs tokens (les joueurs présents dans la zone),
 *  choisis le niveau de signal actuel (0 à 4 barres), et la macro applique
 *  automatiquement le malus correspondant aux compétences Recherche,
 *  Piratage et Électronique via Active Effect (@Skill{}), en retirant
 *  d'abord tout effet de signal précédent.
 *
 *  Barème :
 *    4 barres : aucun malus (l'effet précédent est retiré, aucun nouveau créé)
 *    3 barres : -1
 *    2 barres : -2
 *    1 barre  : -3
 *    0 barre  : aucun accès du tout (retire tout malus chiffré — pas de jet
 *               possible, à gérer narrativement/par le MJ)
 *
 *  LIMITES CONNUES (voir aussi le message de chat) :
 *  - Le malus s'applique à TOUTES les utilisations de ces 3 compétences tant
 *    qu'il est actif, pas seulement aux usages internet/communication (la
 *    règle ne s'applique qu'à ces usages, distinction non automatisable).
 *  - La perte de batterie en cas d'échec n'est PAS automatisée (mécanique
 *    "Battery" non implémentée ici) — un rappel est juste posté dans le chat.
 * ============================================================================
 */

(async () => {
 try {

  // -------------------------------------------------------------------------
  // 0. CONFIGURATION
  // -------------------------------------------------------------------------
  const FLAG_SCOPE = game.system.id;

  const NIVEAUX = [
    { id: 4, label: "4 barres — Aucun problème", malus: 0 },
    { id: 3, label: "3 barres — Zones intérieures sans fenêtres, quartiers pauvres", malus: -1 },
    { id: 2, label: "2 barres — Zones rurales proches, sous-sols, interférences", malus: -2 },
    { id: 1, label: "1 barre — Zones rurales isolées, Big Thicket accessible", malus: -3 },
    { id: 0, label: "0 barre — Aucun accès internet/téléphone", malus: null }
  ];

  const COMPETENCES_SIGNAL = ["Research", "Hacking", "Electronics"];
  const LABEL_COMP_FR = { "Research": "Recherche", "Hacking": "Piratage", "Electronics": "Électronique" };

  // -------------------------------------------------------------------------
  // 1. THÈME VISUEL — EN STYLES EN LIGNE (la balise <style> injectée dans le
  //    contenu d'un Dialog est filtrée par Foundry ; seuls les styles inline
  //    sur chaque élément passent — voir les macros Examens/Batterie).
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
    chatDetail: "font-size:12px;color:#d3c3e0;margin:6px 0;",
    notes: "border-top:1px dashed rgba(242,237,224,0.3);margin-top:10px;padding-top:8px;font-size:11px;color:#c7cfe0;",
    notesTitle: "color:#e0685c;text-transform:uppercase;letter-spacing:1px;font-size:10px;font-weight:bold;"
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
  // 3. RÉCUPÉRATION DES ACTEURS CONCERNÉS
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
  // 4. DIALOGUE DE CHOIX DU NIVEAU DE SIGNAL
  // -------------------------------------------------------------------------
  const options = NIVEAUX.map(n => etuOption(n.id, n.label)).join("");

  const choix = await formDialog({
    title: "Niveau de Signal — ETU",
    okLabel: "Appliquer",
    content: etuWrap(`
      ${etuHeader("Réseau Cellulaire ETU", `${acteurs.length} personnage(s) concerné(s)`)}
      ${etuField("Niveau de signal actuel", `<select name="niveau" style="${S.select}">${options}</select>`)}
    `)
  });

  if (!choix || choix.niveau === undefined) return;
  const niveau = NIVEAUX.find(n => n.id === Number(choix.niveau));
  if (!niveau) return;

  // -------------------------------------------------------------------------
  // 5. APPLICATION À CHAQUE ACTEUR
  // -------------------------------------------------------------------------
  for (const acteur of acteurs) {
    // Retrait de tout effet de signal précédent (y compris à 4 barres, où
    // aucun nouvel effet n'est recréé ensuite : aucun malus, aucun risque
    // pour la batterie, donc rien à laisser actif sur la fiche)
    const ancienEffet = acteur.effects.filter(e => e.getFlag(FLAG_SCOPE, "etuSignal"));
    if (ancienEffet.length) await acteur.deleteEmbeddedDocuments("ActiveEffect", ancienEffet.map(e => e.id));

    // Application du nouveau malus (sauf à 4 barres ou 0 barre, qui n'ont pas de malus chiffré)
    if (niveau.malus) {
      const changes = COMPETENCES_SIGNAL.map(comp => ({
        key: `@Skill{${comp}}[system.die.modifier]`,
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: String(niveau.malus),
        priority: 20
      }));
      await acteur.createEmbeddedDocuments("ActiveEffect", [{
        name: `ETU — Signal (${niveau.id} barre${niveau.id > 1 ? "s" : ""})`,
        img: "icons/svg/net.svg",
        origin: acteur.uuid,
        disabled: false,
        transfer: false,
        changes,
        description: `Malus de signal (${niveau.label}) : ${COMPETENCES_SIGNAL.map(c => LABEL_COMP_FR[c]).join(", ")} ${niveau.malus}.`,
        flags: { [FLAG_SCOPE]: { etuSignal: true } }
      }]);
    }
  }

  // -------------------------------------------------------------------------
  // 6. MESSAGE DE CHAT RÉCAPITULATIF
  // -------------------------------------------------------------------------
  const detailMalus = niveau.malus
    ? `Malus de <strong>${niveau.malus}</strong> appliqué à ${COMPETENCES_SIGNAL.map(c => LABEL_COMP_FR[c]).join(", ")}.`
    : niveau.id === 0
      ? "Aucun accès internet/téléphone possible du tout (pas de malus chiffré retiré/appliqué)."
      : "Aucun malus (signal correct) — tout effet précédent a été retiré.";

  await ChatMessage.create({
    content: `
      <div style="${S.dialog}">
        <h3 style="${S.chatH3}">📶 Niveau de Signal : ${niveau.label}</h3>
        <div style="${S.chatDetail}">${detailMalus}</div>
        <div style="${S.chatDetail}"><strong>Concerné(s) :</strong> ${acteurs.map(a => a.name).join(", ")}</div>
        <div style="${S.notes}">
          <div style="${S.notesTitle}">Rappels MJ</div>
          <ul style="margin:4px 0 0;padding-left:18px;">
            <li>Le malus ne s'applique qu'aux usages internet/communication de ces compétences — retire-le manuellement si le personnage s'en sert pour autre chose entre-temps.</li>
            <li>En cas d'échec sur un jet avec malus de signal, et si l'appareil n'est pas branché à une source d'alimentation fiable, réduis son niveau de batterie d'un cran (mécanique Battery non automatisée ici).</li>
          </ul>
        </div>
      </div>
    `
  });

  notify("info", `Niveau de signal "${niveau.label}" appliqué à ${acteurs.length} personnage(s).`);

 } catch (err) {
   console.error("[ETU — Niveau de Signal]", err);
   ui.notifications.error(`ETU Signal — Erreur : ${err.message}`, { permanent: true, console: false });
 }
})();