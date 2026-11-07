/**
 * ETU-relations — v0.2.2
 *
 * Relations réciproques PJ ↔ PNJ pour SWADE.
 * Onglet « Relations » :
 *   - sur la fiche de PJ (type "character") : joueur propriétaire + MJ ;
 *   - sur la fiche de PNJ (type "npc") : MJ uniquement.
 *
 * Chaque lien a deux niveaux de Réaction indépendants :
 *   - PJ → PNJ : stocké sur le PJ
 *       flags.etu-relations.contacts.<cid> = { name, uuid, img, level, romance, playerNote, created }
 *       flags.etu-relations.gmNotes.<cid>  = "note MJ" (partagée par les deux côtés du lien)
 *   - PNJ → PJ : stocké sur l'acteur PNJ de base (pas sur le jeton)
 *       flags.etu-relations.attitudes.<pjActorId> = { level, romance }
 *
 * La liste d'un PNJ est déduite des PJ qui l'ont dans leurs contacts :
 * aucune synchronisation n'est nécessaire, le lien existe dès que le joueur ajoute le PNJ.
 */

const MOD = "etu-relations";
const TAB = "etu-relations";

/** Échelle des Réactions (SWADE VF p. 33). Premier contact = Neutre. */
const LEVELS = [
  { value: -2, label: "Hostile" },
  { value: -1, label: "Inamical" },
  { value: 0, label: "Neutre" },
  { value: 1, label: "Amical" },
  { value: 2, label: "Coopératif" },
  { value: 3, label: "Serviable" }
];
const MIN_LEVEL = Math.min(...LEVELS.map(l => l.value));
const MAX_LEVEL = Math.max(...LEVELS.map(l => l.value));
const DEFAULT_LEVEL = 0;

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]
  ));
}

function clampLevel(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, n));
}

function levelLabel(v) {
  return LEVELS.find(l => l.value === v)?.label ?? "Neutre";
}

/** Acteur de base (jeton non lié → acteur du répertoire). */
function baseActor(actor) {
  if (!actor) return null;
  if (actor.isToken) return actor.token?.baseActor ?? game.actors.get(actor.id) ?? actor;
  return actor;
}

/** Acteur du monde correspondant à un uuid, ou null (compendium, supprimé…). */
function resolveActor(uuid) {
  if (!uuid) return null;
  let doc = null;
  try { doc = fromUuidSync(uuid, { strict: false }); } catch { /* ignore */ }
  return doc instanceof Actor ? baseActor(doc) : null;
}

function getContacts(pj) {
  const raw = pj.getFlag(MOD, "contacts") ?? {};
  return Object.entries(raw)
    .filter(([, c]) => c && typeof c === "object")
    .map(([id, c]) => ({ id, ...c, level: clampLevel(c.level), romance: !!c.romance }))
    .sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
}

/** Attitude du PNJ envers un PJ (Neutre par défaut). */
function getAttitude(npc, pjId) {
  const a = npc?.getFlag(MOD, `attitudes.${pjId}`) ?? {};
  return { level: clampLevel(a.level ?? DEFAULT_LEVEL), romance: !!a.romance };
}

function getGmNote(pj, cid) {
  return game.user.isGM ? (pj.getFlag(MOD, `gmNotes.${cid}`) ?? "") : "";
}

/** Liens affichés sur la fiche d'un PJ. */
function linksForPj(pj) {
  return getContacts(pj).map(contact => {
    const other = resolveActor(contact.uuid);
    return { pj, contact, other, npc: other?.type === "npc" ? other : null };
  });
}

