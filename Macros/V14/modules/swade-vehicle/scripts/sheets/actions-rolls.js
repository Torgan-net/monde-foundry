/** Actions de la fiche : jets des postes (manœuvre, compétence, soutien, tirs, dégâts, mods). `this` = la fiche. */

import { MODULE_ID } from "../constants.js";
import { fireViaSwadeTools, useSwadeToolsWeapons } from "../integrations/swade-tools.js";
import { computeWeaponClasse, stripClasse } from "../rules/classes.js";
import { toInt } from "../rules/numbers.js";
import { powerMods } from "../services/energy.js";
import { heavyMetalCombat, openHeavyMetalDialog } from "../services/heavy-metal.js";
import { consumeShots, nativeItemAction, rollTrait } from "../services/rolls.js";
import { groupRoll } from "../services/support.js";

export async function onManeuver(event, target) {
  const { poste, occupant } = this._runtime(target);
  const sys = this.document.system;
  const wounds = Math.max(0, (sys.wounds?.value ?? 0) - (sys.wounds?.ignored ?? 0));
  if (!sys.driver?.skill) return ui.notifications.warn("Compétence de manœuvre non définie : à choisir dans l'onglet Conception.");
  if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
  await rollTrait(occupant, sys.driver.skill, [
    { label: "Maniabilité", value: toInt(sys.handling) },
    { label: "Blessures du véhicule", value: -Math.min(wounds, 3) },
    ...this._jokerMods(poste),
    ...(await this._takeSupport(poste))
  ]);
}

export async function onPosteSkill(event, target) {
  const { poste, occupant } = this._runtime(target);
  if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
  await rollTrait(occupant, poste?.skill, [...this._jokerMods(poste), ...(await this._takeSupport(poste))]);
}

/** Jet de groupe du soutien (voir groupRoll). */
export async function onGroupRoll(event, target) {
  const { poste } = this._runtime(target);
  if (!(game.user.isGM || this.document.isOwner)) return;
  await groupRoll(this.document, poste?.id, target.dataset.supportId);
}

export async function onFire(event, target) {
  const { occupant } = this._runtime(target);
  const weapon = this.document.items.get(target.dataset.itemId);
  if (!weapon) return;
  if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
  const support = [...this._jokerMods(this._runtime(target).poste), ...(await this._takeSupport(this._runtime(target).poste))];
  if (useSwadeToolsWeapons()) return fireViaSwadeTools(this.document, weapon, occupant, support);
  if (await nativeItemAction(weapon, occupant, "formula", support)) return;
  await rollTrait(occupant, weapon.system.actions?.trait || "Shooting", [
    { label: stripClasse(weapon.name), value: toInt(weapon.system.actions?.traitMod) },
    ...support
  ], { rof: toInt(weapon.system.rof) });
}

export async function onDamage(event, target) {
  const weapon = this.document.items.get(target.dataset.itemId);
  if (!weapon) return;
  if (heavyMetalCombat(this.document)) {
    const weaponClass = weapon.getFlag(MODULE_ID, "classe") || computeWeaponClasse(weapon);
    if (weaponClass) {
      const { occupant } = this._runtime(target);
      return openHeavyMetalDialog({ attacker: this.document, weapon, weaponClass, occupant });
    }
    ui.notifications.info(`${stripClasse(weapon.name)} n'a pas de Classe : dégâts classiques.`);
  }
  const { occupant: shooter, poste: shooterPoste } = this._runtime(target);
  const energyDmg = weapon.getFlag(MODULE_ID, "energy") ? powerMods(this.document).weaponDamage : 0;
  const energyMods = [...(energyDmg ? [{ label: "Gestion de l'énergie", value: energyDmg }] : []), ...this._jokerMods(shooterPoste)];
  if (await nativeItemAction(weapon, shooter ?? this.document, "damage", energyMods)) return;
  const flat = energyMods.reduce((t, m) => t + m.value, 0);
  if (!flat && typeof weapon.rollDamage === "function") return weapon.rollDamage();
  const roll = await new Roll([weapon.system.damage || "0", flat ? String(flat) : null].filter(Boolean).join(" + ")).evaluate();
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: this.document }),
    flavor: `Dégâts · ${stripClasse(weapon.name)}`
  });
}

/** Dégâts Heavy Metal à la demande, en combat ou non (jet ponctuel). */
export async function onDamageHM(event, target) {
  const weapon = this.document.items.get(target.dataset.itemId);
  if (!weapon) return;
  const weaponClass = weapon.getFlag(MODULE_ID, "classe") || computeWeaponClasse(weapon);
  if (!weaponClass) return ui.notifications.warn(`${stripClasse(weapon.name)} n'a pas de Classe.`);
  const { occupant } = this._runtime(target);
  return openHeavyMetalDialog({ attacker: this.document, weapon, weaponClass, occupant });
}

export async function onWeaponAction(event, target) {
  const { occupant } = this._runtime(target);
  const weapon = this.document.items.get(target.dataset.itemId);
  const actionId = target.dataset.actionId;
  const a = weapon?.system.actions?.additional?.[actionId];
  if (!a) return;
  if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
  const runPoste = this._runtime(target).poste;
  const support = [...this._jokerMods(runPoste), ...(a.type === "damage" ? [] : await this._takeSupport(runPoste))];
  if (a.type !== "damage" && useSwadeToolsWeapons()) return fireViaSwadeTools(this.document, weapon, occupant, support);
  if (await nativeItemAction(weapon, occupant, actionId, support)) return;

  // Repli : calcul du module (cadence, munitions, modificateur ou surcharge de dégâts).
  if (a.type === "damage") {
    const formula = [a.dmgOverride || weapon.system.damage || "0", a.modifier].filter(Boolean).join(" + ");
    const roll = await new Roll(formula).evaluate();
    return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: occupant }), flavor: `${stripClasse(weapon.name)} · ${a.name}` });
  }
  if (!(await consumeShots(weapon, toInt(a.resourcesUsed)))) return;
  await rollTrait(occupant, a.override || weapon.system.actions?.trait || "Shooting", [
    { label: stripClasse(weapon.name), value: toInt(weapon.system.actions?.traitMod) },
    { label: a.name, value: toInt(a.modifier) },
    ...support
  ], { rof: toInt(a.dice) || toInt(weapon.system.rof) });
}

export async function onModAction(event, target) {
  const { occupant } = this._runtime(target);
  const item = this.document.items.get(target.dataset.itemId);
  if (!item) return;
  const id = target.dataset.actionId;
  if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
  const modPoste = this._runtime(target).poste;
  const support = [...this._jokerMods(modPoste), ...(await this._takeSupport(modPoste))];
  if (await nativeItemAction(item, occupant, id === "__main" ? "formula" : id, support)) return;
  if (id === "__main") {
    return rollTrait(occupant, item.system.actions.trait, [
      { label: item.name, value: toInt(item.system.actions.traitMod) }, ...support
    ]);
  }
  const a = item.system.actions?.additional?.[id];
  if (!a) return;
  await rollTrait(occupant, a.override || item.system.actions?.trait, [
    { label: a.name, value: toInt(a.modifier) }, ...support
  ]);
}
