/* ==========================================================================
 * 💰 BUTIN D'EXPÉDITION — macro Foundry VTT (SWADE)
 * Version 1.1.0
 * --------------------------------------------------------------------------
 * Répartit un gain monétaire entre les PJ ayant participé à une expédition.
 *  • Trois modes : montant identique / montant individuel / standard ± ajustement
 *  • Participants : jetons sélectionnés ; bouton « Ajouter » pour les autres PJ
 *  • Met à jour la bourse de chaque PJ et publie un récapitulatif dans le chat
 * Compatibilité visée : Foundry V13/V14, SWADE 5.x/6.x
 * Exécution : MJ uniquement (modifie des acteurs appartenant aux joueurs)
 * ========================================================================== */
(async () => {
  const MACRO_VERSION = "1.1.0";

  // --- Paramètres -----------------------------------------------------------
  // Même chemin que les macros Boutique de Ferremont et Temps libre
  const CURRENCY_PATH = "system.details.currency";
  // Monnaie de la campagne : « Silver Coin ($) »
  const CURRENCY_NAME = "Silver Coin";
  const CURRENCY = "$";
  const DEFAULT_AMOUNT = 100;

  if (!game.user.isGM) {
    ui.notifications.warn("Butin d'expédition : macro réservée au MJ.");
    return;
  }

  // --- Utilitaires ----------------------------------------------------------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => {
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n) => round2(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const signed = (n) => (n < 0 ? `−${fmt(Math.abs(n))}` : `+${fmt(n)}`);

  // Image du jeton (prototype), sinon portrait ; ignore les jetons « joker » (chemins avec *)
  const IMG_SIZE = 50;
  const tokenImg = (actor) => {
    const t = actor?.prototypeToken?.texture?.src;
    return (t && !t.includes("*")) ? t : (actor?.img || "icons/svg/mystery-man.svg");
  };
  const imgTag = (actor, size = IMG_SIZE) =>
    `<img src="${esc(tokenImg(actor))}" width="${size}" height="${size}" alt="" style="width:${size}px !important;height:${size}px !important;max-width:${size}px !important;max-height:${size}px !important;min-width:${size}px;object-fit:contain;border:none !important;border-radius:4px;flex:0 0 ${size}px;margin:0;">`;

  const getPurse = (actor) => num(foundry.utils.getProperty(actor, CURRENCY_PATH));

  // --- Candidats : PJ (type character) appartenant à un joueur --------------
  const controlledActors = (canvas?.tokens?.controlled ?? [])
    .map((t) => t.actor).filter((a) => a?.type === "character");
  const byId = new Map();
  for (const a of game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner)) byId.set(a.id, a);
  for (const a of controlledActors) if (!byId.has(a.id)) byId.set(a.id, a);
  const candidates = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  if (!candidates.length) {
    ui.notifications.warn("Butin d'expédition : aucun PJ appartenant à un joueur trouvé.");
    return;
  }

  const controlledIds = new Set(controlledActors.map((a) => a.id));

  // --- État -----------------------------------------------------------------
  const state = {
    mode: "uniforme",            // uniforme | individuel | ajustement
    standard: DEFAULT_AMOUNT,
    motif: "",
    publicMsg: true,
    pickerOpen: controlledIds.size === 0,   // aucun jeton sélectionné : on ouvre directement la liste d'ajout
    rows: new Map(candidates.map((a) => [a.id, {
      actor: a,
      inList: controlledIds.has(a.id),
      custom: DEFAULT_AMOUNT,
      delta: 0,
    }])),
  };

  const gainOf = (row) => {
    switch (state.mode) {
      case "individuel": return round2(row.custom);
      case "ajustement": return round2(state.standard + row.delta);
      default:           return round2(state.standard);
    }
  };

  // --- Styles (portée limitée à #xpb-root) ----------------------------------
  const CSS = `
  <style>
    #xpb-root { --gold:#c9a227; --gold-l:#f6d365; --ink:#3b2a00; --parch:#fffaf0;
      --line:#e8d9a8; --ok:#2e7d32; --ko:#c62828; --muted:#8a7a55;
      color:var(--ink) !important; font-size:13px; }
    #xpb-root * { box-sizing:border-box; }
    #xpb-root .xpb-banner { background:linear-gradient(135deg,var(--gold-l),var(--gold));
      border-radius:10px; padding:6px 10px; text-align:center; margin-bottom:8px;
      box-shadow:0 2px 6px rgba(120,90,0,.35); }
    #xpb-root .xpb-banner .xpb-coins { font-size:20px; line-height:1; animation:xpb-bounce 1.6s ease-in-out infinite; }
    #xpb-root .xpb-banner h2 { margin:4px 0 0 !important; border:none !important;
      font-size:15px !important; color:var(--ink) !important; letter-spacing:.5px; }
    #xpb-root .xpb-banner p { margin:2px 0 0; font-style:italic; font-size:12px; }
    @keyframes xpb-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }

    #xpb-root .xpb-panel { background:var(--parch); border:1px solid var(--line);
      border-radius:8px; padding:8px 10px; margin-bottom:8px; }
    #xpb-root .xpb-label { color:#666666; font-style:italic; font-size:12px; margin-bottom:4px; display:block; }

    #xpb-root .xpb-modes { display:flex; gap:4px; }
    #xpb-root .xpb-modes label { flex:1; margin:0; cursor:pointer; }
    #xpb-root .xpb-modes input { display:none; }
    #xpb-root .xpb-modes span { display:block; text-align:center; padding:6px 4px; border-radius:6px;
      border:1px solid var(--line); background:#fff; font-size:12px; transition:all .15s; }
    #xpb-root .xpb-modes span b { display:block; font-size:16px; }
    #xpb-root .xpb-modes input:checked + span { background:linear-gradient(135deg,var(--gold-l),var(--gold));
      border-color:var(--gold); font-weight:bold; box-shadow:0 1px 4px rgba(120,90,0,.35); }

    #xpb-root .xpb-line { display:flex; gap:8px; align-items:center; }
    #xpb-root .xpb-line > * { flex:1; }
    #xpb-root input[type=number], #xpb-root input[type=text] { background:#fff !important;
      color:var(--ink) !important; border:1px solid var(--line) !important; border-radius:5px;
      height:28px; padding:0 6px; }
    #xpb-root .xpb-std { font-size:16px !important; font-weight:bold; text-align:center; }
    #xpb-root .xpb-std-wrap { position:relative; flex:0 0 140px; }
    #xpb-root .xpb-std-wrap::after { content:"${esc(CURRENCY)}"; position:absolute; right:8px; top:6px;
      font-size:11px; color:var(--muted); pointer-events:none; }

    #xpb-root .xpb-tools { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    #xpb-root .xpb-tools button { width:auto; height:22px; line-height:20px; padding:0 8px; font-size:11px;
      background:#fff; color:var(--ink); border:1px solid var(--line); border-radius:4px; margin-left:4px; }
    #xpb-root .xpb-list { max-height:300px; overflow-y:auto; padding-right:2px; }
    #xpb-root .xpb-row { display:flex; align-items:center; gap:8px; padding:3px 6px; margin-bottom:4px;
      border-radius:7px; border:1px solid var(--gold); background:#fffdf4; box-shadow:inset 3px 0 0 var(--gold); }
    #xpb-root .xpb-who { flex:1; display:flex; align-items:center; gap:8px; min-width:0; }
    #xpb-root .xpb-remove { flex:0 0 22px; width:22px !important; height:22px; line-height:18px; padding:0;
      border-radius:50%; border:1px solid var(--line); background:#fff; color:var(--muted); font-size:14px; cursor:pointer; }
    #xpb-root .xpb-remove:hover { color:var(--ko); border-color:var(--ko); }
    #xpb-root .xpb-empty { text-align:center; font-style:italic; color:var(--muted); padding:10px 4px; }
    #xpb-root .xpb-picker { border-top:1px dashed var(--line); margin-top:6px; padding-top:6px; }
    #xpb-root .xpb-picker-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
    #xpb-root .xpb-chips { display:flex; flex-wrap:wrap; gap:4px; max-height:120px; overflow-y:auto; }
    #xpb-root .xpb-chip { display:inline-flex; align-items:center; gap:4px; width:auto !important; height:auto;
      padding:2px 8px 2px 2px; border:1px solid var(--line); border-radius:16px; background:#fff;
      color:var(--ink); font-size:11px; line-height:1.2; cursor:pointer; }
    #xpb-root .xpb-chip:hover { border-color:var(--gold); background:#fff3c4; }
    #xpb-root .xpb-chip img { border-radius:50% !important; }
    #xpb-root .xpb-add { font-weight:bold; }
    #xpb-root .xpb-who img { width:50px !important; height:50px !important; max-width:50px !important;
      max-height:50px !important; object-fit:contain; flex:0 0 50px; border:none !important; }
    #xpb-root .xpb-name { font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #xpb-root .xpb-name small { display:block; font-weight:normal; color:var(--muted); font-size:11px; }
    #xpb-root .xpb-ctrl { flex:0 0 86px; }
    #xpb-root .xpb-ctrl input { width:100%; text-align:right; }
    #xpb-root .xpb-ctrl .xpb-delta.pos { color:var(--ok) !important; font-weight:bold; }
    #xpb-root .xpb-ctrl .xpb-delta.neg { color:var(--ko) !important; font-weight:bold; }
    #xpb-root .xpb-gain { flex:0 0 92px; text-align:right; font-weight:bold; line-height:1.15; }
    #xpb-root .xpb-gain .g { color:var(--ok); font-size:14px; }
    #xpb-root .xpb-gain .g.neg { color:var(--ko); }
    #xpb-root .xpb-gain small { display:block; font-weight:normal; color:var(--muted); font-size:10px; }

    #xpb-root .xpb-total { display:flex; justify-content:space-between; align-items:center;
      background:linear-gradient(135deg,#fff3c4,#f6d365); border:1px solid var(--gold);
      border-radius:8px; padding:8px 12px; font-size:13px; }
    #xpb-root .xpb-total strong { font-size:17px; }
    #xpb-root .xpb-opts { display:flex; align-items:center; gap:6px; font-size:12px; margin-top:6px; }
    #xpb-root .xpb-opts input { margin:0; }
    #xpb-root .xpb-ver { text-align:right; font-size:10px; color:var(--muted); margin-top:4px; }
  </style>`;

  // --- Rendu des lignes -----------------------------------------------------
  const ctrlHtml = (row) => {
    if (state.mode === "individuel") {
      return `<input type="number" class="xpb-custom" step="any" value="${row.custom}" title="Montant pour ce PJ">`;
    }
    if (state.mode === "ajustement") {
      const cls = row.delta > 0 ? "pos" : row.delta < 0 ? "neg" : "";
      return `<input type="number" class="xpb-delta ${cls}" step="any" value="${row.delta || ""}" placeholder="±0" title="Bonus (+) ou malus (−) par rapport au standard">`;
    }
    return "";
  };

  const gainHtml = (row) => {
    const g = gainOf(row);
    const after = Math.max(0, round2(getPurse(row.actor) + g));
    return `<span class="g ${g < 0 ? "neg" : ""}">${signed(g)}</span><small>→ ${fmt(after)} ${CURRENCY}</small>`;
  };

  const inList = () => [...state.rows.values()].filter((r) => r.inList);
  const outList = () => [...state.rows.values()].filter((r) => !r.inList);

  const rowsHtml = () => {
    const rows = inList();
    if (!rows.length) return `<div class="xpb-empty">Aucun participant : sélectionnez des jetons ou ajoutez des PJ.</div>`;
    return rows.map((row) => `
    <div class="xpb-row" data-id="${row.actor.id}">
      <button type="button" class="xpb-remove" title="Retirer de l'expédition">×</button>
      <div class="xpb-who">
        ${imgTag(row.actor)}
        <div class="xpb-name">${esc(row.actor.name)}<small>Bourse : ${fmt(getPurse(row.actor))} ${CURRENCY}</small></div>
      </div>
      <div class="xpb-ctrl">${ctrlHtml(row)}</div>
      <div class="xpb-gain">${gainHtml(row)}</div>
    </div>`).join("");
  };

  const chipsHtml = () => {
    const rows = outList();
    if (!rows.length) return `<span class="xpb-empty" style="padding:2px">tous les PJ participent déjà.</span>`;
    return rows.map((row) => `
      <button type="button" class="xpb-chip" data-id="${row.actor.id}" title="Ajouter ${esc(row.actor.name)}">
        ${imgTag(row.actor, 26)}<span>${esc(row.actor.name)}</span>
      </button>`).join("");
  };

  const modeHint = {
    uniforme:   "chaque PJ reçoit le montant standard.",
    individuel: "saisissez un montant propre à chaque PJ.",
    ajustement: "montant standard, avec bonus ou malus pour certains PJ.",
  };

  const content = `${CSS}
  <div id="xpb-root">
    <div class="xpb-banner">
      <div class="xpb-coins">💰✨🪙</div>
      <h2>Le butin de l'expédition</h2>
      <p>Que tintent les bourses des aventuriers !</p>
    </div>

    <div class="xpb-panel">
      <span class="xpb-label">Mode de répartition</span>
      <div class="xpb-modes">
        <label><input type="radio" name="xpb-mode" value="uniforme" checked><span><b>⚖️</b>Identique</span></label>
        <label><input type="radio" name="xpb-mode" value="individuel"><span><b>✍️</b>Individuel</span></label>
        <label><input type="radio" name="xpb-mode" value="ajustement"><span><b>➕➖</b>Standard ± bonus</span></label>
      </div>
      <div class="xpb-hint" style="font-size:11px;color:#8a7a55;margin-top:4px;font-style:italic;">${modeHint.uniforme}</div>
    </div>

    <div class="xpb-panel">
      <div class="xpb-line">
        <div class="xpb-std-wrap">
          <span class="xpb-label">Montant standard (${CURRENCY_NAME})</span>
          <input type="number" class="xpb-std" step="any" value="${state.standard}">
        </div>
        <div>
          <span class="xpb-label">Expédition (facultatif)</span>
          <input type="text" class="xpb-motif" placeholder="ex. Les cryptes de Valombre">
        </div>
      </div>
    </div>

    <div class="xpb-panel">
      <div class="xpb-tools">
        <span class="xpb-label" style="margin:0">Participants</span>
        <span>
          <button type="button" data-xpb="std" class="xpb-apply-std" style="display:none">Standard partout</button>
          <button type="button" data-xpb="toggle" class="xpb-add">➕ Ajouter des PJ (<span class="xpb-out">0</span>)</button>
        </span>
      </div>
      <div class="xpb-list">${rowsHtml()}</div>
      <div class="xpb-picker" style="display:none">
        <div class="xpb-picker-head">
          <span class="xpb-label" style="margin:0">Autres PJ des joueurs : cliquez pour ajouter</span>
          <span>
            <button type="button" data-xpb="all">Tout ajouter</button>
            <button type="button" data-xpb="none">Tout retirer</button>
          </span>
        </div>
        <div class="xpb-chips">${chipsHtml()}</div>
      </div>
    </div>

    <div class="xpb-total">
      <span>🧭 <span class="xpb-count">0</span> aventurier(s)</span>
      <span>Total distribué : <strong class="xpb-sum">0</strong> ${esc(CURRENCY)} <small style="opacity:.7">(${CURRENCY_NAME})</small></span>
    </div>
    <label class="xpb-opts"><input type="checkbox" class="xpb-public" checked> annoncer le butin à toute la table (sinon : MJ seulement)</label>
    <div class="xpb-ver">v${MACRO_VERSION}</div>
  </div>`;

  // --- Interactions ---------------------------------------------------------
  let rootEl = null;

  const refreshTotals = () => {
    if (!rootEl) return;
    const active = inList();
    const sum = active.reduce((s, r) => s + gainOf(r), 0);
    rootEl.querySelector(".xpb-out").textContent = outList().length;
    rootEl.querySelector(".xpb-count").textContent = active.length;
    rootEl.querySelector(".xpb-sum").textContent = fmt(sum);
    const okBtn = rootEl.closest(".application, .app, .window-app")?.querySelector('button[data-action="ok"]');
    if (okBtn) okBtn.disabled = active.length === 0;
  };

  const refreshRow = (id) => {
    const row = state.rows.get(id);
    const el = rootEl.querySelector(`.xpb-row[data-id="${id}"]`);
    if (!row || !el) return;
    el.querySelector(".xpb-gain").innerHTML = gainHtml(row);
    const d = el.querySelector(".xpb-delta");
    if (d) {
      d.classList.toggle("pos", row.delta > 0);
      d.classList.toggle("neg", row.delta < 0);
    }
  };

  const refreshAllRows = () => { for (const id of state.rows.keys()) refreshRow(id); refreshTotals(); };

  const rebuildList = () => {
    rootEl.querySelector(".xpb-list").innerHTML = rowsHtml();
    rootEl.querySelector(".xpb-chips").innerHTML = chipsHtml();
    rootEl.querySelector(".xpb-picker").style.display = state.pickerOpen ? "" : "none";
    rootEl.querySelector(".xpb-hint").textContent = modeHint[state.mode];
    rootEl.querySelector(".xpb-apply-std").style.display = state.mode === "individuel" ? "" : "none";
    refreshTotals();
  };

  const bind = (root) => {
    rootEl = root;

    root.querySelectorAll('input[name="xpb-mode"]').forEach((r) => r.addEventListener("change", (ev) => {
      state.mode = ev.currentTarget.value;
      rebuildList();
    }));

    root.querySelector(".xpb-std").addEventListener("input", (ev) => {
      state.standard = num(ev.currentTarget.value);
      if (state.mode !== "individuel") refreshAllRows();
    });

    root.querySelector(".xpb-motif").addEventListener("input", (ev) => { state.motif = ev.currentTarget.value; });
    root.querySelector(".xpb-public").addEventListener("change", (ev) => { state.publicMsg = ev.currentTarget.checked; });

    root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn || !root.contains(btn)) return;
      const action = btn.dataset.xpb;
      if (action === "toggle") state.pickerOpen = !state.pickerOpen;
      else if (action === "all")  for (const r of state.rows.values()) r.inList = true;
      else if (action === "none") for (const r of state.rows.values()) r.inList = false;
      else if (action === "std")  for (const r of state.rows.values()) r.custom = state.standard;
      else if (btn.classList.contains("xpb-chip")) state.rows.get(btn.dataset.id).inList = true;
      else if (btn.classList.contains("xpb-remove")) state.rows.get(btn.closest(".xpb-row").dataset.id).inList = false;
      else return;
      rebuildList();
    });

    // Délégation sur la liste (survit aux reconstructions)
    const list = root.querySelector(".xpb-list");
    list.addEventListener("input", (ev) => {
      const rowEl = ev.target.closest(".xpb-row");
      if (!rowEl) return;
      const row = state.rows.get(rowEl.dataset.id);
      if (ev.target.classList.contains("xpb-custom")) row.custom = num(ev.target.value);
      else if (ev.target.classList.contains("xpb-delta")) row.delta = num(ev.target.value);
      else return;
      refreshRow(rowEl.dataset.id);
      refreshTotals();
    });

    rebuildList();
  };

  // --- Fenêtre --------------------------------------------------------------
  const DialogV2 = foundry.applications.api.DialogV2;
  const result = await DialogV2.wait({
    window: { title: "💰 Butin d'expédition", resizable: true },
    position: { width: 580 },
    content,
    buttons: [
      { action: "ok", label: "Partager le butin !", icon: "fa-solid fa-coins", default: true, callback: () => "ok" },
      { action: "cancel", label: "Annuler", icon: "fa-solid fa-xmark", callback: () => null },
    ],
    render: (event, dialog) => {
      const el = dialog?.element ?? event?.target?.element;
      const root = el?.querySelector?.("#xpb-root");
      if (root) bind(root);
    },
    rejectClose: false,
  });

  if (result !== "ok") return;

  // --- Application des gains ------------------------------------------------
  const active = inList();
  if (!active.length) {
    ui.notifications.info("Butin d'expédition : aucun participant sélectionné.");
    return;
  }

  const recap = active.map((row) => {
    const before = getPurse(row.actor);
    const gain = gainOf(row);
    const raw = round2(before + gain);
    const after = Math.max(0, raw);
    return { actor: row.actor, before, gain, after, clamped: raw < 0, delta: state.mode === "ajustement" ? row.delta : 0 };
  });

  try {
    await Actor.updateDocuments(recap.map((r) => ({ _id: r.actor.id, [CURRENCY_PATH]: r.after })));
  } catch (err) {
    console.error("Butin d'expédition | échec de la mise à jour", err);
    ui.notifications.error("Butin d'expédition : la mise à jour des bourses a échoué (voir la console).");
    return;
  }

  // --- Récapitulatif dans le chat ------------------------------------------
  const total = recap.reduce((s, r) => s + r.gain, 0);
  const modeLabel = { uniforme: "part identique", individuel: "parts individuelles", ajustement: "part standard ± ajustements" }[state.mode];

  const lines = recap.map((r) => {
    const note = r.delta
      ? `<span style="color:${r.delta > 0 ? "#2e7d32" : "#c62828"};font-size:11px;"> (${r.delta > 0 ? "bonus" : "malus"} ${signed(r.delta)} ${CURRENCY})</span>`
      : "";
    const warn = r.clamped ? `<div style="color:#c62828;font-size:10px;">bourse ramenée à 0</div>` : "";
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-top:1px dashed #e8d9a8;">
      ${imgTag(r.actor)}
      <div style="flex:1;min-width:0;line-height:1.25;">
        <div style="font-weight:bold;">${esc(r.actor.name)}</div>
        <div style="font-size:11px;color:#8a7a55;">bourse : ${fmt(r.before)} ${CURRENCY} → <b style="color:#3b2a00">${fmt(r.after)} ${CURRENCY}</b></div>
        ${warn}
      </div>
      <div style="text-align:right;font-weight:bold;font-size:15px;color:${r.gain < 0 ? "#c62828" : "#2e7d32"};white-space:nowrap;">
        ${signed(r.gain)} ${CURRENCY}${note ? `<div>${note}</div>` : ""}
      </div>
    </div>`;
  }).join("");

  const chat = `
  <div style="border:2px solid #c9a227;border-radius:10px;overflow:hidden;background:#fffaf0;color:#3b2a00;">
    <div style="background:linear-gradient(135deg,#f6d365,#c9a227);padding:8px 10px;text-align:center;">
      <div style="font-size:22px;line-height:1;">💰✨🪙</div>
      <div style="font-weight:bold;font-size:16px;margin-top:2px;">Le butin est partagé !</div>
      ${state.motif.trim() ? `<div style="font-style:italic;font-size:12px;">${esc(state.motif.trim())}</div>` : ""}
    </div>
    <div style="padding:4px 8px;font-size:11px;font-style:italic;color:#666666;text-align:center;">
      ${esc(modeLabel)}${state.mode !== "individuel" ? ` · standard : ${fmt(state.standard)} ${esc(CURRENCY)}` : ""}
    </div>
    ${lines}
    <div style="background:#fff3c4;border-top:2px solid #c9a227;padding:6px 10px;display:flex;justify-content:space-between;align-items:center;">
      <span>🧭 ${recap.length} aventurier(s)</span>
      <span>total : <b style="font-size:15px;">${fmt(total)}</b> ${esc(CURRENCY)}</span>
    </div>
  </div>`;

  await ChatMessage.create({
    content: chat,
    speaker: { alias: "Butin d'expédition" },
    whisper: state.publicMsg ? [] : ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
  });

  ui.notifications.info(`💰 Butin partagé : ${fmt(total)} ${CURRENCY} entre ${recap.length} aventurier(s).`);
})();