/** Liens affichés sur la fiche d'un PNJ : tous les PJ qui l'ont dans leurs contacts. */
function linksForNpc(npc) {
  return game.actors
    .filter(a => a.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .flatMap(pj => getContacts(pj)
      .filter(c => c.uuid === npc.uuid)
      .map(contact => ({ pj, contact, other: npc, npc })));
}

/* ------------------------------------------------------------------ */
/*  Écritures                                                          */
/* ------------------------------------------------------------------ */

async function addContact(pj, { name, uuid = null, img = null }) {
  name = (name ?? "").trim();
  if (!name) return;
  const existing = getContacts(pj);
  const dup = uuid
    ? existing.some(c => c.uuid === uuid)
    : existing.some(c => !c.uuid && c.name.toLowerCase() === name.toLowerCase());
  if (dup) return ui.notifications.info(`${name} figure déjà dans les relations de ${pj.name}.`);
  const id = foundry.utils.randomID();
  await pj.setFlag(MOD, `contacts.${id}`, {
    name, uuid, img,
    level: DEFAULT_LEVEL,
    romance: false,
    playerNote: "",
    created: Date.now()
  });
}

async function removeContact(pj, contact, otherName) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const ok = await DialogV2.confirm({
    window: { title: "Retirer une relation" },
    content: `<p>Retirer la relation entre <strong>${esc(pj.name)}</strong> et <strong>${esc(otherName)}</strong> ?</p>`,
    rejectClose: false
  });
  if (!ok) return;
  await pj.unsetFlag(MOD, `contacts.${contact.id}`);
  if (pj.getFlag(MOD, `gmNotes.${contact.id}`) !== undefined) {
    await pj.unsetFlag(MOD, `gmNotes.${contact.id}`);
  }
  // L'attitude du PNJ est conservée : si le lien est recréé, elle est retrouvée.
}

/* ------------------------------------------------------------------ */
/*  Rendu HTML                                                         */
/* ------------------------------------------------------------------ */

function buildBar(level) {
  const negSteps = -MIN_LEVEL;
  const posSteps = MAX_LEVEL;
  const neg = level < 0 ? (-level / negSteps) * 100 : 0;
  const pos = level > 0 ? (level / posSteps) * 100 : 0;
  // Chaque cran a la même largeur : chaque moitié est proportionnelle à son nombre de crans.
  return `
      <div class="er-bar">
        <div class="er-half er-neg" style="flex:${negSteps};--er-steps:${negSteps}"><div class="er-fill" style="width:${neg}%"></div></div>
        <div class="er-mid"></div>
        <div class="er-half er-pos" style="flex:${posSteps};--er-steps:${posSteps}"><div class="er-fill" style="width:${pos}%"></div></div>
      </div>`;
}

/**
 * Une carte par lien, sur une seule ligne : portrait | nom ♥ | barre | badge | corbeille.
 * Chaque fiche n'affiche que SON côté du lien :
 *   - fiche de PJ  → attitude du PJ envers le PNJ ;
 *   - fiche de PNJ → attitude du PNJ envers le PJ.
 */
