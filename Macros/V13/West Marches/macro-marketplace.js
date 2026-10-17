/**
 * ============================================================================
 *  BOUTIQUE DE FERREMONT — v1.0.2
 *  Foundry VTT v13/v14 · système SWADE 5.x/6.x
 * ----------------------------------------------------------------------------
 *  Achats des personnages à partir d'une liste de prix CSV :
 *   - catalogue en 3 onglets (Équipement / Animaux / Armes & armures) ;
 *   - recherche, tri, filtre des articles inaccessibles au rang du personnage ;
 *   - panier persistant (par personnage, dans le navigateur) ;
 *   - validation si la bourse le permet, débit de la bourse ;
 *   - récapitulatif dans le chat (public ou MJ). Rien n'est ajouté à l'inventaire.
 *
 *  Le fichier de prix doit être déposé dans les données utilisateur de Foundry
 *  (Data/…), au chemin indiqué par SHOP.priceFile ci-dessous.
 * ============================================================================
 */

const SHOP = {
  version: "1.0.2",
  // Chemin relatif au dossier Data de Foundry (téléversable via le Navigateur de fichiers)
  priceFile: "West Marches/Ferremont/ferremont-prix.csv",
  // Champ de la bourse sur la fiche SWADE
  currencyPath: "system.details.currency",
  // Monnaie de la campagne (alignée sur la macro Temps libre : « Silver Coin ($) »)
  currencyName: "Silver Coin",
  currencyLabel: "$",
  // true : la bourse du personnage est débitée à la validation
  debitFunds: true,
  // "public" : visible de tous · "gm" : chuchoté au MJ (et à l'acheteur)
  chatVisibility: "public",
  maxQty: 99,
  categories: [
    { id: "equipement",    label: "Équipement",      icon: "fa-solid fa-toolbox" },
    { id: "animaux",       label: "Animaux",         icon: "fa-solid fa-horse" },
    { id: "armes-armures", label: "Armes & armures", icon: "fa-solid fa-shield-halved" }
  ],
  // Rangs SWADE (seuils en nombre de progressions)
  ranks: [
    { min: 16, label: "Légendaire" },
    { min: 12, label: "Héroïque" },
    { min: 8,  label: "Vétéran" },
    { min: 4,  label: "Aguerri" },
    { min: 0,  label: "Novice" }
  ]
};

