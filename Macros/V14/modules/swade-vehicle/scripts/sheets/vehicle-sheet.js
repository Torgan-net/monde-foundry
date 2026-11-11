import { MODULE_ID, ROLE_BY_TYPE, ROLE_PRIORITY, TECH_FIELDS, TYPE_LABEL } from "../constants.js";
import { computeVehicleClasse, stripClasse } from "../rules/classes.js";
import { toInt } from "../rules/numbers.js";
import { scaleForSize, woundsForSize } from "../rules/size.js";
import { combineSupportBonuses, normalizeSupports, pendingSupportBonuses } from "../rules/support.js";
import { actorFromUuid, getDragData, randomId } from "../services/foundry-utils.js";
import { actorCombat } from "../services/heavy-metal.js";
import { crewUuidFor, pruneInstances, referencedActors } from "../services/instances.js";
import { vehicleHasJoker } from "../services/joker.js";
import { onClearJournal, onCritical, onDivertPower, onOutOfControl, onRechargeEnergy, onReloadWeapon, onRepair, onRestorePower, onShieldEmergency, onShieldFull, onShieldSoak, onSpendEnergy, onToggleStatus, onWound } from "./actions-gm.js";
import { onDamage, onDamageHM, onFire, onGroupRoll, onManeuver, onModAction, onPosteSkill, onWeaponAction } from "./actions-rolls.js";
import { onAddPoste, onAddSupport, onClearOccupant, onClearSupportActor, onCollapseAll, onDeletePoste, onDeleteSupport, onImportCrew, onOpenItem, onOpenNative, onOpenTweaks, onSwitchTab, onToggleCollapse, onToggleLock } from "./actions-ui.js";
import { buildSheetContext } from "./context.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;

const { ActorSheetV2 } = foundry.applications.sheets;