function buildCard(link, ctx) {
  const { pj, contact: c, other, npc } = link;

  // L'autre partie du lien (affichée dans la carte)
  const head = ctx.mode === "pj"
    ? { name: other?.name ?? c.name, img: other?.img ?? c.img, uuid: c.uuid }
    : { name: pj.name, img: pj.img, uuid: pj.uuid };

  // Le côté du lien propre à cette fiche
  const side = ctx.mode;
  const rel = side === "pj"
    ? { level: c.level, romance: c.romance }
    : getAttitude(npc, pj.id);
  const lvl = clampLevel(rel.level);

  const canEditPj = ctx.mode === "pj" ? ctx.canEdit : ctx.isGM;
  const portrait = head.img
    ? `<img class="er-portrait" src="${esc(head.img)}" alt="">`
    : `<div class="er-portrait er-noimg"><i class="fa-solid fa-user"></i></div>`;
  const nameHtml = head.uuid
    ? `<a class="er-name" data-er-action="open" data-tooltip="Ouvrir la fiche">${esc(head.name)}</a>`
    : `<span class="er-name">${esc(head.name)}</span>`;
  const heart = rel.romance
    ? `<i class="fa-solid fa-heart er-heart" data-tooltip="Relation amoureuse"></i>` : "";
  const del = canEditPj
    ? `<button type="button" class="er-icon" data-er-action="delete" data-tooltip="Retirer la relation"><i class="fa-solid fa-trash"></i></button>` : "";
  const controls = ctx.isGM ? `
    <div class="er-gm-row">
      <div class="er-levels">
        ${LEVELS.map(l => `<button type="button" class="er-level er-l${l.value}${l.value === lvl ? " active" : ""}" data-er-action="level" data-side="${side}" data-level="${l.value}">${l.label}</button>`).join("")}
      </div>
      <label class="er-romance"><input type="checkbox" class="er-checkbox" data-er-field="romance" data-side="${side}"${rel.romance ? " checked" : ""}> Relation amoureuse</label>
    </div>` : "";
  const gmNote = ctx.isGM ? `
      <div class="er-note er-gmnote">
        <label><i class="fa-solid fa-eye-slash"></i> Note du MJ (invisible pour le joueur)</label>
        <textarea data-er-field="gmNote" rows="2">${esc(getGmNote(pj, c.id))}</textarea>
      </div>` : "";

  return `
  <div class="er-card" data-pj-id="${esc(pj.id)}" data-contact-id="${esc(c.id)}" data-npc-uuid="${esc(npc?.uuid ?? "")}" data-head-uuid="${esc(head.uuid ?? "")}">
    <div class="er-head">
      ${portrait}
      <span class="er-who">${nameHtml}${heart}</span>
      ${buildBar(lvl)}
      <span class="er-badge er-l${lvl}">${esc(levelLabel(lvl))}</span>
      ${del}
    </div>
    ${controls}
    <div class="er-notes">
      <div class="er-note">
        <label>Note du joueur</label>
        <textarea data-er-field="playerNote" rows="2"${canEditPj ? "" : " readonly"}>${esc(c.playerNote ?? "")}</textarea>
      </div>
      ${gmNote}
    </div>
  </div>`;
}

function buildPanel(actor, ctx) {
  const links = ctx.mode === "pj" ? linksForPj(actor) : linksForNpc(actor);
  let add = "";
  if (ctx.mode === "pj" && ctx.canEdit) {
    add = `
    <div class="er-add">
      <div class="er-drop"><i class="fa-solid fa-user-plus"></i> Glissez un PNJ ici…</div>
      <div class="er-add-row">
        <input type="text" class="er-new-name" placeholder="… ou saisissez le nom d'un PNJ">
        <button type="button" data-er-action="add"><i class="fa-solid fa-plus"></i> Ajouter</button>
      </div>
    </div>`;
  } else if (ctx.mode === "npc") {
    add = `
    <div class="er-add">
      <div class="er-drop"><i class="fa-solid fa-user-plus"></i> Glissez un PJ ici pour créer la relation</div>
    </div>`;
  }
  const empty = ctx.mode === "pj"
    ? "Aucune relation enregistrée."
    : "Aucun PJ n'a encore de relation avec ce PNJ.";
  const list = links.length
    ? links.map(l => buildCard(l, ctx)).join("")
    : `<p class="er-empty">${empty}</p>`;
  return `<div class="er-wrap">${add}<div class="er-list">${list}</div></div>`;
}

/* ------------------------------------------------------------------ */
/*  Événements                                                         */
/* ------------------------------------------------------------------ */

function linkFromEl(el) {
  const card = el.closest("[data-contact-id]");
  if (!card) return null;
  const pj = game.actors.get(card.dataset.pjId);
  const contact = pj ? getContacts(pj).find(c => c.id === card.dataset.contactId) : null;
  if (!contact) return null;
  const npc = card.dataset.npcUuid ? resolveActor(card.dataset.npcUuid) : null;
  return { card, pj, contact, npc };
}

