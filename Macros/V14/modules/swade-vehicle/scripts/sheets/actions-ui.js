/** Actions de la fiche : onglets, verrou, postes, repli, fenêtres annexes. `this` = la fiche. */

import { MODULE_ID, TYPE_BY_ROLE, TYPE_LABEL } from "../constants.js";
import { actorFromUuid, randomId } from "../services/foundry-utils.js";
import { crewUuidFor } from "../services/instances.js";
import { SwadeVehicleSheet } from "./vehicle-sheet.js";

export function onSwitchTab(event, target) {
  this._tab = target.dataset.swvTab;
  this.render();
}

export function onToggleLock() {
  if (!game.user.isGM) return;
  this._locked = !this._locked;
  this._tab = this._locked ? "passerelle" : "conception";
  this.render();
}

export async function onAddPoste() {
  if (!game.user.isGM) return;
  const postes = this.postes;
  postes.push({ id: randomId(), label: "Nouveau poste", type: "autre", skill: "", weapons: [], mods: [], occupant: null });
  await this._savePostes(postes);
}

export async function onDeletePoste(event, target) {
  if (!game.user.isGM) return;
  const id = target.dataset.posteId;
  const postes = this.postes;
  const p = postes.find((x) => x.id === id);
  if (!p) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Supprimer le poste" },
    content: `<p>Supprimer le poste « ${p.label} » ? L'occupant sera retiré de l'équipage natif s'il n'occupe pas d'autre poste.</p>`
  });
  if (!ok) return;
  await this._savePostes(postes.filter((x) => x.id !== id));
}

export async function onClearOccupant(event, target) {
  if (!game.user.isGM) return;
  const postes = this.postes;
  const p = postes.find((x) => x.id === target.dataset.posteId);
  if (!p) return;
  p.occupant = null;
  await this._savePostes(postes);
}

export async function onImportCrew() {
  if (!game.user.isGM) return;
  const members = this.document.toObject().system?.crew?.members ?? [];
  if (!members.length) return ui.notifications.info("Aucun membre d'équipage natif à importer.");
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Importer l'équipage" },
    content: `<p>Créer un poste par membre d'équipage natif (${members.length}) ? Le module gérera ensuite ces membres.</p>`
  });
  if (!ok) return;
  const postes = this.postes;
  for (const m of members) {
    const type = TYPE_BY_ROLE[m.role] ?? "autre";
    const uuid = await crewUuidFor(this.document, m.uuid); // Extra non lié : instance propre au véhicule
    const occ = actorFromUuid(uuid);
    postes.push({
      id: randomId(),
      label: `${TYPE_LABEL[type]}${occ ? " · " + occ.name : ""}`,
      type,
      skill: "",
      weapons: [...(m.weapons ?? [])],
      mods: [],
      supports: [],
      occupant: uuid
    });
  }
  await this._savePostes(postes);
}

/** Ouvre l'acteur avec la fiche native du système (Tweaks, caractéristiques), dans une fenêtre à part. */
export function onOpenNative() {
  const sheets = CONFIG.Actor.sheetClasses?.vehicle ?? {};
  const entry = Object.entries(sheets).find(([id]) => id.startsWith("swade."))?.[1]
    ?? Object.values(sheets).find((e) => e.cls !== SwadeVehicleSheet);
  if (!entry?.cls) return ui.notifications.warn("Fiche native du véhicule introuvable.");
  new entry.cls({ document: this.document }).render({ force: true });
}

/** Tweaks de SWADE : application du système si on la trouve, sinon fiche native. */
/**
 * Tweaks de SWADE, par ordre de préférence :
 *  1. l'action « tweaks » de la fiche native du système, exécutée pour ce véhicule ;
 *  2. une application « Tweaks » exposée dans game.swade.apps ;
 *  3. à défaut, la fiche native dans une fenêtre à part.
 * Le chemin utilisé est écrit dans la console.
 */