export class SwadeVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  _tab = "passerelle";

  _locked = true;

  _collapsed = null; // Set des postes repliés, mémorisé par utilisateur et par véhicule (localStorage)

  get _collapseKey() { return `${MODULE_ID}.collapsed.${game.user.id}.${this.document.uuid}`; }

  get collapsed() {
    if (!this._collapsed) {
      try { this._collapsed = new Set(JSON.parse(localStorage.getItem(this._collapseKey) ?? "[]")); }
      catch { this._collapsed = new Set(); }
    }
    return this._collapsed;
  }

  _saveCollapsed() {
    try { localStorage.setItem(this._collapseKey, JSON.stringify([...this.collapsed])); } catch { /* stockage indisponible */ }
  }

  /** Titre de fenêtre : nom sans « (Classe …) », type si défini, Classe calculée. */
  get title() {
    const a = this.document;
    const parts = [stripClasse(a.name)];
    const type = a.system?.classification?.trim();
    if (type) parts.push(type);
    const classe = a.getFlag(MODULE_ID, "classeOverride") || computeVehicleClasse(a);
    if (classe) parts.push(`Classe ${classe}`);
    return parts.join(" · ");
  }

  static DEFAULT_OPTIONS = {
    classes: ["swade-vehicle-sheet"],
    position: { width: 820, height: 880 },
    window: {
      resizable: true,
      controls: [{ icon: "fa-solid fa-sliders", label: "Fiche native SWADE (Tweaks)", action: "openNative" }]
    },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      switchTab: onSwitchTab,
      addSupport: onAddSupport,
      deleteSupport: onDeleteSupport,
      clearSupportActor: onClearSupportActor,
      openNative: onOpenNative,
      openTweaks: onOpenTweaks,
      toggleCollapse: onToggleCollapse,
      groupRoll: onGroupRoll,
      collapseAll: onCollapseAll,
      damageHM: onDamageHM,
      toggleLock: onToggleLock,
      maneuver: onManeuver,
      posteSkill: onPosteSkill,
      fire: onFire,
      damage: onDamage,
      weaponAction: onWeaponAction,
      modAction: onModAction,
      toggleStatus: onToggleStatus,
      wound: onWound,
      addPoste: onAddPoste,
      deletePoste: onDeletePoste,
      clearOccupant: onClearOccupant,
      clearJournal: onClearJournal,
      reloadWeapon: onReloadWeapon,
      spendEnergy: onSpendEnergy,
      shieldSoak: onShieldSoak,
      shieldEmergency: onShieldEmergency,
      shieldFull: onShieldFull,
      divertPower: onDivertPower,
      restorePower: onRestorePower,
      rechargeEnergy: onRechargeEnergy,
      outOfControl: onOutOfControl,
      critical: onCritical,
      repair: onRepair,
      importCrew: onImportCrew,
      openItem: onOpenItem
    }
  };

  static PARTS = {
    sheet: {
      template: `modules/${MODULE_ID}/templates/vehicle-sheet.hbs`,
      scrollable: [".swv-body"]
    }
  };

  /* ---------------- Données ---------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return buildSheetContext(this, context);
  }

  /** Postes du véhicule (copie modifiable). L'ancien soutien unique est converti en liste `supports`. */
  get postes() {
    return foundry.utils.deepClone(this.document.getFlag(MODULE_ID, "postes") ?? []).map((p) => {
      const { support, ...rest } = p;
      return { ...rest, supports: normalizeSupports(p) };
    });
  }

  /**
   * Glisser-déposer d'un acteur n'importe où sur la fiche (MJ).
   * Écouteurs posés une seule fois sur la racine, en phase de capture : ils passent
   * avant la gestion native du dépôt. Les objets (cargaison) suivent le chemin natif.
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    this.element.addEventListener("dragover", (ev) => { if (game.user.isGM) ev.preventDefault(); }, { capture: true });
    this.element.addEventListener("drop", (ev) => this._onDropAnywhere(ev), { capture: true });
  }

  async _onDropAnywhere(event) {
    this.element.querySelectorAll(".is-over").forEach((el) => el.classList.remove("is-over"));
    if (!game.user.isGM) return;
    const data = getDragData(event);
    if (data?.type !== "Actor" || !data.uuid) return; // objets : dépôt natif (cargaison)
    event.preventDefault();
    event.stopPropagation();
    if (data.uuid === this.document.uuid) return;
    const dropped = actorFromUuid(data.uuid);
    if (dropped?.type === "vehicle") return ui.notifications.warn("Un véhicule ne peut pas occuper un poste.");

    const postes = this.postes;
    // Dépôt sur un soutien : l'acteur devient ce soutien.
    const supportEl = event.target.closest?.("[data-support-id]");
    if (supportEl) {
      const s = postes.find((x) => x.id === supportEl.dataset.posteId)?.supports.find((x) => x.id === supportEl.dataset.supportId);
      if (!s) return;
      s.actor = await crewUuidFor(this.document, data.uuid); // Extra non lié : instance propre au véhicule
      return this._savePostes(postes);
    }
    let posteId = event.target.closest?.("[data-poste-id]")?.dataset.posteId;
    if (!posteId) posteId = await this._askPoste(postes, dropped?.name ?? "cet acteur");
    if (!posteId) return;
    const uuid = await crewUuidFor(this.document, data.uuid); // Extra non lié : instance propre au véhicule

    if (posteId.startsWith("new:")) {
      const type = posteId.slice(4);
      postes.push({ id: randomId(), label: TYPE_LABEL[type] ?? "Poste", type, skill: "", weapons: [], mods: [], supports: [], occupant: uuid });
    } else {
      const p = postes.find((x) => x.id === posteId);
      if (!p) return;
      p.occupant = uuid;
    }
    await this._savePostes(postes);
  }

  /** Choix du poste quand l'acteur est déposé hors d'une carte de poste. */
  async _askPoste(postes, name) {
    const esc = foundry.utils.escapeHTML ?? ((t) => t);
    const vacant = postes.filter((p) => !p.occupant);
    const taken = postes.filter((p) => p.occupant);
    const opt = (p) => `<option value="${p.id}">${esc(p.label)} (${TYPE_LABEL[p.type] ?? p.type}${p.occupant ? ", remplace " + esc(actorFromUuid(p.occupant)?.name ?? "l'occupant") : ""})</option>`;
    const content = `<p>Affecter <strong>${esc(name)}</strong> à :</p>
      <select name="poste" style="width:100%">
        ${vacant.length ? `<optgroup label="Postes vacants">${vacant.map(opt).join("")}</optgroup>` : ""}
        ${taken.length ? `<optgroup label="Postes occupés">${taken.map(opt).join("")}</optgroup>` : ""}
        <optgroup label="Nouveau poste">
          ${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="new:${k}">Nouveau poste : ${l}</option>`).join("")}
        </optgroup>
      </select>`;
    try {
      return await foundry.applications.api.DialogV2.prompt({
        window: { title: "Affecter à un poste" },
        content,
        ok: { label: "Affecter", callback: (ev, button) => button.form.elements.poste.value }
      });
    } catch { return null; } // fenêtre fermée
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;

    // Si l'utilisateur n'a pas le droit d'éditer le véhicule, la fiche désactive tous les contrôles :
    // on réactive les boutons de jet des postes que l'utilisateur occupe.
    html.querySelectorAll("button.swv-roll[data-can-act='true']").forEach((b) => { b.disabled = false; });
    html.querySelectorAll("[data-tab-button], .swv-ui").forEach((b) => { b.disabled = false; });

    // Portrait : clic gauche = changer (propriétaire), sinon agrandir ; clic droit = agrandir.
    const portrait = html.querySelector(".swv-portrait");
    if (portrait) {
      const show = () => {
        const Popout = foundry.applications.apps.ImagePopout;
        new Popout({ src: this.document.img, uuid: this.document.uuid, window: { title: this.document.name } }).render({ force: true });
      };
      portrait.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (!this.document.isOwner) return show();
        const FP = foundry.applications.apps.FilePicker.implementation;
        new FP({ type: "image", current: this.document.img, callback: (path) => this.document.update({ img: path }) }).browse();
      });
      portrait.addEventListener("contextmenu", (ev) => { ev.preventDefault(); show(); });
    }

    // Double-clic sur le jeton d'un occupant : ouvre sa fiche (selon les droits de l'utilisateur).
    html.querySelectorAll(".swv-token[data-uuid]").forEach((el) => {
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        const actor = actorFromUuid(el.dataset.uuid);
        if (!actor) return ui.notifications.warn("Acteur introuvable.");
        if (!actor.testUserPermission(game.user, "LIMITED")) return ui.notifications.warn("Vous n'avez pas accès à cette fiche.");
        actor.sheet?.render({ force: true });
      });
    });

    if (!game.user.isGM) return;

    html.querySelectorAll("article.swv-poste[data-poste-id]").forEach((el) => {
      el.addEventListener("dragenter", () => el.classList.add("is-over"));
      el.addEventListener("dragleave", (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove("is-over"); });
    });
    html.querySelectorAll("[data-support-field]").forEach((el) =>
      el.addEventListener("change", (ev) => this._onSupportField(ev)));
    html.querySelectorAll("[data-poste-field]").forEach((el) =>
      el.addEventListener("change", (ev) => this._onPosteField(ev)));
    html.querySelectorAll("[data-classe-item]").forEach((el) =>
      el.addEventListener("change", (ev) => this._onItemClasse(ev)));
    html.querySelector("[data-classe-vehicle]")?.addEventListener("change", (ev) => this._onVehicleClasse(ev));
    html.querySelector("[data-maneuver-skill]")?.addEventListener("change", (ev) =>
      this.document.update({ "system.driver.skill": ev.currentTarget.value }));
    html.querySelector("[data-actor-name]")?.addEventListener("change", async (ev) => {
      const name = ev.currentTarget.value.trim();
      if (!name) { ev.currentTarget.value = this.document.name; return; }
      if (name !== this.document.name) await this.document.update({ name });
    });
    html.querySelector("[data-hm-combat]")?.addEventListener("change", (ev) => {
      const combat = actorCombat(this.document);
      if (combat) combat.setFlag(MODULE_ID, "heavyMetal", ev.currentTarget.checked);
    });
    html.querySelectorAll("[data-energy-item]").forEach((el) =>
      el.addEventListener("change", async (ev) => {
        const item = this.document.items.get(ev.currentTarget.dataset.energyItem);
        if (!item) return;
        if (ev.currentTarget.checked) await item.setFlag(MODULE_ID, "energy", true);
        else await item.unsetFlag(MODULE_ID, "energy");
      }));
    html.querySelectorAll("[data-fixed-item]").forEach((el) =>
      el.addEventListener("change", async (ev) => {
        const item = this.document.items.get(ev.currentTarget.dataset.fixedItem);
        if (!item) return;
        if (ev.currentTarget.checked) await item.setFlag(MODULE_ID, "fixed", true);
        else await item.unsetFlag(MODULE_ID, "fixed");
      }));
    html.querySelectorAll("[data-warhead-item]").forEach((el) =>
      el.addEventListener("change", async (ev) => {
        const item = this.document.items.get(ev.currentTarget.dataset.warheadItem);
        if (!item) return;
        if (ev.currentTarget.value) await item.setFlag(MODULE_ID, "warhead", ev.currentTarget.value);
        else await item.unsetFlag(MODULE_ID, "warhead");
      }));
    html.querySelectorAll("[data-feature]").forEach((el) =>
      el.addEventListener("change", (ev) => this._onFeature(ev)));
    html.querySelectorAll("[data-sys-number]").forEach((el) =>
      el.addEventListener("change", (ev) => this._onSysNumber(ev)));
    html.querySelector("[data-wounds-force]")?.addEventListener("change", async (ev) => {
      const forced = ev.currentTarget.checked;
      await this.document.setFlag(MODULE_ID, "woundsForced", forced);
      if (forced) return;
      const max = woundsForSize(this.document._source?.system?.size ?? this.document.system.size);
      const update = { "system.wounds.max": max };
      if ((this.document.system.wounds?.value ?? 0) > max) update["system.wounds.value"] = max;
      await this.document.update(update);
    });
    html.querySelector("[data-scale-force]")?.addEventListener("change", async (ev) => {
      const forced = ev.currentTarget.checked;
      await this.document.setFlag(MODULE_ID, "scaleForced", forced);
      if (!forced) await this.document.update({ "system.scale": scaleForSize(this.document._source?.system?.size ?? this.document.system.size) });
    });
    html.querySelectorAll("[data-tech]").forEach((el) =>
      el.addEventListener("change", (ev) => this._onTechField(ev)));
  }

  /* ---------------- Écritures ---------------- */

  /**
   * Construit system.crew.members à partir des postes.
   * - Les membres ajoutés hors du module (uuid jamais géré par le module) sont conservés tels quels.
   * - Un acteur présent sur plusieurs postes devient un seul membre : rôle le plus fort, armes cumulées.
   * - Les clés inconnues d'un membre existant sont conservées.
   */
  _buildCrew(postes) {
    const actor = this.document;
    const source = actor.toObject().system?.crew?.members ?? [];
    const prevManaged = new Set(actor.getFlag(MODULE_ID, "managed") ?? []);
    const byUuid = new Map();
    for (const p of postes) {
      if (!p.occupant) continue;
      const role = ROLE_BY_TYPE[p.type] ?? "other";
      const entry = byUuid.get(p.occupant) ?? { uuid: p.occupant, role, weapons: [] };
      if ((ROLE_PRIORITY[role] ?? 0) > (ROLE_PRIORITY[entry.role] ?? 0)) entry.role = role;
      for (const w of p.weapons ?? []) if (!entry.weapons.includes(w)) entry.weapons.push(w);
      byUuid.set(p.occupant, entry);
    }
    const current = new Set(byUuid.keys());
    const kept = source.filter((m) => !prevManaged.has(m.uuid) && !current.has(m.uuid));
    let sort = kept.reduce((s, m) => Math.max(s, m.sort ?? 0), -1);
    const generated = [...byUuid.values()].map((e) => {
      const old = source.find((m) => m.uuid === e.uuid);
      return { ...(old ?? {}), ...e, sort: old?.sort ?? ++sort };
    });
    return { members: [...kept, ...generated], managed: [...current] };
  }

  async _savePostes(postes) {
    const { members, managed } = this._buildCrew(postes);
    await this.document.update({
      [`flags.${MODULE_ID}.postes`]: postes,
      [`flags.${MODULE_ID}.managed`]: managed,
      "system.crew.members": members
    });
    // Instances d'Extras créées pour ce véhicule et qui ne servent plus : supprimées.
    await pruneInstances(this.document, referencedActors(postes, this.document.system?.crew?.members ?? members));
  }

  async _onPosteField(event) {
    const el = event.currentTarget;
    const postes = this.postes;
    const p = postes.find((x) => x.id === el.dataset.posteId);
    if (!p) return;
    const field = el.dataset.posteField;
    if (field === "weapons" || field === "mods") {
      const set = new Set(p[field] ?? []);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      p[field] = [...set];
    } else {
      p[field] = el.value.trim();
    }
    await this._savePostes(postes);
  }

  async _onItemClasse(event) {
    const el = event.currentTarget;
    const item = this.document.items.get(el.dataset.classeItem);
    const value = el.value.trim().toUpperCase();
    if (!item) return;
    if (value) await item.setFlag(MODULE_ID, "classe", value);
    else await item.unsetFlag(MODULE_ID, "classe");
  }

  async _onVehicleClasse(event) {
    const value = event.currentTarget.value.trim().toUpperCase();
    if (value) await this.document.setFlag(MODULE_ID, "classeOverride", value);
    else await this.document.unsetFlag(MODULE_ID, "classeOverride");
  }

  async _onFeature(event) {
    const el = event.currentTarget;
    const key = el.dataset.feature;
    if (key === "energy") return this.document.update({ "system.energy.enabled": el.checked });
    if (key === "cargo" || key === "mods") return this.document.setFlag(MODULE_ID, `features.${key}`, el.checked);
  }

  /** Caractéristique technique : une seule valeur, chemin autorisé, type contrôlé. */
  async _onTechField(event) {
    const el = event.currentTarget;
    const path = el.dataset.tech;
    const kind = TECH_FIELDS[path];
    if (!kind) return;
    let value;
    if (kind === "text") value = el.value.trim();
    else {
      value = toInt(el.value);
      if (kind === "int") value = Math.max(0, value);
    }
    el.value = value;
    const update = { [`system.${path}`]: value };
    // Échelle calculée d'après la Taille, sauf si elle est forcée.
    if (path === "size" && !this.document.getFlag(MODULE_ID, "scaleForced")) update["system.scale"] = scaleForSize(value);
    // Blessures max calculées d'après la Taille, sauf si elles sont forcées.
    if (path === "size" && !this.document.getFlag(MODULE_ID, "woundsForced")) {
      const max = woundsForSize(value);
      update["system.wounds.max"] = max;
      if ((this.document.system.wounds?.value ?? 0) > max) update["system.wounds.value"] = max;
    }
    // Garde la cohérence : Blessures actuelles ≤ max, Armure ≤ Résistance totale.
    const sys = this.document.system;
    if (path === "wounds.max" && (sys.wounds?.value ?? 0) > value) update["system.wounds.value"] = value;
    if (path === "toughness.armor" && value > (sys.toughness?.total ?? value)) {
      ui.notifications.warn("L'Armure dépasse la Résistance totale : vérifiez les deux valeurs (la Résistance inclut l'Armure).");
    }
    await this.document.update(update);
  }

  /** Écrit une seule valeur numérique système, uniquement parmi les chemins autorisés. */
  async _onSysNumber(event) {
    const el = event.currentTarget;
    const path = el.dataset.sysNumber;
    if (!["cargo.max", "mods.max", "energy.max", "energy.value",
      "crew.required.max", "crew.optional.max", "crew.optional.value"].includes(path)) return;
    const sys = this.document.system;
    let value = Math.max(0, toInt(el.value));
    if (path === "energy.value") value = Math.min(value, sys.energy?.max ?? value);
    if (path === "crew.optional.value") value = Math.min(value, sys.crew?.optional?.max ?? value);
    el.value = value;
    const update = { [`system.${path}`]: value };
    if (path === "energy.max" && (sys.energy?.value ?? 0) > value) update["system.energy.value"] = value;
    if (path === "crew.optional.max" && (sys.crew?.optional?.value ?? 0) > value) update["system.crew.optional.value"] = value;
    await this.document.update(update);
  }

  /**
   * Bonus de soutien en attente sur un poste : renvoyé comme modificateur et consommé.
   * Il est retiré avant le jet (un jet annulé dans la fenêtre de SWADE le consomme quand même).
   */
  async _takeSupport(poste) {
    const list = poste ? pendingSupportBonuses(this.document.getFlag(MODULE_ID, `supportBonus.${poste.id}`)) : [];
    if (!list.length) return [];
    if (this.document.isOwner) await this.document.unsetFlag(MODULE_ID, `supportBonus.${poste.id}`);
    else ui.notifications.info("Bonus de soutien appliqué : le MJ devra l'effacer de la fiche.");
    const value = combineSupportBonuses(list.map((b) => b.value));
    const names = list.map((b) => b.label).filter(Boolean).join(", ");
    return value ? [{ label: `Soutien${names ? " · " + names : ""}`, value }] : [];
  }

  /** Champ d'un soutien (onglet Conception). */
  async _onSupportField(event) {
    const el = event.currentTarget;
    const postes = this.postes;
    const s = postes.find((x) => x.id === el.dataset.posteId)?.supports.find((x) => x.id === el.dataset.supportId);
    if (!s) return;
    const key = el.dataset.supportField;
    s[key] = ["count", "die", "mod"].includes(key) ? toInt(el.value) : el.value.trim();
    if (key === "count") s.count = Math.max(0, s.count);
    await this._savePostes(postes);
  }

  /** +2 du Joker pour le seul pilote, quand le véhicule a tiré un Joker. */
  _jokerMods(poste) {
    return poste?.type === "pilote" && vehicleHasJoker(this.document) ? [{ label: "Joker", value: 2 }] : [];
  }

  _runtime(target) {
    const p = this.postes.find((x) => x.id === target.closest("[data-poste-id]")?.dataset.posteId);
    return { poste: p, occupant: actorFromUuid(p?.occupant) };
  }

  /* ---------------- Actions ---------------- */
}

/* ------------------------------------------------------------------ */
/* Enregistrement                                                      */
/* ------------------------------------------------------------------ */

/* Re-rendu des fiches véhicule ouvertes quand un occupant gagne ou perd un état. */
export function refreshVehicleSheetsFor(actor) {
  if (!actor) return;
  const uuids = new Set([actor.uuid, actor.token?.uuid].filter(Boolean));
  for (const app of foundry.applications.instances.values()) {
    if (!(app instanceof SwadeVehicleSheet) || !app.rendered) continue;
    const crew = app.document.system?.crew?.members ?? [];
    if (crew.some((m) => uuids.has(m.uuid))) app.render();
  }
}

for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, (effect) => { if (effect.parent instanceof Actor) refreshVehicleSheetsFor(effect.parent); });
}

/* Re-rendu des fiches véhicule quand l'état Heavy Metal d'un combat change. */
export function refreshAllVehicleSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof SwadeVehicleSheet && app.rendered) app.render();
  }
}

Hooks.on("updateCombat", (combat, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refreshAllVehicleSheets();
});

for (const hook of ["deleteCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, () => refreshAllVehicleSheets());