async function addFromInput(pj, panel) {
  const input = panel.querySelector(".er-new-name");
  const name = input?.value.trim();
  if (!name) return ui.notifications.info("Saisissez un nom de PNJ.");
  await addContact(pj, { name });
}

async function onDrop(ev, actor, panel, ctx) {
  ev.preventDefault();
  ev.stopPropagation();
  panel.classList.remove("er-dragover");
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  const data = TE.getDragEventData(ev);
  if (data?.type !== "Actor" || !data.uuid) {
    return ui.notifications.warn("Seuls les acteurs peuvent être déposés dans les relations.");
  }
  const dropped = baseActor(await fromUuid(data.uuid));
  if (!dropped) return;
  if (dropped.uuid === actor.uuid) {
    return ui.notifications.warn("Un personnage ne peut pas être en relation avec lui-même.");
  }
  if (ctx.mode === "pj") {
    await addContact(actor, { name: dropped.name, uuid: dropped.uuid, img: dropped.img });
  } else {
    if (dropped.type !== "character") {
      return ui.notifications.warn("Sur la fiche d'un PNJ, déposez un personnage joueur.");
    }
    await addContact(dropped, { name: actor.name, uuid: actor.uuid, img: actor.img });
  }
}

async function onClick(ev, actor, panel, ctx) {
  const btn = ev.target.closest("[data-er-action]");
  if (!btn || !panel.contains(btn)) return;
  ev.preventDefault();
  ev.stopPropagation();

  const action = btn.dataset.erAction;
  if (action === "add") {
    if (ctx.mode === "pj" && ctx.canEdit) await addFromInput(actor, panel);
    return;
  }

  const link = linkFromEl(btn);
  if (!link) return;
  const { pj, contact, npc, card } = link;

  switch (action) {
    case "level": {
      if (!ctx.isGM) return;
      const lvl = clampLevel(btn.dataset.level);
      if (btn.dataset.side === "pj") {
        if (lvl !== contact.level) await pj.setFlag(MOD, `contacts.${contact.id}.level`, lvl);
      } else if (npc) {
        if (lvl !== getAttitude(npc, pj.id).level) await npc.setFlag(MOD, `attitudes.${pj.id}.level`, lvl);
      }
      break;
    }
    case "delete": {
      const canEditPj = ctx.mode === "pj" ? ctx.canEdit : ctx.isGM;
      if (canEditPj) await removeContact(pj, contact, npc?.name ?? contact.name);
      break;
    }
    case "open": {
      const uuid = card.dataset.headUuid;
      if (!uuid) return;
      const doc = await fromUuid(uuid);
      if (!doc) return ui.notifications.warn("Cet acteur n'existe plus.");
      if (!doc.testUserPermission(game.user, "LIMITED")) {
        return ui.notifications.warn("Vous n'avez pas accès à cette fiche.");
      }
      doc.sheet.render(true);
      break;
    }
  }
}

async function onChange(ev, actor, panel, ctx) {
  // Empêche la soumission automatique du formulaire de la fiche.
  ev.stopPropagation();
  const el = ev.target.closest("[data-er-field]");
  if (!el) return;
  const link = linkFromEl(el);
  if (!link) return;
  const { pj, contact, npc } = link;
  const canEditPj = ctx.mode === "pj" ? ctx.canEdit : ctx.isGM;

  switch (el.dataset.erField) {
    case "playerNote":
      if (canEditPj) await pj.setFlag(MOD, `contacts.${contact.id}.playerNote`, el.value);
      break;
    case "gmNote":
      if (ctx.isGM) await pj.setFlag(MOD, `gmNotes.${contact.id}`, el.value);
      break;
    case "romance":
      if (!ctx.isGM) return;
      if (el.dataset.side === "pj") await pj.setFlag(MOD, `contacts.${contact.id}.romance`, el.checked);
      else if (npc) await npc.setFlag(MOD, `attitudes.${pj.id}.romance`, el.checked);
      break;
  }
}