/* ------------------------------------------------------------------------- */
/*  Utilitaires                                                              */
/* ------------------------------------------------------------------------- */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const NUM_FMT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (n) => `${NUM_FMT.format(Math.round((Number(n) || 0) * 100) / 100)} ${SHOP.currencyLabel}`;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseNumber(raw) {
  const s = String(raw ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const normKey = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Découpe « Hache (1 main, Dg d6) » en { main: "Hache", detail: "1 main, Dg d6" } */
function splitName(name) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
  return m && m[1] ? { main: m[1], detail: m[2] } : { main: name, detail: "" };
}

/** Nombre de progressions du personnage (modes « expanded » et « legacy » de SWADE) */
function getAdvances(actor) {
  const adv = actor?.system?.advances;
  if (!adv) return 0;
  const list = adv.list;
  if (list && typeof list.size === "number" && (adv.mode ?? "expanded") !== "legacy") return list.size;
  if (Array.isArray(list) && (adv.mode ?? "expanded") !== "legacy") return list.length;
  return Number(adv.value) || 0;
}

const rankLabel = (advances) => SHOP.ranks.find((r) => advances >= r.min)?.label ?? "Novice";

/** Niveau requis : 1 = accessible à tous ; N > 1 = N progressions minimum (4 = Aguerri, 8 = Vétéran…) */
const requiredAdvances = (level) => (Number(level) <= 1 ? 0 : Number(level));
const levelLabel = (level) => {
  const req = requiredAdvances(level);
  return req === 0 ? "Novice" : `${req} progressions (${rankLabel(req)})`;
};

function getFunds(actor) {
  const v = foundry.utils.getProperty(actor, SHOP.currencyPath);
  return v === undefined || v === null ? null : (Number(v) || 0);
}

/* ------------------------------------------------------------------------- */
/*  Lecture du CSV                                                           */
/* ------------------------------------------------------------------------- */

function parseCSV(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) return [];

  const header = lines[0];
  const delim = [";", "\t", ","]
    .map((d) => [d, header.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const split = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"' && cur.trim() === "") { q = true; cur = ""; }
      else if (c === delim) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const cols = split(header).map(normKey);
  const idx = (names, fallback) => {
    const i = cols.findIndex((c) => names.includes(c));
    return i >= 0 ? i : fallback;
  };
  const iCat = idx(["categorie", "category"], 0);
  const iGrp = idx(["groupe", "group", "sous-categorie"], 1);
  const iName = idx(["nom", "name", "item name", "article"], 2);
  const iPrice = idx(["prix", "price", "silver coin", "cout"], 3);
  const iLvl = idx(["niveau", "level", "level req", "rang"], 4);

  const knownCats = new Set(SHOP.categories.map((c) => c.id));
  const items = []; const seen = new Set(); const errors = [];

  lines.slice(1).forEach((line, n) => {
    const f = split(line);
    const category = normKey(f[iCat]);
    const name = f[iName];
    const price = parseNumber(f[iPrice]);
    const level = Math.max(1, Math.trunc(parseNumber(f[iLvl])) || 1);
    if (!name || !knownCats.has(category) || !Number.isFinite(price)) {
      errors.push(`ligne ${n + 2} : « ${line} »`);
      return;
    }
    const id = `${category}|${name}`;
    if (seen.has(id)) return;            // doublon (ex. « Sac de couchage ») ignoré
    seen.add(id);
    items.push({ id, category, group: f[iGrp] || "", name, price, level, order: items.length });
  });

  if (errors.length) console.warn(`Boutique de Ferremont | ${errors.length} ligne(s) ignorée(s) :\n`, errors.join("\n"));
  return items;
}

async function loadCatalog() {
  const getRoute = foundry.utils.getRoute ?? globalThis.getRoute ?? ((p) => `/${p}`);
  // encodeURI : le chemin contient des espaces (« West Marches »)
  const url = `${encodeURI(getRoute(SHOP.priceFile))}?t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${SHOP.priceFile}`);
  return parseCSV(await res.text());
}

/* ------------------------------------------------------------------------- */
/*  Choix des acheteurs possibles                                            */
/* ------------------------------------------------------------------------- */

function candidateActors() {
  const isPC = (a) => a?.type === "character";
  const list = game.user.isGM
    ? game.actors.filter((a) => isPC(a) && a.hasPlayerOwner)
    : game.actors.filter((a) => isPC(a) && a.isOwner);
  for (const t of canvas?.tokens?.controlled ?? []) {
    const a = t.actor;
    if (a && (game.user.isGM || a.isOwner) && !list.includes(a)) list.push(a);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function defaultActor(list) {
  const tokenActor = canvas?.tokens?.controlled?.map((t) => t.actor).find((a) => list.includes(a));
  return tokenActor ?? (list.includes(game.user.character) ? game.user.character : list[0]);
}

/* ------------------------------------------------------------------------- */
/*  Styles (fenêtre)                                                         */
/* ------------------------------------------------------------------------- */

const STYLE = `
<style>
#ferremont-shop .window-content { padding: 0; overflow: hidden; }
#ferremont-shop .fs-root {
  --fs-gold: #c9a227; --fs-red: #c0392b; --fs-green: #3d8b4f;
  --fs-line: color-mix(in srgb, currentColor 14%, transparent);
  --fs-soft: color-mix(in srgb, currentColor 6%, transparent);
  --fs-hover: color-mix(in srgb, currentColor 10%, transparent);
  --fs-muted: color-mix(in srgb, currentColor 60%, transparent);
  display: grid; grid-template-columns: minmax(0, 1fr) 330px; height: 100%; font-size: 13px;
}
#ferremont-shop button { line-height: normal; }
#ferremont-shop .fs-catalog { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--fs-line); }

/* Onglets */
#ferremont-shop .fs-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid var(--fs-line); }
#ferremont-shop .fs-tab {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 6px; border: none; border-bottom: 3px solid transparent; border-radius: 6px 6px 0 0;
  background: transparent; color: inherit; cursor: pointer; font-weight: 600; opacity: .7; height: auto;
}
#ferremont-shop .fs-tab:hover { background: var(--fs-soft); opacity: 1; }
#ferremont-shop .fs-tab.active { opacity: 1; border-bottom-color: var(--fs-gold); background: var(--fs-soft); }
#ferremont-shop .fs-count { font-weight: 400; font-size: 11px; color: var(--fs-muted); }
#ferremont-shop .fs-badge {
  min-width: 18px; padding: 1px 5px; border-radius: 9px; background: var(--fs-gold); color: #1b1b1b;
  font-size: 10px; font-weight: 700; text-align: center;
}

/* Barre d'outils */
#ferremont-shop .fs-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 10px; border-bottom: 1px solid var(--fs-line); }
#ferremont-shop .fs-search { position: relative; flex: 1 1 200px; }
#ferremont-shop .fs-search i { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--fs-muted); pointer-events: none; }
#ferremont-shop .fs-search input { width: 100%; padding-left: 28px; height: 30px; }
#ferremont-shop .fs-toolbar select { height: 30px; width: auto; }
#ferremont-shop .fs-check { display: flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer; font-size: 12px; }
#ferremont-shop .fs-check input { margin: 0; }
#ferremont-shop .fs-gm { color: var(--fs-gold); }

/* Liste */
#ferremont-shop .fs-list { flex: 1; overflow-y: auto; padding: 4px 10px 12px; }
#ferremont-shop .fs-group { position: sticky; top: -4px; z-index: 1; padding: 8px 4px 4px; margin-top: 4px;
  font-style: italic; color: #666666; font-weight: 600; border-bottom: 1px solid var(--fs-line);
  background: var(--color-cool-5, var(--background, #e8e6dc)); backdrop-filter: blur(2px); }
#ferremont-shop .fs-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto 30px; align-items: center; gap: 10px;
  padding: 5px 4px 5px 8px; border-radius: 6px; cursor: default; user-select: none;
  border-left: 3px solid transparent;
}
#ferremont-shop .fs-row:hover { background: var(--fs-hover); }
#ferremont-shop .fs-row.incart { border-left-color: var(--fs-gold); }
#ferremont-shop .fs-row.locked { opacity: .45; }
#ferremont-shop .fs-name { min-width: 0; }
#ferremont-shop .fs-name strong { font-weight: 600; }
#ferremont-shop .fs-detail { display: block; font-size: 11px; color: var(--fs-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#ferremont-shop .fs-lock { font-size: 11px; color: var(--fs-red); white-space: nowrap; }
#ferremont-shop .fs-price { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; font-weight: 600; }
#ferremont-shop .fs-price.toodear { color: var(--fs-red); }
#ferremont-shop .fs-qtytag { font-size: 11px; font-weight: 700; color: var(--fs-gold); min-width: 22px; text-align: right; }
#ferremont-shop .fs-add {
  width: 28px; height: 28px; padding: 0; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid var(--fs-line); background: var(--fs-soft); color: inherit; cursor: pointer;
}
#ferremont-shop .fs-add:hover:not(:disabled) { background: var(--fs-gold); color: #1b1b1b; border-color: var(--fs-gold); }
#ferremont-shop .fs-add:disabled { cursor: not-allowed; }
#ferremont-shop .fs-empty { padding: 30px 10px; text-align: center; color: var(--fs-muted); }
#ferremont-shop .fs-empty i { display: block; font-size: 26px; margin-bottom: 8px; opacity: .6; }

/* Colonne de droite */
#ferremont-shop .fs-side { display: flex; flex-direction: column; min-height: 0; background: var(--fs-soft); }
#ferremont-shop .fs-buyer { display: flex; gap: 10px; align-items: center; padding: 12px; border-bottom: 1px solid var(--fs-line); }
#ferremont-shop .fs-buyer img { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; border: 1px solid var(--fs-line); flex: 0 0 52px; }
#ferremont-shop .fs-buyer-info { min-width: 0; flex: 1; }
#ferremont-shop .fs-buyer-name { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#ferremont-shop .fs-buyer select { width: 100%; height: 26px; font-weight: 700; }
#ferremont-shop .fs-buyer-rank { font-size: 11px; color: var(--fs-muted); margin-top: 2px; }
#ferremont-shop .fs-purse { text-align: right; }
#ferremont-shop .fs-purse small { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--fs-muted); }
#ferremont-shop .fs-purse span { font-size: 17px; font-weight: 700; color: var(--fs-gold); white-space: nowrap; }

#ferremont-shop .fs-cart-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 6px; }
#ferremont-shop .fs-cart-head span { font-weight: 700; font-size: 14px; }
#ferremont-shop .fs-link { background: none; border: none; padding: 0; width: auto; height: auto; color: var(--fs-muted); cursor: pointer; font-size: 12px; }
#ferremont-shop .fs-link:hover:not(:disabled) { color: var(--fs-red); text-decoration: underline; }
#ferremont-shop .fs-cart { flex: 1; overflow-y: auto; padding: 0 12px; }
#ferremont-shop .fs-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; padding: 8px 0; border-bottom: 1px dashed var(--fs-line); }
#ferremont-shop .fs-line.warn .fs-line-name { color: var(--fs-red); }
#ferremont-shop .fs-line-name { font-weight: 600; min-width: 0; }
#ferremont-shop .fs-line-name small { display: block; font-weight: 400; font-size: 11px; color: var(--fs-muted); }
#ferremont-shop .fs-line-total { text-align: right; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
#ferremont-shop .fs-line-ctrl { grid-column: 1 / -1; display: flex; align-items: center; gap: 4px; }
#ferremont-shop .fs-step { width: 24px; height: 24px; padding: 0; display: grid; place-items: center; border-radius: 5px; cursor: pointer; }
#ferremont-shop .fs-line-ctrl input { width: 44px; height: 24px; text-align: center; padding: 0; }
#ferremont-shop .fs-remove { margin-left: auto; width: 24px; height: 24px; padding: 0; border: none; background: none; color: var(--fs-muted); cursor: pointer; }
#ferremont-shop .fs-remove:hover { color: var(--fs-red); }

#ferremont-shop .fs-summary { padding: 10px 12px; border-top: 1px solid var(--fs-line); display: grid; gap: 3px; }
#ferremont-shop .fs-sumline { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
#ferremont-shop .fs-sumline.total { font-size: 15px; font-weight: 700; }
#ferremont-shop .fs-sumline.after.ok span:last-child { color: var(--fs-green); font-weight: 700; }
#ferremont-shop .fs-sumline.after.ko span:last-child { color: var(--fs-red); font-weight: 700; }
#ferremont-shop .fs-meter { height: 6px; border-radius: 3px; background: var(--fs-line); overflow: hidden; margin: 4px 0 2px; }
#ferremont-shop .fs-meter > div { height: 100%; background: var(--fs-gold); transition: width .2s; }
#ferremont-shop .fs-meter.ko > div { background: var(--fs-red); }
#ferremont-shop .fs-alert { font-size: 12px; color: var(--fs-red); }
#ferremont-shop .fs-validate {
  margin: 0 12px 12px; height: 38px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer;
  background: var(--fs-green); color: #fff; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; width: auto;
}
#ferremont-shop .fs-validate:hover:not(:disabled) { filter: brightness(1.1); }
#ferremont-shop .fs-validate:disabled { background: var(--fs-line); color: var(--fs-muted); cursor: not-allowed; }
#ferremont-shop .fs-hint { font-size: 11px; color: var(--fs-muted); text-align: center; padding: 0 12px 8px; }
</style>`;

/* ------------------------------------------------------------------------- */
/*  Application                                                              */
/* ------------------------------------------------------------------------- */

const { ApplicationV2, DialogV2 } = foundry.applications.api;

class FerremontShop extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ferremont-shop",
    tag: "div",
    window: { title: "Boutique de Ferremont", icon: "fa-solid fa-store", resizable: true },
    position: { width: 900, height: 660 }
  };

  constructor(catalog, actors, actor) {
    super();
    this.catalog = catalog;
    this.actors = actors;
    this.actor = actor;
    this.tab = SHOP.categories[0].id;
    this.search = "";
    this.sort = "list";
    this.hideLocked = false;
    this.ignoreRank = false;
    this.carts = new Map();
    this.byId = new Map(catalog.map((i) => [i.id, i]));
  }

  /* --- Panier (persistant par personnage dans le navigateur) ------------- */

  storageKey(actor = this.actor) { return `ferremont-shop.${game.world.id}.${actor.uuid}`; }

  cart(actor = this.actor) {
    if (!this.carts.has(actor.uuid)) {
      const map = new Map();
      try {
        const raw = JSON.parse(localStorage.getItem(this.storageKey(actor)) ?? "[]");
        for (const [id, q] of raw) if (this.byId.has(id) && q > 0) map.set(id, Math.min(q, SHOP.maxQty));
      } catch (e) { /* stockage indisponible : panier vierge */ }
      this.carts.set(actor.uuid, map);
    }
    return this.carts.get(actor.uuid);
  }

  saveCart() {
    try { localStorage.setItem(this.storageKey(), JSON.stringify([...this.cart()])); } catch (e) { /* ignoré */ }
  }

  setQty(id, qty) {
    const cart = this.cart();
    qty = Math.max(0, Math.min(SHOP.maxQty, Math.trunc(Number(qty)) || 0));
    if (qty === 0) cart.delete(id); else cart.set(id, qty);
    this.saveCart();
    this.refresh();
  }

  /* --- Calculs ----------------------------------------------------------- */

  get advances() { return getAdvances(this.actor); }
  get funds() { return getFunds(this.actor); }

  isLocked(item) {
    return !this.ignoreRank && this.advances < requiredAdvances(item.level);
  }

  cartLines() {
    return [...this.cart()].map(([id, qty]) => {
      const item = this.byId.get(id);
      return { item, qty, total: round2(item.price * qty) };
    });
  }

  cartTotal() { return round2(this.cartLines().reduce((s, l) => s + l.total, 0)); }

  matches(item) {
    if (!this.search) return true;
    const q = normKey(this.search);
    return normKey(item.name).includes(q) || normKey(item.group).includes(q);
  }

  visibleItems(category = this.tab) {
    let items = this.catalog.filter((i) => i.category === category && this.matches(i));
    if (this.hideLocked) items = items.filter((i) => !this.isLocked(i));
    const cmp = {
      list: (a, b) => a.order - b.order,
      name: (a, b) => a.name.localeCompare(b.name, "fr"),
      asc: (a, b) => a.price - b.price || a.name.localeCompare(b.name, "fr"),
      desc: (a, b) => b.price - a.price || a.name.localeCompare(b.name, "fr")
    }[this.sort];
    // Les groupes (Armures, Boucliers…) gardent leur ordre d'apparition dans le CSV
    const groupOrder = new Map();
    for (const i of this.catalog) if (!groupOrder.has(i.group)) groupOrder.set(i.group, groupOrder.size);
    return items.sort((a, b) => (groupOrder.get(a.group) - groupOrder.get(b.group)) || cmp(a, b));
  }

  /* --- Rendu ------------------------------------------------------------- */

  async _renderHTML() {
    const gmTools = game.user.isGM
      ? `<label class="fs-check fs-gm" title="Réservé au MJ : permet d'acheter des articles au-dessus du rang du personnage">
           <input type="checkbox" data-role="ignore-rank"> Ignorer le rang</label>`
      : "";
    return `${STYLE}
      <div class="fs-root">
        <section class="fs-catalog">
          <nav class="fs-tabs" data-role="tabs"></nav>
          <div class="fs-toolbar">
            <div class="fs-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" data-role="search" placeholder="Rechercher… (Entrée : ajouter le 1er résultat)" autocomplete="off">
            </div>
            <select data-role="sort" title="Trier">
              <option value="list">Ordre de la liste</option>
              <option value="name">Nom (A → Z)</option>
              <option value="asc">Prix croissant</option>
              <option value="desc">Prix décroissant</option>
            </select>
            <label class="fs-check" title="Masquer les articles au-dessus du rang du personnage">
              <input type="checkbox" data-role="hide-locked"> Masquer l'inaccessible</label>
            ${gmTools}
          </div>
          <div class="fs-list" data-role="list"></div>
        </section>
        <aside class="fs-side">
          <div class="fs-buyer" data-role="buyer"></div>
          <div class="fs-cart-head">
            <span><i class="fa-solid fa-basket-shopping"></i> Panier</span>
            <button type="button" class="fs-link" data-act="clear"><i class="fa-solid fa-trash-can"></i> Vider</button>
          </div>
          <div class="fs-cart" data-role="cart"></div>
          <div class="fs-summary" data-role="summary"></div>
          <button type="button" class="fs-validate" data-act="validate"><i class="fa-solid fa-coins"></i> Valider l'achat</button>
          <div class="fs-hint">Double-clic sur un article : ajout au panier</div>
        </aside>
      </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onFirstRender() {
    const el = this.element;

    el.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-act]");
      if (!t || t.disabled) return;
      const id = t.closest("[data-id]")?.dataset.id;
      switch (t.dataset.act) {
        case "tab": this.tab = t.dataset.tab; this.refresh(); break;
        case "add": this.setQty(id, (this.cart().get(id) ?? 0) + 1); break;
        case "inc": this.setQty(id, (this.cart().get(id) ?? 0) + 1); break;
        case "dec": this.setQty(id, (this.cart().get(id) ?? 0) - 1); break;
        case "remove": this.setQty(id, 0); break;
        case "clear": this.clearCart(); break;
        case "validate": this.validate(); break;
      }
    });

    el.addEventListener("dblclick", (ev) => {
      const row = ev.target.closest(".fs-row");
      if (!row || row.classList.contains("locked") || ev.target.closest("button")) return;
      this.setQty(row.dataset.id, (this.cart().get(row.dataset.id) ?? 0) + 1);
    });

    el.addEventListener("input", (ev) => {
      if (ev.target.dataset.role === "search") { this.search = ev.target.value; this.refreshTabs(); this.refreshCatalog(); }
    });

    el.addEventListener("change", (ev) => {
      const t = ev.target;
      switch (t.dataset.role) {
        case "sort": this.sort = t.value; this.refreshCatalog(); break;
        case "hide-locked": this.hideLocked = t.checked; this.refreshTabs(); this.refreshCatalog(); break;
        case "ignore-rank": this.ignoreRank = t.checked; this.refresh(); break;
        case "qty": this.setQty(t.closest("[data-id]").dataset.id, t.value); break;
        case "buyer": {
          this.actor = this.actors.find((a) => a.uuid === t.value) ?? this.actor;
          this.refresh();
          break;
        }
      }
    });

    el.addEventListener("keydown", (ev) => {
      const t = ev.target;
      if (t.dataset.role === "search") {
        if (ev.key === "Escape" && t.value) { ev.preventDefault(); ev.stopPropagation(); t.value = ""; this.search = ""; this.refreshTabs(); this.refreshCatalog(); }
        if (ev.key === "Enter") {
          ev.preventDefault();
          const first = this.visibleItems().find((i) => !this.isLocked(i));
          if (first) { this.setQty(first.id, (this.cart().get(first.id) ?? 0) + 1); this.flash(first.id); }
        }
      }
      if (t.dataset.role === "qty" && ev.key === "Enter") { ev.preventDefault(); t.blur(); }
    });

    // Mise à jour en direct si la fiche change (bourse, progressions…)
    this._hookId = Hooks.on("updateActor", (actor) => {
      if (actor.uuid === this.actor?.uuid) this.refresh();
    });
  }

  _onRender() { this.refresh(); }

  _onClose(options) {
    if (this._hookId !== undefined) Hooks.off("updateActor", this._hookId);
    return super._onClose?.(options);
  }

  $(role) { return this.element?.querySelector(`[data-role="${role}"]`); }

  refresh() {
    if (!this.element) return;
    this.refreshTabs(); this.refreshCatalog(); this.refreshBuyer(); this.refreshCart(); this.refreshSummary();
  }

  refreshTabs() {
    const cart = this.cart();
    this.$("tabs").innerHTML = SHOP.categories.map((c) => {
      const n = this.visibleItems(c.id).length;
      const inCart = [...cart].filter(([id]) => this.byId.get(id)?.category === c.id).reduce((s, [, q]) => s + q, 0);
      return `<button type="button" class="fs-tab ${c.id === this.tab ? "active" : ""}" data-act="tab" data-tab="${c.id}">
          <i class="${c.icon}"></i> ${c.label} <span class="fs-count">${n}</span>
          ${inCart ? `<span class="fs-badge" title="Articles de cette catégorie dans le panier">${inCart}</span>` : ""}
        </button>`;
    }).join("");
  }

  refreshCatalog() {
    const list = this.$("list");
    const items = this.visibleItems();
    const cart = this.cart();
    const funds = this.funds ?? Infinity;
    const remaining = funds - this.cartTotal();

    if (!items.length) {
      list.innerHTML = `<div class="fs-empty"><i class="fa-solid fa-magnifying-glass"></i>
        Aucun article ne correspond${this.search ? ` à « ${esc(this.search)} »` : ""}.</div>`;
      return;
    }

    let html = ""; let group = null;
    for (const item of items) {
      if (item.group && item.group !== group) { group = item.group; html += `<div class="fs-group">${esc(group)}</div>`; }
      const locked = this.isLocked(item);
      const qty = cart.get(item.id) ?? 0;
      const { main, detail } = splitName(item.name);
      const tooDear = !locked && item.price > remaining;
      const lockTxt = locked ? `<span class="fs-lock"><i class="fa-solid fa-lock"></i> ${esc(rankLabel(requiredAdvances(item.level)))}</span>` : "";
      const title = locked
        ? `Requiert ${levelLabel(item.level)} — ${esc(this.actor.name)} en a ${this.advances}`
        : `Ajouter au panier`;
      html += `<div class="fs-row ${locked ? "locked" : ""} ${qty ? "incart" : ""}" data-id="${esc(item.id)}">
          <div class="fs-name"><strong>${esc(main)}</strong> ${lockTxt}
            ${detail ? `<span class="fs-detail" title="${esc(detail)}">${esc(detail)}</span>` : ""}</div>
          <div class="fs-qtytag">${qty ? `×${qty}` : ""}</div>
          <div class="fs-price ${tooDear ? "toodear" : ""}" ${tooDear ? `title="Dépasse ce qu'il reste dans la bourse"` : ""}>${money(item.price)}</div>
          <button type="button" class="fs-add" data-act="add" ${locked ? "disabled" : ""} title="${title}">
            <i class="fa-solid ${locked ? "fa-lock" : "fa-plus"}"></i></button>
        </div>`;
    }
    list.innerHTML = html;
  }

  refreshBuyer() {
    const a = this.actor;
    const funds = this.funds;
    const adv = this.advances;
    const nameBlock = this.actors.length > 1
      ? `<select data-role="buyer" title="Choisir l'acheteur">${this.actors.map((x) =>
          `<option value="${x.uuid}" ${x.uuid === a.uuid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`
      : `<div class="fs-buyer-name">${esc(a.name)}</div>`;
    this.$("buyer").innerHTML = `
      <img src="${esc(a.img)}" alt="">
      <div class="fs-buyer-info">
        ${nameBlock}
        <div class="fs-buyer-rank">${rankLabel(adv)} · ${adv} progression${adv > 1 ? "s" : ""}</div>
      </div>
      <div class="fs-purse" title="${SHOP.currencyName} (${SHOP.currencyLabel})"><small>Bourse · ${SHOP.currencyName}</small>
        <span>${funds === null ? "?" : money(funds)}</span></div>`;
  }

  refreshCart() {
    const lines = this.cartLines();
    this.element.querySelector('[data-act="clear"]').disabled = !lines.length;
    if (!lines.length) {
      this.$("cart").innerHTML = `<div class="fs-empty"><i class="fa-solid fa-basket-shopping"></i>
        Le panier est vide.<br>Cliquez sur <i class="fa-solid fa-plus" style="display:inline;font-size:inherit"></i> ou double-cliquez sur un article.</div>`;
      return;
    }
    this.$("cart").innerHTML = lines.map(({ item, qty, total }) => {
      const locked = this.isLocked(item);
      return `<div class="fs-line ${locked ? "warn" : ""}" data-id="${esc(item.id)}">
        <div class="fs-line-name">${esc(item.name)}
          <small>${locked ? `<i class="fa-solid fa-lock"></i> Rang insuffisant` : `${money(item.price)} l'unité`}</small></div>
        <div class="fs-line-total">${money(total)}</div>
        <div class="fs-line-ctrl">
          <button type="button" class="fs-step" data-act="dec" title="Retirer 1"><i class="fa-solid fa-minus"></i></button>
          <input type="number" data-role="qty" min="0" max="${SHOP.maxQty}" value="${qty}" aria-label="Quantité">
          <button type="button" class="fs-step" data-act="inc" title="Ajouter 1" ${qty >= SHOP.maxQty ? "disabled" : ""}><i class="fa-solid fa-plus"></i></button>
          <button type="button" class="fs-remove" data-act="remove" title="Retirer du panier"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }).join("");
  }

  /** Retourne la liste des problèmes empêchant la validation */
  blockers() {
    const lines = this.cartLines();
    const out = [];
    if (!lines.length) return ["empty"];
    if (this.funds === null) out.push(`Bourse introuvable sur la fiche (${SHOP.currencyPath}).`);
    else if (this.cartTotal() > this.funds) out.push(`Il manque ${money(this.cartTotal() - this.funds)}.`);
    const locked = lines.filter((l) => this.isLocked(l.item));
    if (locked.length) out.push(`${locked.length} article${locked.length > 1 ? "s" : ""} au-dessus du rang de ${esc(this.actor.name)}.`);
    return out;
  }

  refreshSummary() {
    const total = this.cartTotal();
    const funds = this.funds;
    const after = funds === null ? null : round2(funds - total);
    const ok = after === null || after >= 0;
    const pct = funds ? Math.min(100, (total / funds) * 100) : (total ? 100 : 0);
    const blockers = this.blockers();
    const qty = this.cartLines().reduce((s, l) => s + l.qty, 0);

    this.$("summary").innerHTML = `
      <div class="fs-sumline"><span>Articles</span><span>${qty}</span></div>
      <div class="fs-sumline total"><span>Total</span><span>${money(total)}</span></div>
      ${funds !== null ? `
        <div class="fs-meter ${ok ? "" : "ko"}" title="${Math.round(pct)} % de la bourse"><div style="width:${pct}%"></div></div>
        <div class="fs-sumline after ${ok ? "ok" : "ko"}"><span>Reste après achat</span><span>${money(after)}</span></div>` : ""}
      ${blockers.filter((b) => b !== "empty").map((b) => `<div class="fs-alert"><i class="fa-solid fa-triangle-exclamation"></i> ${b}</div>`).join("")}`;

    this.element.querySelector('[data-act="validate"]').disabled = blockers.length > 0;
  }

  flash(id) {
    const row = this.element.querySelector(`.fs-row[data-id="${CSS.escape(id)}"]`);
    row?.animate([{ background: "rgba(201,162,39,.45)" }, { background: "transparent" }], { duration: 600 });
  }

  /* --- Actions ----------------------------------------------------------- */

  async clearCart() {
    if (!this.cart().size) return;
    const ok = await DialogV2.confirm({
      window: { title: "Vider le panier", icon: "fa-solid fa-trash-can" },
      content: `<p>Retirer tous les articles du panier de <strong>${esc(this.actor.name)}</strong> ?</p>`,
      yes: { label: "Vider", icon: "fa-solid fa-trash-can" },
      no: { label: "Annuler" },
      rejectClose: false, modal: true
    });
    if (!ok) return;
    this.cart().clear();
    this.saveCart();
    this.refresh();
  }

  async validate() {
    if (this.blockers().length) return this.refresh();
    const actor = this.actor;
    const lines = this.cartLines();
    const total = this.cartTotal();
    const before = this.funds;
    const after = round2(before - total);

    const recap = lines.map((l) =>
      `<li style="display:flex;justify-content:space-between;gap:12px"><span>${l.qty} × ${esc(l.item.name)}</span><strong style="white-space:nowrap">${money(l.total)}</strong></li>`
    ).join("");
    const ok = await DialogV2.confirm({
      window: { title: "Confirmer l'achat", icon: "fa-solid fa-coins" },
      position: { width: 420 },
      content: `
        <p><strong>${esc(actor.name)}</strong> achète :</p>
        <ul style="list-style:none;padding:0;margin:0 0 8px;max-height:260px;overflow:auto">${recap}</ul>
        <p style="display:flex;justify-content:space-between;font-size:1.1em"><span>Total</span><strong>${money(total)}</strong></p>
        ${SHOP.debitFunds ? `<p>Bourse (${SHOP.currencyName}) : ${money(before)} → <strong>${money(after)}</strong></p>` : ""}`,
      yes: { label: "Payer", icon: "fa-solid fa-coins", default: true },
      no: { label: "Annuler" },
      rejectClose: false, modal: true
    });
    if (!ok) return;

    // Vérification finale sur la fiche à jour (la bourse a pu changer entre-temps)
    const fresh = getFunds(actor);
    if (fresh === null || fresh < total) {
      ui.notifications.error(`Achat refusé : la bourse de ${actor.name} ne suffit plus (${money(fresh ?? 0)} pour ${money(total)}).`);
      return this.refresh();
    }

    if (SHOP.debitFunds) {
      try {
        await actor.update({ [SHOP.currencyPath]: round2(fresh - total) });
      } catch (err) {
        console.error(err);
        ui.notifications.error(`Impossible de débiter la bourse de ${actor.name} (droits insuffisants ?).`);
        return;
      }
    }

    await this.postToChat(actor, lines, total, fresh, SHOP.debitFunds ? round2(fresh - total) : null);
    this.cart().clear();
    this.saveCart();
    this.refresh();
    ui.notifications.info(`${actor.name} a payé ${money(total)}.`);
  }

  async postToChat(actor, lines, total, before, after) {
    const sections = SHOP.categories.map((c) => {
      const ls = lines.filter((l) => l.item.category === c.id);
      if (!ls.length) return "";
      return `<div style="color:#666666;font-style:italic;font-weight:600;margin:6px 0 2px">${c.label}</div>` +
        ls.map((l) => `<div style="display:flex;justify-content:space-between;gap:6px;line-height:1.35">
            <span>${l.qty > 1 ? `${l.qty}&nbsp;×&nbsp;` : ""}${esc(l.item.name)}</span>
            <span style="white-space:nowrap">${money(l.total)}</span></div>`).join("");
    }).join("");

    const content = `
      <div class="ferremont-purchase">
        <div style="display:flex;align-items:center;gap:8px;padding-bottom:6px;border-bottom:1px solid rgba(128,128,128,.4)">
          <img src="${esc(actor.img)}" width="36" height="36" style="flex:0 0 36px;border:none;border-radius:4px;object-fit:cover">
          <div style="line-height:1.2"><strong>${esc(actor.name)}</strong><br>
            <span style="font-size:.85em;opacity:.8"><i class="fa-solid fa-store"></i> Achats à Ferremont</span></div>
        </div>
        ${sections}
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:4px;border-top:1px solid rgba(128,128,128,.4);font-weight:700">
          <span>Total</span><span style="white-space:nowrap">${money(total)}</span></div>
        ${after !== null ? `<div style="display:flex;justify-content:space-between;font-size:.9em;opacity:.85">
          <span>Bourse</span><span style="white-space:nowrap">${money(before)} → ${money(after)}</span></div>` : ""}
      </div>`;

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flags: { world: { ferremontPurchase: {
        version: SHOP.version, actor: actor.uuid, total, before, after,
        items: lines.map((l) => ({ name: l.item.name, category: l.item.category, qty: l.qty, price: l.item.price }))
      } } }
    };
    if (SHOP.chatVisibility === "gm") {
      data.whisper = [...new Set([...ChatMessage.getWhisperRecipients("GM").map((u) => u.id), game.user.id])];
    }
    return ChatMessage.create(data);
  }
}

/* ------------------------------------------------------------------------- */
/*  Lancement                                                                */
/* ------------------------------------------------------------------------- */

(async () => {
  const existing = foundry.applications.instances?.get("ferremont-shop");
  if (existing) return existing.bringToFront?.() ?? existing.render({ force: true });

  const actors = candidateActors();
  if (!actors.length) {
    ui.notifications.warn("Boutique de Ferremont : aucun personnage disponible (assignez-vous un personnage ou sélectionnez son jeton).");
    return;
  }

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    console.error("Boutique de Ferremont |", err);
    ui.notifications.error(`Boutique de Ferremont : liste de prix introuvable (${SHOP.priceFile}). Voir la console (F12).`);
    return;
  }
  if (!catalog.length) {
    ui.notifications.error("Boutique de Ferremont : la liste de prix est vide ou mal formée.");
    return;
  }

  new FerremontShop(catalog, actors, defaultActor(actors)).render({ force: true });
})();