export async function onOpenTweaks(event, target) {
  const sheets = CONFIG.Actor.sheetClasses?.vehicle ?? {};
  const native = Object.entries(sheets).find(([id]) => id.startsWith("swade."))?.[1]?.cls;
  for (let C = native; C && C !== Object; C = Object.getPrototypeOf(C)) {
    const actions = Object.prototype.hasOwnProperty.call(C, "DEFAULT_OPTIONS") ? C.DEFAULT_OPTIONS?.actions ?? {} : {};
    const key = Object.keys(actions).find((k) => /tweak/i.test(k));
    if (!key) continue;
    const fn = typeof actions[key] === "function" ? actions[key] : actions[key]?.handler;
    if (typeof fn !== "function") continue;
    try {
      await fn.call(this, event, target);
      console.debug(`${MODULE_ID} | Tweaks ouverts via l'action « ${key} » de ${C.name}`);
      return;
    } catch (err) {
      console.warn(`${MODULE_ID} | action « ${key} » de ${C.name} en échec`, err);
    }
  }
  const apps = game.swade?.apps ?? {};
  const appKey = Object.keys(apps).find((k) => /tweak/i.test(k));
  if (appKey) {
    try {
      const A = apps[appKey];
      const isV2 = A.prototype instanceof foundry.applications.api.ApplicationV2;
      await (isV2 ? new A({ document: this.document }) : new A(this.document)).render({ force: true });
      console.debug(`${MODULE_ID} | Tweaks ouverts via game.swade.apps.${appKey}`);
      return;
    } catch (err) {
      console.warn(`${MODULE_ID} | game.swade.apps.${appKey} en échec`, err);
    }
  }
  console.debug(`${MODULE_ID} | Tweaks introuvables, ouverture de la fiche native`);
  onOpenNative.call(this);
}

/** Replie ou déplie un poste (affichage seulement, propre à chaque utilisateur). */
export function onToggleCollapse(event, target) {
  const id = target.closest("[data-poste-id]")?.dataset.posteId;
  if (!id) return;
  if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id);
  this._saveCollapsed();
  this.render();
}

export function onCollapseAll(event, target) {
  const ids = this.postes.map((p) => p.id);
  if (target.dataset.mode === "collapse") ids.forEach((id) => this.collapsed.add(id));
  else this.collapsed.clear();
  this._saveCollapsed();
  this.render();
}

export function onOpenItem(event, target) {
  this.document.items.get(target.dataset.itemId)?.sheet?.render(true);
}

/** Ajoute un soutien au poste (onglet Conception). */
export async function onAddSupport(event, target) {
  if (!game.user.isGM) return;
  const postes = this.postes;
  const p = postes.find((x) => x.id === target.dataset.posteId);
  if (!p) return;
  p.supports.push({ id: randomId(), label: "", count: 1, die: 6, mod: 0, skill: "", actor: null });
  await this._savePostes(postes);
}

export async function onDeleteSupport(event, target) {
  if (!game.user.isGM) return;
  const postes = this.postes;
  const p = postes.find((x) => x.id === target.dataset.posteId);
  if (!p) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Supprimer le soutien" },
    content: "<p>Supprimer ce soutien du poste ? Un bonus en attente de ce soutien sera perdu.</p>"
  });
  if (!ok) return;
  p.supports = p.supports.filter((s) => s.id !== target.dataset.supportId);
  await this._savePostes(postes);
  if (this.document.getFlag(MODULE_ID, `supportBonus.${p.id}.${target.dataset.supportId}`)) {
    await this.document.unsetFlag(MODULE_ID, `supportBonus.${p.id}.${target.dataset.supportId}`);
  }
}

export async function onClearSupportActor(event, target) {
  if (!game.user.isGM) return;
  const postes = this.postes;
  const s = postes.find((x) => x.id === target.dataset.posteId)?.supports.find((x) => x.id === target.dataset.supportId);
  if (!s) return;
  s.actor = null;
  await this._savePostes(postes);
}