function bindPanel(actor, panel, ctx) {
  const canDrop = ctx.mode === "pj" ? ctx.canEdit : ctx.isGM;
  if (canDrop) {
    panel.addEventListener("dragover", ev => { ev.preventDefault(); panel.classList.add("er-dragover"); });
    panel.addEventListener("dragleave", ev => {
      if (!panel.contains(ev.relatedTarget)) panel.classList.remove("er-dragover");
    });
    panel.addEventListener("drop", ev => onDrop(ev, actor, panel, ctx));
  }
  panel.addEventListener("click", ev => onClick(ev, actor, panel, ctx));
  panel.addEventListener("change", ev => onChange(ev, actor, panel, ctx));
  panel.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && ev.target.matches(".er-new-name")) {
      ev.preventDefault();
      ev.stopPropagation();
      addFromInput(actor, panel);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Injection de l'onglet dans la fiche                                */
/* ------------------------------------------------------------------ */

let diagnosticShown = false;

function getRoot(app, html) {
  const el = app.element;
  if (el instanceof HTMLElement) return el;
  if (el?.[0] instanceof HTMLElement) return el[0];
  if (html instanceof HTMLElement) return html;
  return html?.[0] ?? null;
}

/** Repère la barre d'onglets principale et un panneau de référence, quelle que soit la version de la fiche. */
function findTabStructure(root) {
  const navs = [...root.querySelectorAll("nav, .tabs, .sheet-tabs")]
    .filter(n => !n.closest(".tab") && n.querySelector("[data-tab]"));
  for (const nav of navs) {
    const items = [...nav.querySelectorAll("[data-tab]")]
      .filter(i => i.dataset.tab !== TAB && !i.classList.contains("tab"));
    for (const refItem of items) {
      const tab = CSS.escape(refItem.dataset.tab);
      const group = refItem.dataset.group ?? nav.dataset.group ?? null;
      const refPanel =
        (group && root.querySelector(`.tab[data-tab="${tab}"][data-group="${CSS.escape(group)}"]`))
        || root.querySelector(`.tab[data-tab="${tab}"]`);
      if (refPanel && !nav.contains(refPanel)) {
        return { refItem, refPanel, group: group ?? refPanel.dataset.group ?? "primary" };
      }
    }
  }
  return null;
}

function isActive(app, group) {
  if (app.tabGroups?.[group] === TAB) return true;
  return Array.isArray(app._tabs) && app._tabs.some(t => t.active === TAB);
}

function activate(app, { item, panel, group }) {
  // AppV2
  if (typeof app.changeTab === "function" && app.tabGroups) {
    try { app.changeTab(TAB, group, { force: true }); } catch (e) { console.debug(`${MOD} | changeTab`, e); }
  }
  // AppV1
  else if (Array.isArray(app._tabs) && app._tabs.length) {
    const tabs = app._tabs.find(t => t.group === group) ?? app._tabs[0];
    try { tabs.activate(TAB); } catch (e) { console.debug(`${MOD} | Tabs.activate`, e); }
  }
  // Filet de sécurité : bascule manuelle des classes
  for (const el of item.parentElement.querySelectorAll(":scope > [data-tab]")) {
    el.classList.toggle("active", el === item);
  }
  for (const el of panel.parentElement.querySelectorAll(":scope > .tab")) {
    if (panel.dataset.group && el.dataset.group && el.dataset.group !== panel.dataset.group) continue;
    el.classList.toggle("active", el === panel);
  }
  if (app.tabGroups) app.tabGroups[group] = TAB;
}

function showDiagnostic(app, root) {
  if (diagnosticShown) return;
  diagnosticShown = true;
  console.warn(`${MOD} | Onglets introuvables sur ${app.constructor.name}. Copiez ceci pour le diagnostic :`, {
    navs: [...root.querySelectorAll("nav, .tabs, .sheet-tabs")].map(n => n.outerHTML.slice(0, 500)),
    dataTab: [...root.querySelectorAll("[data-tab]")].map(e =>
      `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} tab=${e.dataset.tab} group=${e.dataset.group}`)
  });
}

function inject(app, html) {
  const sheetActor = app.document ?? app.actor ?? app.object;
  if (!(sheetActor instanceof Actor)) return;
  let mode = null;
  if (sheetActor.type === "character") mode = "pj";
  else if (sheetActor.type === "npc" && game.user.isGM) mode = "npc";
  if (!mode) return;

  const actor = baseActor(sheetActor);
  const root = getRoot(app, html);
  if (!root) return;

  root.querySelectorAll(`[data-tab="${TAB}"]`).forEach(e => e.remove());
  const s = findTabStructure(root);
  if (!s) return showDiagnostic(app, root);

  const ctx = {
    mode,
    isGM: game.user.isGM,
    canEdit: !!(app.isEditable ?? actor.isOwner)
  };

  // Bouton d'onglet : clone d'un onglet existant pour hériter du style de la fiche
  const item = s.refItem.cloneNode(false);
  item.removeAttribute("id");
  item.removeAttribute("aria-selected");
  item.classList.remove("active");
  item.dataset.tab = TAB;
  item.dataset.tooltip = "Relations";
  item.setAttribute("aria-label", "Relations");
  const iconOnly = s.refItem.textContent.trim() === "";
  item.innerHTML = iconOnly
    ? `<i class="fa-solid fa-handshake"></i>`
    : `<i class="fa-solid fa-handshake"></i> Relations`;
  s.refItem.parentElement.append(item);

  // Panneau
  const panel = s.refPanel.cloneNode(false);
  panel.removeAttribute("id");
  panel.removeAttribute("data-application-part");
  panel.className = "tab etu-relations" + (s.refPanel.classList.contains("scrollable") ? " scrollable" : "");
  panel.dataset.tab = TAB;
  panel.innerHTML = buildPanel(actor, ctx);
  s.refPanel.parentElement.append(panel);

  const tabCtx = { item, panel, group: s.group };
  item.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    activate(app, tabCtx);
  });
  bindPanel(actor, panel, ctx);

  if (isActive(app, s.group)) activate(app, tabCtx);
}

