// =====================================================================
// Compteur de rounds hors combat — SWADE VF
// Version 1.1.0
// ---------------------------------------------------------------------
// • MJ : lance la macro → panneau de contrôle (+1, −, réglages, messages).
//   Relancer la macro ferme le compteur (et le masque chez les joueurs).
// • Joueurs : lancent la MÊME macro (ou cliquent le lien posté dans le chat
//   par le MJ) → affichage en lecture seule, synchronisé automatiquement.
// • Pas de socketlib : la synchro passe par un flag sur l'utilisateur MJ,
//   que Foundry diffuse nativement à tous les clients (hook updateUser).
// • Compatible Foundry V12 → V14.
// =====================================================================
const SWRC_MACRO = this; // document Macro courant (sert au lien d'invitation)

(async () => {
  const VERSION = "1.1.0";
  const ID = "swrc-panel";
  const STYLE_ID = "swrc-style";
  const FLAG_SCOPE = "world";
  const FLAG_PRIV = "swRoundCounter";        // état complet (MJ)
  const FLAG_PUB = "swRoundCounterPublic";   // état diffusé aux joueurs
  const LS_POS = `swrc-pos-${game.world.id}`;
  const W = (window.__swrc ??= {});           // persistance de session (hot-reload)

  // --- Utilitaires communs -------------------------------------------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

  const applyPos = (panel, p) => {
    panel.style.left = `${p.left}px`;
    panel.style.top = `${p.top}px`;
    panel.style.transform = "none";
  };
  const keepInView = (panel) => {
    if (panel.style.transform !== "none") return;
    const r = panel.getBoundingClientRect();
    applyPos(panel, {
      left: clamp(r.left, 0, window.innerWidth - r.width),
      top: clamp(r.top, 0, window.innerHeight - 40)
    });
  };
  const makeDraggable = (panel, handle, onDrop) => {
    handle.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest("[data-act], input, select, button")) return;
      const rect = panel.getBoundingClientRect();
      const dx = ev.clientX - rect.left;
      const dy = ev.clientY - rect.top;
      handle.setPointerCapture(ev.pointerId);
      const move = (e) => applyPos(panel, {
        left: clamp(e.clientX - dx, 0, window.innerWidth - rect.width),
        top: clamp(e.clientY - dy, 0, window.innerHeight - 40)
      });
      const up = () => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        onDrop({ left: parseInt(panel.style.left) || 0, top: parseInt(panel.style.top) || 0 });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  };
  const flash = (el) => {
    el.classList.remove("swrc-flash");
    void el.offsetWidth;
    el.classList.add("swrc-flash");
  };

  // --- Style -----------------------------------------------------------
  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ID}{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100;width:300px;
        background:rgba(15,15,20,.93);color:#eee;border:1px solid #777;border-radius:8px;
        box-shadow:0 4px 16px rgba(0,0,0,.6);font-family:var(--font-primary,Signika,sans-serif);user-select:none}
      #${ID}.swrc-viewer{width:220px}
      #${ID} [hidden]{display:none!important}
      #${ID} .swrc-handle{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:move;
        background:rgba(255,255,255,.06);border-bottom:1px solid #444;border-radius:8px 8px 0 0;font-size:12px}
      #${ID} .swrc-title{font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:#bbb}
      #${ID} .swrc-label{flex:1;font-style:italic;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .swrc-handle a{color:#aaa!important;cursor:pointer;text-shadow:none!important}
      #${ID} .swrc-handle a:hover{color:#fff!important}
      #${ID} .swrc-handle a.swrc-off{color:#a55!important}
      #${ID} .swrc-body{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px}
      #${ID} .swrc-count{flex:1;font-size:58px;font-weight:bold;line-height:1;text-align:center}
      #${ID}:not(.swrc-viewer) .swrc-count{cursor:text}
      #${ID} .swrc-countinput{flex:1;width:90px!important;height:52px!important;font-size:32px!important;text-align:center}
      #${ID} .swrc-btn{flex:0 0 auto!important;width:auto!important;margin:0!important;padding:0 12px!important;
        height:40px!important;line-height:40px!important;font-size:22px!important;font-weight:bold!important;
        border-radius:6px!important;border:1px solid #666!important;background:#333!important;color:#eee!important;
        cursor:pointer!important;box-shadow:none!important}
      #${ID} .swrc-btn:hover{background:#444!important}
      #${ID} .swrc-plus{height:58px!important;line-height:58px!important;padding:0 16px!important;font-size:26px!important;
        background:#2d5a2d!important;border-color:#4a8a4a!important}
      #${ID} .swrc-plus:hover{background:#387038!important}
      #${ID} .swrc-banner{margin:0 8px 8px;padding:6px 8px;background:#4d3f14;border:1px solid #c9a227;
        border-radius:4px;color:#ffe9a8;font-size:14px;text-align:center;user-select:text}
      #${ID} .swrc-banner div+div{margin-top:4px;padding-top:4px;border-top:1px dashed #8a7430}
      #${ID} .swrc-banner i{opacity:.7;margin-right:4px}
      #${ID} .swrc-flash{animation:swrc-flash 1.2s ease-out}
      @keyframes swrc-flash{0%{background:#c9a227;color:#111}100%{background:#4d3f14;color:#ffe9a8}}
      #${ID} .swrc-next,#${ID} .swrc-status{font-size:11px;color:#888;text-align:center;padding:0 8px 6px}
      #${ID} .swrc-settings{border-top:1px solid #444;padding:8px;font-size:12px;user-select:text}
      #${ID} .swrc-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
      #${ID} .swrc-row input[type=text]{flex:1}
      #${ID} .swrc-sub{color:#666;font-style:italic;margin:8px 0 4px}
      #${ID} .swrc-msg{display:grid;grid-template-columns:54px 54px 1fr 16px;gap:4px;align-items:center;
        padding:4px 0;border-bottom:1px dotted #444}
      #${ID} .swrc-msg label{display:flex;align-items:center;gap:2px;color:#aaa}
      #${ID} .swrc-msg input[type=text]{grid-column:1 / -1}
      #${ID} .swrc-msg a{color:#a66!important;cursor:pointer;text-align:center}
      #${ID} .swrc-empty{color:#777;font-style:italic;margin:2px 0}
      #${ID} input,#${ID} select{background:#222!important;color:#eee!important;border:1px solid #555!important;
        height:24px!important;font-size:12px!important;border-radius:3px!important;min-width:0}
      #${ID} input[type=number]{width:100%!important}
      #${ID} input[type=checkbox]{height:auto!important;width:auto!important}
      #${ID} .swrc-actions{display:flex;justify-content:space-between;margin-top:8px}
      #${ID} .swrc-actions a{color:#bbb!important;cursor:pointer}
      #${ID} .swrc-actions a:hover{color:#fff!important}
    `;
    document.head.appendChild(style);
  };
  injectStyle();

  // =====================================================================
  //  MODE JOUEUR — affichage en lecture seule
  // =====================================================================
  if (!game.user.isGM) {
    const readPub = () => game.users
      .filter((u) => u.isGM)
      .map((u) => u.getFlag(FLAG_SCOPE, FLAG_PUB))
      .filter(Boolean)
      .sort((a, b) => (b.stamp ?? 0) - (a.stamp ?? 0))[0] ?? null;

    const loadLocalPos = () => { try { return JSON.parse(localStorage.getItem(LS_POS)); } catch { return null; } };
    const saveLocalPos = (p) => { try { localStorage.setItem(LS_POS, JSON.stringify(p)); } catch { /* ignore */ } };

    const renderViewer = (pub) => {
      let panel = document.getElementById(ID);
      if (!panel) {
        panel = document.createElement("div");
        panel.id = ID;
        panel.classList.add("swrc-viewer");
        panel.innerHTML = `
          <header class="swrc-handle" title="Glisser pour déplacer">
            <span class="swrc-title">Rounds</span>
            <span class="swrc-label"></span>
            <a data-act="close" title="Masquer"><i class="fa-solid fa-xmark"></i></a>
          </header>
          <div class="swrc-body"><div class="swrc-count"></div></div>
          <div class="swrc-banner" hidden></div>`;
        document.body.appendChild(panel);
        panel.querySelector('[data-act="close"]').addEventListener("click", (e) => {
          e.preventDefault();
          W.dismissed = true;
          panel.remove();
          ui.notifications.info("Compteur de rounds masqué. Relancez la macro pour le réafficher.");
        });
        const pos = loadLocalPos();
        if (pos) { applyPos(panel, pos); keepInView(panel); }
        makeDraggable(panel, panel.querySelector(".swrc-handle"), saveLocalPos);
      }
      const countEl = panel.querySelector(".swrc-count");
      if (countEl.textContent !== String(pub.round)) {
        countEl.textContent = pub.round;
      }
      panel.querySelector(".swrc-label").textContent = pub.label ?? "";

      const b = panel.querySelector(".swrc-banner");
      const texts = pub.banner?.texts ?? [];
      if (!texts.length) {
        b.hidden = true;
        b.innerHTML = "";
      } else {
        b.innerHTML = texts.map((t) => `<div>${esc(t)}</div>`).join("");
        b.hidden = false;
        if (pub.banner.stamp !== W.lastBannerStamp) {
          W.lastBannerStamp = pub.banner.stamp;
          flash(b);
          for (const t of texts) ui.notifications.info(`Round ${pub.round} : ${t}`);
        }
      }
    };

    const syncViewer = () => {
      const pub = readPub();
      const visible = !!pub?.visible;
      if (visible && W.lastVisible === false) W.dismissed = false; // le MJ vient de le réafficher
      W.lastVisible = visible;
      if (!visible || W.dismissed) { document.getElementById(ID)?.remove(); return; }
      renderViewer(pub);
    };

    // (Ré)installation de l'écoute, une seule fois par session
    if (W.hookId != null) Hooks.off("updateUser", W.hookId);
    W.hookId = Hooks.on("updateUser", (user, changes) => {
      if (!user.isGM) return;
      if (!foundry.utils.hasProperty(changes, `flags.${FLAG_SCOPE}.${FLAG_PUB}`)) return;
      syncViewer();
    });

    // Lancement manuel : on réaffiche toujours
    W.dismissed = false;
    const pub = readPub();
    if (!pub?.visible) {
      W.lastVisible = false;
      ui.notifications.info("Compteur de rounds activé : il apparaîtra dès que le MJ l'affichera.");
    }
    syncViewer();
    return;
  }

  // =====================================================================
  //  MODE MJ — panneau de contrôle
  // =====================================================================

  // Toggle : si déjà ouvert, on ferme
  const existing = document.getElementById(ID);
  if (existing) {
    existing.dispatchEvent(new CustomEvent("swrc-close"));
    return;
  }

  // --- État ------------------------------------------------------------
  const DEFAULTS = { round: 1, label: "", pos: null, logChat: false, playersView: true, messages: [], pubBanner: null };
  const state = foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULTS),
    foundry.utils.deepClone(game.user.getFlag(FLAG_SCOPE, FLAG_PRIV) ?? {}),
    { inplace: false }
  );
  if (!Array.isArray(state.messages)) state.messages = [];
  // Migration v1.0 (champ "chat") → v1.1 (champ "dest")
  const MIGRATE = { none: "gm", gm: "gm-chat", all: "all-chat" };
  for (const m of state.messages) {
    if (!m.dest) m.dest = MIGRATE[m.chat] ?? "gm";
    delete m.chat;
  }

  let open = true;
  let saveTimer = null;
  const buildPub = () => ({
    round: state.round,
    label: state.label ?? "",
    visible: open && !!state.playersView,
    banner: state.pubBanner ?? null,
    stamp: Date.now()
  });
  const save = (now = false) => {
    clearTimeout(saveTimer);
    const fn = () => game.user.update({
      [`flags.${FLAG_SCOPE}.${FLAG_PRIV}`]: foundry.utils.deepClone(state),
      [`flags.${FLAG_SCOPE}.${FLAG_PUB}`]: buildPub()
    });
    if (now) return fn();
    saveTimer = setTimeout(fn, 200);
  };

  // --- Logique des messages programmés ---------------------------------
  // every = 0 → une seule fois au round indiqué ; every = N → tous les N rounds à partir de ce round.
  const isDue = (m, r) => {
    const start = Number(m.round) || 0;
    const every = Number(m.every) || 0;
    if (!String(m.text ?? "").trim()) return false;
    return every > 0 ? (r >= start && (r - start) % every === 0) : r === start;
  };
  const isPublic = (m) => String(m.dest).startsWith("all");
  const nextDue = () => {
    for (let r = state.round + 1; r <= state.round + 500; r++) {
      const msgs = state.messages.filter((m) => isDue(m, r));
      if (msgs.length) return { r, msgs };
    }
    return null;
  };

  const postChat = (content, target) => {
    const data = {
      content: `<div class="swrc-chat">${content}</div>`,
      speaker: { alias: "Compteur de rounds" }
    };
    if (target === "gm") data.whisper = game.users.filter((u) => u.isGM).map((u) => u.id);
    return ChatMessage.create(data);
  };

  const confirmReset = async () => {
    const DialogV2 = foundry.applications?.api?.DialogV2;
    const content = "<p>Remettre le compteur au round 1 ?</p>";
    if (DialogV2) return DialogV2.confirm({ window: { title: "Compteur de rounds" }, content });
    return Dialog.confirm({ title: "Compteur de rounds", content });
  };

  // Lien d'invitation (cliquer sur un lien de macro l'exécute chez le joueur)
  const macroUuid = (SWRC_MACRO?.documentName === "Macro" && !SWRC_MACRO.pack) ? SWRC_MACRO.uuid : null;
  const invitePlayers = async () => {
    if (!macroUuid) return ui.notifications.warn("Lien impossible : la macro doit être enregistrée dans le monde (pas exécutée depuis un compendium).");
    const missing = game.users.filter((u) => !u.isGM && !SWRC_MACRO.testUserPermission(u, "OBSERVER"));
    if (missing.length) {
      ui.notifications.warn(`Ces joueurs n'ont pas les droits Observateur sur la macro : ${missing.map((u) => u.name).join(", ")}.`);
    }
    return ChatMessage.create({
      content: `<p>Le MJ affiche un compteur de rounds.</p><p>@UUID[${macroUuid}]{Afficher le compteur}</p>`,
      speaker: { alias: "Compteur de rounds" }
    });
  };

  // --- Panneau ---------------------------------------------------------
  const panel = document.createElement("div");
  panel.id = ID;
  panel.innerHTML = `
    <header class="swrc-handle" title="Glisser pour déplacer">
      <span class="swrc-title">Rounds</span>
      <span class="swrc-label"></span>
      ${macroUuid ? `<a data-act="invite" title="Poster dans le chat un lien pour que les joueurs affichent le compteur"><i class="fa-solid fa-bullhorn"></i></a>` : ""}
      <a data-act="players"><i class="fa-solid fa-eye"></i></a>
      <a data-act="settings" title="Réglages et messages"><i class="fa-solid fa-gear"></i></a>
      <a data-act="close" title="Fermer (masque aussi chez les joueurs)"><i class="fa-solid fa-xmark"></i></a>
    </header>
    <div class="swrc-body">
      <button type="button" class="swrc-btn" data-act="minus" title="Reculer d'un round">−</button>
      <div class="swrc-count" title="Double-clic pour saisir un numéro"></div>
      <button type="button" class="swrc-btn swrc-plus" data-act="plus" title="Round suivant">+1</button>
    </div>
    <div class="swrc-banner" hidden></div>
    <div class="swrc-next"></div>
    <div class="swrc-settings" hidden>
      <label class="swrc-row">Intitulé <input type="text" data-f="label" placeholder="ex. exploration de la crypte"></label>
      <label class="swrc-row"><input type="checkbox" data-f="logChat"> Noter chaque round dans le chat (chuchoté au MJ)</label>
      <div class="swrc-sub">Messages programmés</div>
      <div class="swrc-msglist"></div>
      <div class="swrc-actions">
        <a data-act="addmsg"><i class="fa-solid fa-plus"></i> Ajouter un message</a>
        <a data-act="reset"><i class="fa-solid fa-rotate-left"></i> Remettre à 1</a>
      </div>
      <div class="swrc-sub" style="text-align:right;margin-bottom:0">v${VERSION}</div>
    </div>
  `;
  document.body.appendChild(panel);

  const $ = (sel) => panel.querySelector(sel);
  const countEl = $(".swrc-count");
  const bannerEl = $(".swrc-banner");
  const nextEl = $(".swrc-next");
  const settingsEl = $(".swrc-settings");

  // --- Rendu -----------------------------------------------------------
  const renderCount = () => { countEl.textContent = state.round; };
  const renderLabel = () => { $(".swrc-label").textContent = state.label ?? ""; };
  const renderPlayersBtn = () => {
    const a = $('[data-act="players"]');
    a.innerHTML = `<i class="fa-solid ${state.playersView ? "fa-eye" : "fa-eye-slash"}"></i>`;
    a.classList.toggle("swrc-off", !state.playersView);
    a.title = state.playersView
      ? "Visible des joueurs — cliquer pour masquer"
      : "Masqué aux joueurs — cliquer pour afficher";
  };
  const renderNext = () => {
    const n = nextDue();
    nextEl.textContent = n
      ? `Prochain message : round ${n.r}${n.r === state.round + 1 ? " (au prochain clic)" : ""}`
      : "";
    nextEl.hidden = !n;
  };
  const showBanner = (msgs) => {
    if (!msgs.length) { bannerEl.hidden = true; bannerEl.innerHTML = ""; return; }
    bannerEl.innerHTML = msgs.map((m) => isPublic(m)
      ? `<div><i class="fa-solid fa-users" title="Visible des joueurs"></i>${esc(m.text)}</div>`
      : `<div><i class="fa-solid fa-user-secret" title="MJ uniquement"></i>${esc(m.text)}</div>`).join("");
    bannerEl.hidden = false;
    flash(bannerEl);
  };

  const DEST_OPTS = [
    ["gm", "MJ — bandeau"],
    ["gm-chat", "MJ — bandeau + chat"],
    ["all", "Tous — bandeau"],
    ["all-chat", "Tous — bandeau + chat"]
  ];
  const renderMessages = () => {
    const list = $(".swrc-msglist");
    list.innerHTML = state.messages.length
      ? state.messages.map((m) => `
        <div class="swrc-msg" data-id="${m.id}">
          <label title="Round de déclenchement">R<input type="number" min="0" data-f="round" value="${Number(m.round) || 0}"></label>
          <label title="Répéter tous les N rounds (0 = une seule fois)">↻<input type="number" min="0" data-f="every" value="${Number(m.every) || 0}"></label>
          <select data-f="dest" title="Qui voit le message">
            ${DEST_OPTS.map(([v, l]) => `<option value="${v}" ${m.dest === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
          <a data-act="delmsg" title="Supprimer"><i class="fa-solid fa-trash"></i></a>
          <input type="text" data-f="text" value="${esc(m.text)}" placeholder="Texte du message…">
        </div>`).join("")
      : `<p class="swrc-empty">Aucun message programmé.</p>`;
  };
  const renderSettingsFields = () => {
    $('[data-f="label"]').value = state.label ?? "";
    $('[data-f="logChat"]').checked = !!state.logChat;
  };

  // --- Actions ---------------------------------------------------------
  const setRound = (v) => {
    state.round = Math.max(0, Math.trunc(v));
    state.pubBanner = null;
    renderCount();
    showBanner([]);
    renderNext();
    save();
  };

  const advance = () => {
    state.round += 1;
    const fired = state.messages.filter((m) => isDue(m, state.round));
    const pubTexts = fired.filter(isPublic).map((m) => m.text);
    state.pubBanner = pubTexts.length ? { texts: pubTexts, stamp: Date.now() } : null;

    renderCount();
    showBanner(fired);
    renderNext();
    save();

    if (state.logChat) {
      postChat(`<strong>Round ${state.round}</strong>${state.label ? ` — <em>${esc(state.label)}</em>` : ""}`, "gm");
    }
    for (const m of fired) {
      ui.notifications.info(`Round ${state.round} : ${m.text}`);
      if (String(m.dest).endsWith("chat")) {
        postChat(`<strong>Round ${state.round}</strong> — ${esc(m.text)}`, isPublic(m) ? "all" : "gm");
      }
    }
  };

  const close = () => {
    open = false;
    save(true);
    panel.remove();
    document.getElementById(STYLE_ID)?.remove();
  };
  panel.addEventListener("swrc-close", close);

  panel.addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-act]");
    if (!a) return;
    ev.preventDefault();
    switch (a.dataset.act) {
      case "plus": advance(); break;
      case "minus": setRound(state.round - 1); break;
      case "close": close(); break;
      case "invite": invitePlayers(); break;
      case "players":
        state.playersView = !state.playersView;
        renderPlayersBtn();
        save(true);
        break;
      case "settings":
        settingsEl.hidden = !settingsEl.hidden;
        if (!settingsEl.hidden) { renderSettingsFields(); renderMessages(); }
        keepInView(panel);
        break;
      case "reset":
        if (await confirmReset()) setRound(1);
        break;
      case "addmsg":
        state.messages.push({ id: foundry.utils.randomID(), round: state.round + 1, every: 0, text: "", dest: "gm" });
        renderMessages();
        renderNext();
        save();
        panel.querySelector(".swrc-msg:last-child input[type=text]")?.focus();
        break;
      case "delmsg": {
        const id = a.closest(".swrc-msg")?.dataset.id;
        state.messages = state.messages.filter((m) => m.id !== id);
        renderMessages();
        renderNext();
        save();
        break;
      }
    }
  });

  // Champs des réglages
  const onField = (ev) => {
    const el = ev.target;
    const f = el.dataset?.f;
    if (!f) return;
    const row = el.closest(".swrc-msg");
    if (row) {
      const m = state.messages.find((x) => x.id === row.dataset.id);
      if (!m) return;
      m[f] = (f === "round" || f === "every") ? Math.max(0, parseInt(el.value) || 0) : el.value;
      renderNext();
    } else if (f === "label") {
      state.label = el.value;
      renderLabel();
    } else if (f === "logChat") {
      state.logChat = el.checked;
    }
    save();
  };
  panel.addEventListener("input", onField);
  panel.addEventListener("change", onField);

  // Double-clic sur le nombre : saisie directe (ne déclenche pas les messages)
  countEl.addEventListener("dblclick", () => {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = state.round;
    input.className = "swrc-countinput";
    countEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (ok) => {
      if (done) return;
      done = true;
      input.replaceWith(countEl);
      const v = parseInt(input.value);
      if (ok && !isNaN(v)) setRound(v);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commit(true);
      else if (e.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
  });

  // Déplacement
  makeDraggable(panel, $(".swrc-handle"), (p) => { state.pos = p; save(); });

  // --- Initialisation --------------------------------------------------
  if (state.pos) { applyPos(panel, state.pos); keepInView(panel); }
  renderCount();
  renderLabel();
  renderPlayersBtn();
  renderNext();
  save(true); // publie l'état "visible" aux joueurs dès l'ouverture
})();