/* ------------------------------------------------------------------ */
/*  Rafraîchissement croisé PJ ↔ PNJ                                   */
/* ------------------------------------------------------------------ */

/** Re-rend les fiches PJ/PNJ ouvertes (sauf celle de l'acteur modifié, déjà re-rendue par Foundry). */
function refreshSheets(except = null) {
  const apps = new Set([
    ...(foundry.applications?.instances?.values?.() ?? []),
    ...Object.values(ui.windows ?? {})
  ]);
  for (const app of apps) {
    const a = app.document ?? app.actor;
    if (!(a instanceof Actor) || !app.rendered) continue;
    if (!["character", "npc"].includes(a.type)) continue;
    if (except && a === except) continue;
    app.render();
  }
}

Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, `flags.${MOD}`)) return;
  refreshSheets(actor);
});

/* ------------------------------------------------------------------ */
/*  Initialisation                                                     */
/* ------------------------------------------------------------------ */

Hooks.on("renderApplicationV2", inject); // fiches AppV2
Hooks.on("renderActorSheet", inject);    // fiches AppV1 (au cas où)

Hooks.once("ready", async () => {
  const mod = game.modules.get(MOD);
  if (mod) mod.api = { getContacts, getAttitude, linksForPj, linksForNpc, LEVELS, levelLabel };

  // Migration unique des données de la v0.1 (module « swade-relations »)
  if (!game.user.isGM) return;
  for (const a of game.actors) {
    const old = a.flags?.["swade-relations"];
    if (!old || a.flags?.[MOD]) continue;
    await a.update({ [`flags.${MOD}`]: foundry.utils.deepClone(old) });
    console.log(`${MOD} | Données v0.1 migrées pour ${a.name}`);
  }
});
