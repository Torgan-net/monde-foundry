/**
 * SWADE Vehicle – Fiche véhicule · v0.4.0 (version de test)
 * Foundry VTT v14 · système SWADE 6.x
 *
 * Écritures sur l'acteur véhicule :
 *  - flags.swade-vehicle.*          (postes, occupants, Classe forcée) : propres au module
 *  - system.crew.members            (synchronisé avec les postes, voir _buildCrew)
 *  - system.status.* / system.wounds.value (boutons MJ, une valeur à la fois)
 *  - effets Distrait / Vulnérable sur les membres d'équipage (marqués flags.swade-vehicle.vehicle)
 *  - system.driver.skill (compétence de manœuvre, onglet Conception)
 *  - name (champ Nom de l'onglet Conception)
 *  - system.crew.required.max, system.crew.optional.{max,value} (onglet Conception)
 *  - flags.swade-vehicle.supportBonus (bonus de soutien en attente par poste)
 *  - flags.swade-vehicle.journal (ajouté dans la même mise à jour, hook preUpdateActor, 200 entrées max)
 *  - flags.swade-vehicle.crits + un effet actif « Dégradations critiques » (Maniabilité, Vitesse)
 *  - états natifs Distrait / Secoué posés sur l'équipage par les tables
 *  - caractéristiques techniques de TECH_FIELDS (onglet Conception, une valeur à la fois)
 *  - system.cargo.max, system.mods.max, system.energy.{enabled,max,value} (onglet Conception, valeurs validées)
 * Aucune autre donnée système n'est écrite. Les inputs n'ont pas d'attribut `name`,
 * donc la soumission de formulaire de la fiche n'écrit jamais rien.
 */

const MODULE_ID = "swade-vehicle";
const VERSION = "0.4.0";

const ROLE_BY_TYPE = { pilote: "operator", artilleur: "gunner", autre: "other" };
const TYPE_BY_ROLE = { operator: "pilote", gunner: "artilleur", other: "autre" };
const TYPE_LABEL = { pilote: "Pilote", artilleur: "Artilleur", autre: "Autre" };
const ROLE_PRIORITY = { operator: 3, gunner: 2, other: 1 };
const STATUS = [
  ["isOutOfControl", "Hors de contrôle"],
  ["isWrecked", "Épave"],
  ["isDistracted", "Distrait"],
  ["isVulnerable", "Vulnérable"]
];
const CLASSE_RE = /\s*\((?:class|classe)\s+([IVX]+)\)\s*/i;
const DEFAULT_IMG = "icons/svg/mystery-man.svg";

/** Échelle d'après la Taille (table Taille et Échelle du livre de base). */
function scaleForSize(size) {
  const n = Number(size) || 0;
  if (n <= -4) return -6;
  if (n <= -2) return -4;
  if (n === -1) return -2;
  if (n <= 3) return 0;
  if (n <= 7) return 2;
  if (n <= 11) return 4;
  return 6;
}

/**
 * Blessures max d'après la Taille : 3 de base, +1 Grand (4–7), +2 Énorme (8–11), +3 Gargantuesque (12–20),
 * puis 8, 10 et 12 pour Gargantuesque +1 (21–28), +2 (29–36) et +3 (37+) du Compagnon Science-Fiction.
 */
function woundsForSize(size) {
  const n = Number(size) || 0;
  if (n >= 37) return 12;
  if (n >= 29) return 10;
  if (n >= 21) return 8;
  return 3 + (n >= 12 ? 3 : n >= 8 ? 2 : n >= 4 ? 1 : 0);
}

/** Caractéristiques modifiables depuis l'onglet Conception : chemin système → type de valeur. */
const TECH_FIELDS = {
  "classification": "text",
  "size": "int",
  "scale": "signed",
  "handling": "signed",
  "topspeed.value": "int",
  "topspeed.unit": "text",
  "toughness.total": "int",
  "toughness.armor": "int",
  "wounds.max": "int",
  "cost": "int"
};

/** Compétences de manœuvre : valeur stockée dans system.driver.skill (nom anglais natif) → libellé VF. */
const MANEUVER_SKILLS = { Piloting: "Pilotage", Driving: "Conduite", Boating: "Navigation" };
const maneuverLabel = (skill) => (skill ? (MANEUVER_SKILLS[skill] ?? skill) : null);

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/**
 * Calcul des Classes (Heavy Metal, Compagnon Science-Fiction, « Calculating Class »).
 * La Classe n'est JAMAIS lue dans le nom de l'acteur ou de l'objet.
 *  - Arme : dégâts moyens des dés + PA, arrondi au supérieur. Les bonus fixes de la formule
 *    (le « +4 » de 3d6+4) ne sont pas comptés. Seules les armes lourdes ont une Classe.
 *    Le bonus de dégâts des armes liées n'est pas compté (il n'est pas dans system.damage).
 *  - Véhicule : Résistance totale, Armure comprise.
 */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

function classeFromValue(value, firstMax) {
  if (!Number.isFinite(value) || value < 1) return null;
  const index = value <= firstMax ? 0 : Math.min(6, Math.ceil((value - firstMax) / 10));
  return ROMAN[index];
}

/** Moyenne des dés d'une formule de dégâts simple (NdX ± constantes, constantes ignorées). null si non reconnue. */
function averageDamage(formula) {
  const f = String(formula ?? "").replace(/\s+/g, "").toLowerCase();
  if (!f) return null;
  const terms = f.match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    const dice = body.match(/^(\d*)d(\d+)$/);
    if (dice) total += sign * (Number(dice[1] || 1) * (Number(dice[2]) + 1) / 2);
    else if (/^\d+$/.test(body)) continue; // bonus fixe : non compté
    else return null; // @str, x2, etc. : non gérés
  }
  return total;
}

function weaponClasseValue(item) {
  if (!item?.system?.isHeavyWeapon) return null;
  const avg = averageDamage(item.system.damage);
  if (avg === null) return null;
  return Math.ceil(avg + (Number(item.system.ap) || 0));
}

function computeWeaponClasse(item) {
  return classeFromValue(weaponClasseValue(item), 20);
}

function computeVehicleClasse(actor) {
  return classeFromValue(Number(actor?.system?.toughness?.total), 15);
}

/** Retire « (Class IV) » / « (Classe V) » du nom affiché. Affichage seulement : la Classe n'est jamais lue dans le nom. */
const stripClasse = (name) => (name ?? "").replace(CLASSE_RE, " ").trim();

function toInt(v) {
  const n = parseInt(String(v ?? "").replace("−", "-").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function resolveDoc(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

function actorFromUuid(uuid) {
  const doc = resolveDoc(uuid);
  if (!doc) return null;
  if (doc instanceof Actor) return doc;
  return doc.actor ?? null; // TokenDocument
}

function tokenImg(uuid) {
  const doc = resolveDoc(uuid);
  if (!doc) return DEFAULT_IMG;
  if (doc instanceof Actor) return doc.prototypeToken?.texture?.src || doc.img || DEFAULT_IMG;
  return doc.texture?.src || doc.actor?.img || DEFAULT_IMG;
}

function findSkill(actor, key) {
  if (!actor || !key) return null;
  const k = String(key).toLowerCase().trim();
  return actor.items.find((i) => i.type === "skill"
    && (i.system?.swid === k || i.name.toLowerCase() === k)) ?? null;
}

async function rollTrait(actor, key, mods = [], { rof } = {}) {
  if (!actor) return ui.notifications.warn("Aucun occupant à ce poste.");
  const additionalMods = mods
    .filter((m) => m.value)
    .map((m) => ({ label: m.label, value: m.value }));
  const skill = findSkill(actor, key);
  const options = { additionalMods };
  if (rof > 1) options.rof = rof;
  if (skill) return actor.rollSkill(skill.id, options);
  if (typeof actor.makeUnskilledAttempt === "function") {
    ui.notifications.info(`${actor.name} n'a pas la compétence « ${key} » : jet sans compétence.`);
    return actor.makeUnskilledAttempt({ additionalMods });
  }
  ui.notifications.warn(`${actor.name} n'a pas la compétence « ${key} ».`);
}

/**
 * Action d'objet par le pipeline natif de SWADE (celui des cartes d'objet du chat) :
 * cadence (dés de Tir), munitions consommées, modificateurs et surcharges de l'action,
 * jets de dégâts. L'occupant du poste sert d'acteur, l'objet reste celui du véhicule.
 * actionId : "formula" (action principale), "damage" (dégâts) ou clé de actions.additional.
 * Renvoie false si le pipeline n'est pas disponible, pour basculer sur le calcul du module.
 */
async function nativeItemAction(item, actor, actionId, mods = []) {
  const helper = game.swade?.itemChatCardHelper ?? game.swade?.ItemChatCardHelper;
  if (!actor || typeof helper?.handleAction !== "function") return false;
  try {
    // 4e argument obligatoire (SWADE 6 lit options.additionalMods).
    await helper.handleAction(item, actor, actionId, { additionalMods: mods });
    console.debug(`${MODULE_ID} | action « ${actionId} » de ${item.name} jouée par le pipeline SWADE pour ${actor.name}`);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | pipeline SWADE en échec pour « ${actionId} », calcul du module à la place`, err);
    return false;
  }
}

/** Décompte de munitions pour le calcul de repli (le pipeline natif s'en charge lui-même). */
async function consumeShots(item, count) {
  const s = item.system;
  if (!count || !s.shots) return true;
  if ((s.currentShots ?? 0) < count) {
    ui.notifications.warn(`${item.name} : munitions insuffisantes (${s.currentShots ?? 0} pour ${count}).`);
    return false;
  }
  await item.update({ "system.currentShots": s.currentShots - count });
  return true;
}

function getDragData(event) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try { return TE.getDragEventData(event); } catch { return null; }
}

const randomId = () => foundry.utils.randomID(8);

/** États actifs d'un acteur, avec libellé localisé et icône. */
function actorStatuses(actor) {
  if (!actor?.statuses?.size) return [];
  return [...actor.statuses]
    .map((id) => CONFIG.statusEffects.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => ({ id: e.id, label: game.i18n.localize(e.name ?? e.label ?? e.id), img: e.img ?? e.icon }));
}

/* ------------------------------------------------------------------ */
/* Heavy Metal : résolution des dégâts (CSF, « Heavy Metal »)          */
/* ------------------------------------------------------------------ */

const WARHEADS = {
  "": "Aucune",
  ap: "Perforante (AP)",
  emp: "IEM (EMP)",
  he: "Explosive (HE)",
  nuclear: "Nucléaire",
  phase: "Phase",
  plasma: "Plasma"
};

const romanToInt = (r) => (r ? ROMAN.indexOf(String(r).toUpperCase()) + 1 : 0);
const intToRoman = (n) => ROMAN[Math.min(Math.max(n, 1), 7) - 1];

/**
 * Résout une attaque Heavy Metal qui a touché.
 * @param {object} o
 * @param {string} o.weaponClass   Classe de l'arme (I à VII) ; en collision, Classe du véhicule qui percute
 * @param {string} o.targetClass   Classe de la cible (I à VII)
 * @param {boolean} [o.raise]      Prouesse sur le jet d'attaque (ou d'éperonnage)
 * @param {string} [o.warhead]     clé de WARHEADS
 * @param {number} [o.targetArmor] Armure de la cible (ogive perforante)
 * @param {number} [o.d3]          résultat du d3 si un d3 est nécessaire (sinon tiré ici)
 * @returns {{noEffect:boolean, wounds:number, maneuver:boolean, extraCritical:boolean,
 *            electronicsOut:boolean, steps:string[], weaponClass:string, targetClass:string}}
 */
function resolveHeavyMetal({ weaponClass, targetClass, raise = false, warhead = "", targetArmor = 0, d3 } = {}) {
  let w = romanToInt(weaponClass);
  let t = romanToInt(targetClass);
  if (!w || !t) throw new Error("Classe d'arme ou de cible manquante");
  const steps = [];

  if (warhead === "ap" && targetArmor >= 10 && t > 1) { t -= 1; steps.push(`ogive perforante : cible ramenée en Classe ${intToRoman(t)}`); }
  if (warhead === "phase") { w = Math.min(w + 1, 7); steps.push(`ogive à phase : arme portée en Classe ${intToRoman(w)}`); }

  const diff = w - t;
  if (warhead === "nuclear") {
    steps.push("ogive nucléaire : 10 Blessures");
    return { noEffect: false, wounds: 10, maneuver: true, extraCritical: false, electronicsOut: false,
      steps, weaponClass: intToRoman(w), targetClass: intToRoman(t) };
  }
  if (diff <= -2) {
    steps.push(`Classe ${intToRoman(w)} contre ${intToRoman(t)} : aucun effet`);
    return { noEffect: true, wounds: 0, maneuver: false, extraCritical: false, electronicsOut: false,
      steps, weaponClass: intToRoman(w), targetClass: intToRoman(t) };
  }

  let wounds = 0;
  if (diff === -1) {
    steps.push(`Classe ${intToRoman(w)} contre ${intToRoman(t)} : 0 Blessure`);
  } else {
    const roll = Number.isFinite(d3) ? d3 : Math.ceil(Math.random() * 3);
    wounds = roll + diff;
    steps.push(diff === 0
      ? `Classes égales : d3 = ${roll}`
      : `d3 = ${roll}, +${diff} (arme ${diff} Classe${diff > 1 ? "s" : ""} au-dessus)`);
  }

  if (raise) {
    const bonus = warhead === "plasma" ? 2 : 1;
    wounds += bonus;
    steps.push(`Prouesse : +${bonus}${warhead === "plasma" ? " (plasma)" : ""}`);
  }

  let extraCritical = false;
  if (warhead === "he") {
    wounds = Math.max(0, wounds - 1);
    extraCritical = wounds > 0;
    steps.push(`ogive explosive : −1 Blessure${extraCritical ? ", une Dégradation critique supplémentaire" : ""}`);
  }

  let electronicsOut = false;
  if (warhead === "emp" && wounds > 0) {
    electronicsOut = true;
    wounds = Math.max(0, wounds - 2);
    steps.push("ogive IEM : électronique hors service, −2 Blessures");
  }

  steps.push("le pilote de la cible doit réussir un jet de manœuvre, sinon Perte de contrôle");
  return { noEffect: false, wounds, maneuver: true, extraCritical, electronicsOut,
    steps, weaponClass: intToRoman(w), targetClass: intToRoman(t) };
}

/* ------------------------------------------------------------------ */
/* Heavy Metal : combat, dialogue de résolution, message de chat       */
/* ------------------------------------------------------------------ */

/** Combat marqué Heavy Metal dans lequel l'acteur est engagé, sinon null. */
function heavyMetalCombat(actor) {
  if (!actor) return null;
  for (const combat of game.combats ?? []) {
    if (!combat.getFlag(MODULE_ID, "heavyMetal")) continue;
    if (combat.combatants.some((c) => c.actorId === actor.id || c.actor?.uuid === actor.uuid)) return combat;
  }
  return null;
}

/** Premier combat (Heavy Metal ou non) dans lequel l'acteur est engagé. */
function actorCombat(actor) {
  if (!actor) return null;
  return [...(game.combats ?? [])].find((combat) =>
    combat.combatants.some((c) => c.actorId === actor.id || c.actor?.uuid === actor.uuid)) ?? null;
}

/** Classe d'une cible : véhicule = Classe forcée ou calculée ; autre acteur = aucune. */
function targetClasse(actor) {
  if (actor?.type !== "vehicle") return null;
  return actor.getFlag(MODULE_ID, "classeOverride") || computeVehicleClasse(actor);
}

const escapeHTML = (t) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(t ?? "")) : String(t ?? ""));

async function openHeavyMetalDialog({ attacker, weapon, weaponClass, occupant, preset = {} }) {
  const targets = [...game.user.targets].map((t) => t.actor).filter(Boolean);
  const romanOpts = (sel) => ROMAN.map((r) => `<option value="${r}" ${r === sel ? "selected" : ""}>${r}</option>`).join("");
  const targetOpts = targets.map((a, i) => {
    const c = targetClasse(a);
    return `<option value="${i}" ${String(i) === preset.target ? "selected" : ""}>${escapeHTML(a.name)} (${c ? "Classe " + c : "sans Classe"})</option>`;
  }).join("");
  const warhead = preset.warhead ?? weapon.getFlag(MODULE_ID, "warhead") ?? "";
  const content = `<div class="swv-hm-form">
    <p>Arme : <strong>${escapeHTML(stripClasse(weapon.name))}</strong></p>
    <label>Classe de l'arme <select name="weaponClass">${romanOpts(preset.weaponClass ?? weaponClass)}</select></label>
    <label>Cible <select name="target">${targetOpts}<option value="none" ${targets.length ? "" : "selected"}>Aucune cible : Classe à préciser</option></select></label>
    <label>Classe de la cible <select name="targetClass"><option value="">selon la cible</option>${romanOpts(preset.targetClass ?? "")}</select></label>
    <label>Armure de la cible (ogive perforante) <input type="number" name="armor" min="0" step="1" value="${preset.armor ?? ""}" placeholder="selon la cible"></label>
    <label>Ogive <select name="warhead">${Object.entries(WARHEADS).map(([k, l]) => `<option value="${k}" ${k === warhead ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="swv-hm-check"><input type="checkbox" name="raise" ${preset.raise ? "checked" : ""}> Prouesse sur le jet d'attaque</label>
  </div>`;

  let data;
  try {
    data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Dégâts Heavy Metal" },
      content,
      ok: {
        label: "Résoudre",
        callback: (ev, button) => {
          const f = button.form.elements;
          return { weaponClass: f.weaponClass.value, target: f.target.value, targetClass: f.targetClass.value,
            armor: f.armor.value, warhead: f.warhead.value, raise: f.raise.checked };
        }
      }
    });
  } catch { return; }
  if (!data) return;

  const targetActor = data.target === "none" ? null : (targets[Number(data.target)] ?? null);
  const tClass = data.targetClass || targetClasse(targetActor);
  if (!tClass) {
    ui.notifications.warn("La cible n'a pas de Classe : choisissez-la.");
    return openHeavyMetalDialog({ attacker, weapon, weaponClass, occupant, preset: data });
  }
  const armor = data.armor !== "" ? toInt(data.armor) : (targetActor?.system?.toughness?.armor ?? 0);
  const d3 = await new Roll("1d3").evaluate();
  const r = resolveHeavyMetal({ weaponClass: data.weaponClass, targetClass: tClass, raise: data.raise,
    warhead: data.warhead, targetArmor: armor, d3: d3.total });
  const usedD3 = !r.noEffect && data.warhead !== "nuclear" && romanToInt(r.weaponClass) >= romanToInt(r.targetClass);

  const result = r.noEffect ? "Aucun effet"
    : `${r.wounds} Blessure${r.wounds > 1 ? "s" : ""}${r.extraCritical ? " · +1 Dégradation critique" : ""}${r.electronicsOut ? " · électronique hors service" : ""}`;
  const html = `<div class="swv-hm-card">
    <h3>Heavy Metal · ${escapeHTML(stripClasse(weapon.name))}</h3>
    <p>Classe ${r.weaponClass} contre ${targetActor ? escapeHTML(targetActor.name) + ", " : ""}Classe ${r.targetClass}</p>
    <ul>${r.steps.map((st) => `<li>${escapeHTML(st)}</li>`).join("")}</ul>
    <p class="swv-hm-result">${result}</p>
    ${targetActor && r.wounds > 0 ? `<button type="button" data-swv-apply>Appliquer ${r.wounds} Blessure${r.wounds > 1 ? "s" : ""} et la Dégradation critique (MJ)</button>` : ""}
    ${targetActor?.type === "vehicle" && r.maneuver ? `<button type="button" data-swv-ooc>Manœuvre ratée : Perte de contrôle (MJ)</button>` : ""}
  </div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: occupant ?? attacker }),
    content: html,
    rolls: usedD3 ? [d3] : [],
    flags: { [MODULE_ID]: { hm: { targetUuid: targetActor?.uuid ?? null, wounds: r.wounds, applied: false } } }
  });
}

/** Bouton « Appliquer » des messages Heavy Metal (MJ uniquement, une seule fois). */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const hm = message.getFlag(MODULE_ID, "hm");
  const ooc = hm && html.querySelector?.("[data-swv-ooc]");
  if (ooc) {
    if (!game.user.isGM || hm.oocDone) ooc.disabled = true;
    else ooc.addEventListener("click", async () => {
      ooc.disabled = true;
      const target = actorFromUuid(hm.targetUuid);
      if (!target) return ui.notifications.warn("Cible introuvable.");
      await message.setFlag(MODULE_ID, "hm.oocDone", true);
      await applyOutOfControl(target);
    });
  }
  const btn = hm && html.querySelector?.("[data-swv-apply]");
  if (!btn) return;
  if (hm.applied) { btn.disabled = true; btn.textContent = "Blessures appliquées"; return; }
  if (!game.user.isGM) { btn.disabled = true; return; }
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const target = actorFromUuid(hm.targetUuid);
    if (!target) { btn.disabled = false; return ui.notifications.warn("Cible introuvable."); }
    const w = target.system?.wounds ?? {};
    const next = (w.value ?? 0) + hm.wounds;
    await target.update({ "system.wounds.value": Math.min(next, w.max ?? next) }, { swvReason: "Heavy Metal" });
    if (w.max !== undefined && next > w.max) ui.notifications.warn(`${target.name} dépasse ses Blessures maximales (${next} / ${w.max}).`);
    await message.setFlag(MODULE_ID, "hm.applied", true);
    if (target.type === "vehicle" && hm.wounds > 0) await applyCritical(target);
  });
});

/** Case « Heavy Metal pour ce combat » dans le suivi de combat (MJ), badge pour les joueurs. */
Hooks.on("renderCombatTracker", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.querySelectorAll(".swv-hm-toggle").forEach((el) => el.remove());
  const combat = app.viewed ?? game.combat;
  if (!combat) return;
  const active = !!combat.getFlag(MODULE_ID, "heavyMetal");
  let el;
  if (game.user.isGM) {
    el = document.createElement("label");
    el.innerHTML = `<input type="checkbox" ${active ? "checked" : ""}> Heavy Metal pour ce combat`;
    el.querySelector("input").addEventListener("change", (ev) => combat.setFlag(MODULE_ID, "heavyMetal", ev.currentTarget.checked));
  } else if (active) {
    el = document.createElement("div");
    el.textContent = "Heavy Metal";
  } else return;
  el.className = `swv-hm-toggle${active ? " is-active" : ""}`;
  const header = root.querySelector(".combat-tracker-header") ?? root.querySelector("header");
  console.debug(`${MODULE_ID} | case Heavy Metal insérée dans`, header?.className ?? "racine du suivi");
  if (header) header.append(el); else root.prepend(el);
});

/* ------------------------------------------------------------------ */
/* Distrait / Vulnérable : propagation à l'équipage                    */
/* ------------------------------------------------------------------ */

/** États du véhicule propagés à chaque membre d'équipage (system.crew.members). */
const CREW_STATUS = {
  isDistracted: ["distracted", "distr"],
  isVulnerable: ["vulnerable", "vuln"]
};

function resolveStatusId(key) {
  const ids = new Set(CONFIG.statusEffects.map((e) => e.id));
  const id = CREW_STATUS[key].find((c) => ids.has(c));
  if (!id) console.warn(`${MODULE_ID} | état introuvable dans CONFIG.statusEffects pour ${key}`, [...ids]);
  return id ?? null;
}

const isResponsibleGM = () => (game.users.activeGM ? game.users.activeGM.isSelf : game.user.isGM);

function crewActors(vehicle) {
  const uuids = new Set((vehicle.system?.crew?.members ?? []).map((m) => m.uuid).filter(Boolean));
  return [...uuids].map((uuid) => ({ uuid, actor: actorFromUuid(uuid) })).filter((e) => e.actor);
}

/** Effets posés par CE véhicule sur un acteur, pour un état donné. */
function vehicleEffects(actor, vehicleUuid, statusId) {
  return actor.effects.filter((e) => e.getFlag(MODULE_ID, "vehicle") === vehicleUuid && e.statuses?.has(statusId));
}

/**
 * Aligne les effets de l'équipage sur les états du véhicule.
 * - Pose l'état sur chaque membre quand il est actif sur le véhicule.
 * - Le retire quand il ne l'est plus, ou quand le membre quitte le véhicule.
 * Seuls les effets marqués comme venant de ce véhicule sont retirés : un état
 * que le personnage avait déjà pour une autre raison n'est jamais touché.
 */
async function syncCrewStatus(vehicle, { removeAll = false } = {}) {
  const applied = foundry.utils.deepClone(vehicle.getFlag(MODULE_ID, "crewStatus") ?? {});
  const crew = removeAll ? [] : crewActors(vehicle);
  let changed = false;

  for (const key of Object.keys(CREW_STATUS)) {
    const statusId = resolveStatusId(key);
    if (!statusId) continue;
    const active = !removeAll && !!vehicle.system?.status?.[key];
    const wanted = new Set(active ? crew.map((c) => c.uuid) : []);
    const before = new Set(applied[key] ?? []);

    for (const uuid of before) {
      if (wanted.has(uuid)) continue;
      const actor = actorFromUuid(uuid);
      const ours = actor ? vehicleEffects(actor, vehicle.uuid, statusId) : [];
      if (ours.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ours.map((e) => e.id));
    }
    for (const { uuid, actor } of crew) {
      if (!wanted.has(uuid) || vehicleEffects(actor, vehicle.uuid, statusId).length) continue;
      // Déjà servi pour cette activation de l'état : si l'effet a expiré entre-temps (fin de tour gérée
      // par SWADE), on ne le repose pas. Il ne sera reposé qu'après une désactivation puis réactivation.
      if (before.has(uuid)) continue;
      if (actor.statuses?.has(statusId)) continue; // déjà dans cet état pour une autre raison : pas de doublon
      const effect = await ActiveEffect.implementation.fromStatusEffect(statusId);
      const data = effect.toObject();
      data.origin = vehicle.uuid;
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.vehicle`, vehicle.uuid);
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }
    const after = [...wanted];
    if (after.join() !== [...before].join()) { applied[key] = after; changed = true; }
  }
  if (changed && !removeAll) await vehicle.setFlag(MODULE_ID, "crewStatus", applied);
}

Hooks.on("updateActor", (actor, changes) => {
  if (actor.type !== "vehicle" || !isResponsibleGM()) return;
  const statusChanged = Object.keys(CREW_STATUS).some((k) => foundry.utils.hasProperty(changes, `system.status.${k}`));
  const crewChanged = foundry.utils.hasProperty(changes, "system.crew.members");
  if (statusChanged || crewChanged) syncCrewStatus(actor).catch((err) => console.error(`${MODULE_ID} |`, err));
});

Hooks.on("deleteActor", (actor) => {
  if (actor.type !== "vehicle" || !isResponsibleGM()) return;
  syncCrewStatus(actor, { removeAll: true }).catch((err) => console.error(`${MODULE_ID} |`, err));
});

/* ------------------------------------------------------------------ */
/* Journal du véhicule                                                  */
/* ------------------------------------------------------------------ */

const JOURNAL_MAX = 200;
const nameOf = (uuid) => actorFromUuid(uuid)?.name ?? "acteur introuvable";

/** Événements notables d'une mise à jour de véhicule, comparés à l'état avant la mise à jour. */
function journalEntriesFor(actor, changes, options) {
  const out = [];
  const get = (path) => foundry.utils.getProperty(changes, path);
  const sys = actor.system ?? {};
  const reason = options?.swvReason ? ` (${options.swvReason})` : "";

  const wounds = get("system.wounds.value");
  if (wounds !== undefined && wounds !== (sys.wounds?.value ?? 0)) {
    const before = sys.wounds?.value ?? 0;
    const delta = wounds - before;
    out.push(`Blessures ${before} → ${wounds} (${delta > 0 ? "+" : ""}${delta})${reason}`);
  }
  for (const [key, label] of STATUS) {
    const v = get(`system.status.${key}`);
    if (v !== undefined && !!v !== !!sys.status?.[key]) out.push(`${label} : ${v ? "activé" : "levé"}`);
  }
  const energy = get("system.energy.value");
  if (energy !== undefined && energy !== (sys.energy?.value ?? 0)) out.push(`Énergie ${sys.energy?.value ?? 0} → ${energy}${reason}`);

  const postes = get(`flags.${MODULE_ID}.postes`);
  if (Array.isArray(postes)) {
    const old = actor.getFlag(MODULE_ID, "postes") ?? [];
    for (const p of postes) {
      const before = old.find((o) => o.id === p.id)?.occupant ?? null;
      const after = p.occupant ?? null;
      if (before === after) continue;
      if (before) out.push(`${nameOf(before)} quitte le poste ${p.label}`);
      if (after) out.push(`${nameOf(after)} prend le poste ${p.label}`);
    }
    for (const o of old) {
      if (o.occupant && !postes.some((p) => p.id === o.id)) out.push(`Poste ${o.label} supprimé (${nameOf(o.occupant)} en est retiré)`);
    }
  }
  if (changes.name && changes.name !== actor.name) out.push(`Renommé : ${actor.name} → ${changes.name}`);
  return out;
}

/** Ajoute les entrées au journal dans la même mise à jour : pas d'écriture supplémentaire. */
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (actor.type !== "vehicle") return;
  const texts = journalEntriesFor(actor, changes, options);
  if (!texts.length) return;
  const journal = [...(actor.getFlag(MODULE_ID, "journal") ?? [])];
  const t = Date.now();
  const u = game.users.get(userId)?.name ?? "";
  for (const text of texts) journal.push({ t, u, text });
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.journal`, journal.slice(-JOURNAL_MAX));
});

/* ------------------------------------------------------------------ */
/* Perte de contrôle et Dégradations critiques                          */
/* ------------------------------------------------------------------ */
/*
 * Le texte affiché vient des tables (paramètres du module). Les effets automatiques
 * sont déclenchés d'après la valeur du 2d6, indépendamment de la langue de la table.
 */

const DEFAULT_TABLES = { outOfControl: "RollTable.9HXQfcM65ad4bD8M", critical: "RollTable.ocXkPAdHHDF3gwCb" };
const CRIT_MAX = { handling: 4, speed: 4 }; // −4 de Maniabilité ; −40 % de Vitesse (plancher 60 %)

function statusIdFor(...candidates) {
  const ids = new Set(CONFIG.statusEffects.map((e) => e.id));
  return candidates.find((c) => ids.has(c)) ?? null;
}

async function appendJournal(vehicle, texts) {
  if (!texts.length) return;
  const journal = [...(vehicle.getFlag(MODULE_ID, "journal") ?? [])];
  const t = Date.now();
  for (const text of texts) journal.push({ t, u: game.user.name, text });
  await vehicle.setFlag(MODULE_ID, "journal", journal.slice(-JOURNAL_MAX));
}

async function gmNote(vehicle, html) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: vehicle }),
    content: `<div class="swv-group-card">${html}</div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
  });
}

/**
 * Tire sur la table réglée et renvoie le total du 2d6 RÉELLEMENT utilisé par la table :
 * c'est ce total qui décide des effets, pour qu'ils correspondent toujours au texte affiché.
 * Sans table utilisable, le module lance lui-même 2d6.
 */
async function drawVehicleTable(settingKey, vehicle, flavor) {
  const uuid = game.settings.get(MODULE_ID, settingKey);
  let table = null;
  try { table = uuid ? await fromUuid(uuid) : null; } catch { table = null; }
  if (table instanceof RollTable) {
    if (String(table.formula ?? "").replace(/\s+/g, "").toLowerCase() !== "2d6") {
      ui.notifications.warn(`La table « ${table.name} » n'utilise pas 2d6 (${table.formula}) : les effets risquent de ne pas correspondre.`);
    }
    try {
      const draw = await table.draw({ displayChat: true });
      const total = draw?.roll?.total;
      if (Number.isFinite(total)) return total;
      console.warn(`${MODULE_ID} | tirage sur ${uuid} sans total exploitable`, draw);
    } catch (err) {
      console.warn(`${MODULE_ID} | tirage sur ${uuid} impossible`, err);
    }
  } else {
    ui.notifications.warn(`Table introuvable (${uuid || "non réglée"}) : jet affiché sans texte.`);
  }
  const roll = await new Roll("2d6").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flavor: `${flavor} · ${vehicle.name}` });
  return roll.total;
}

async function addVehicleWounds(vehicle, count, reason) {
  const w = vehicle.system?.wounds ?? {};
  const next = (w.value ?? 0) + count;
  await vehicle.update({ "system.wounds.value": Math.min(next, w.max ?? next) }, { swvReason: reason });
  if (w.max !== undefined && next > w.max) ui.notifications.warn(`${vehicle.name} dépasse ses Blessures maximales (${next} / ${w.max}).`);
}

/** Pose un état natif sur chaque membre d'équipage (durée gérée par SWADE). */
async function crewToggleStatus(vehicle, statusId) {
  if (!statusId) return [];
  const names = [];
  for (const { actor } of crewActors(vehicle)) {
    if (actor.statuses?.has(statusId)) continue;
    await actor.toggleStatusEffect(statusId, { active: true });
    names.push(actor.name);
  }
  return names;
}

/** Effet actif unique qui porte les malus cumulés de Maniabilité et de Vitesse. */
async function syncCritEffect(vehicle) {
  const crits = vehicle.getFlag(MODULE_ID, "crits") ?? {};
  const handling = Math.min(crits.handling ?? 0, CRIT_MAX.handling);
  const speed = Math.min(crits.speed ?? 0, CRIT_MAX.speed);
  const changes = [];
  if (handling) changes.push({ key: "system.handling", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(-handling) });
  if (speed) changes.push({ key: "system.topspeed.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: String(Math.round((1 - speed / 10) * 100) / 100) });
  const existing = vehicle.effects.find((e) => e.getFlag(MODULE_ID, "crit"));
  if (!changes.length) {
    if (existing) await existing.delete();
    return;
  }
  const data = { name: "Dégradations critiques", img: "icons/svg/hazard.svg", changes, flags: { [MODULE_ID]: { crit: true } } };
  if (existing) await existing.update({ changes });
  else await vehicle.createEmbeddedDocuments("ActiveEffect", [data]);
}

/**
 * Une Dégradation critique.
 * @param {object} [o]
 * @param {boolean} [o.collision]   cause = collision (Équipage : occupants Secoués)
 * @param {boolean} [o.rerollCrew]  relancer les résultats « Équipage » (Perte de contrôle, 12)
 */
async function applyCritical(vehicle, { collision = false, rerollCrew = false } = {}) {
  let total = await drawVehicleTable("tableCritical", vehicle, "Dégradation critique");
  while (rerollCrew && (total === 9 || total === 10)) total = await drawVehicleTable("tableCritical", vehicle, "Dégradation critique (relance)");

  const crits = foundry.utils.mergeObject({ handling: 0, speed: 0, destroyed: [] }, foundry.utils.deepClone(vehicle.getFlag(MODULE_ID, "crits") ?? {}));
  const log = [];
  const chassis = (why) => log.push(`Dégradation critique (${total}) : châssis${why ? ", " + why : ""}, sans effet particulier`);

  if (total === 2) log.push("Dégradation critique (2) : égratignure, sans dégât permanent");
  else if (total === 3) {
    if (crits.handling < CRIT_MAX.handling) crits.handling += 1;
    log.push(`Dégradation critique (3) : guidage, Maniabilité −${crits.handling} au total`);
  } else if (total <= 5) {
    if (crits.speed < CRIT_MAX.speed) crits.speed += 1;
    log.push(`Dégradation critique (${total}) : propulsion, Vitesse max −${crits.speed * 10} % au total`);
  } else if (total <= 8) chassis();
  else if (total <= 10) {
    if (collision) {
      const names = await crewToggleStatus(vehicle, statusIdFor("shaken"));
      log.push(`Dégradation critique (${total}) : équipage, collision : occupants Secoués${names.length ? " (" + names.join(", ") + ")" : ""}`);
    } else {
      const crew = crewActors(vehicle);
      const victim = crew.length ? crew[Math.floor(Math.random() * crew.length)].actor : null;
      log.push(`Dégradation critique (${total}) : équipage, ${victim ? victim.name + " touché" : "aucun membre d'équipage"}`);
      await gmNote(vehicle, `<h3>Dégradation critique · équipage</h3>
        <p>${victim ? `<strong>${escapeHTML(victim.name)}</strong> est touché.` : "Aucun membre d'équipage à toucher."}</p>
        <p>Dégâts directs : retrancher l'Armure du véhicule si la position de la victime s'y prête. Arme à effet de zone : tous les occupants de la section choisie par le MJ.</p>`);
    }
  } else if (total === 11) {
    const intact = vehicle.items.filter((i) => i.type === "weapon" && i.system?.isVehicular && !crits.destroyed.includes(i.id));
    if (!intact.length) chassis("aucune arme à détruire");
    else {
      const w = intact[Math.floor(Math.random() * intact.length)];
      crits.destroyed.push(w.id);
      log.push(`Dégradation critique (11) : arme détruite, ${stripClasse(w.name)}`);
    }
  } else {
    log.push("Dégradation critique (12) : système perdu, au choix du MJ");
    await gmNote(vehicle, `<h3>Dégradation critique · système</h3><p>${escapeHTML(vehicle.name)} perd un système électronique ou un équipement au choix du MJ. Sans équipement particulier : effet Châssis.</p>`);
  }

  await vehicle.setFlag(MODULE_ID, "crits", crits);
  await syncCritEffect(vehicle);
  await appendJournal(vehicle, log);
  return total;
}

async function applyOutOfControl(vehicle) {
  const total = await drawVehicleTable("tableOutOfControl", vehicle, "Perte de contrôle");
  const log = [];
  const crewNames = () => { const n = crewActors(vehicle).map((c) => c.actor.name); return n.length ? ` (${n.join(", ")})` : ""; };
  if (total === 2) {
    await vehicle.update({ "system.status.isDistracted": true });
    const d4 = (await new Roll("1d4").evaluate()).total;
    log.push(`Perte de contrôle (2) : collision majeure, ${d4} Blessure${d4 > 1 ? "s" : ""}, véhicule et équipage Distraits${crewNames()} (à lever par le MJ)`);
    await appendJournal(vehicle, log);
    await addVehicleWounds(vehicle, d4, "collision majeure");
    await applyCritical(vehicle, { collision: true });
    return total;
  }
  if (total <= 4) {
    await appendJournal(vehicle, [`Perte de contrôle (${total}) : collision mineure, 1 Blessure`]);
    await addVehicleWounds(vehicle, 1, "collision mineure");
    await applyCritical(vehicle, { collision: true });
    return total;
  }
  if (total <= 9) {
    await vehicle.update({ "system.status.isDistracted": true });
    log.push(`Perte de contrôle (${total}) : embardée, véhicule et équipage Distraits${crewNames()} (à lever par le MJ)`);
  } else if (total <= 11) {
    await vehicle.update({ "system.status.isVulnerable": true });
    log.push(`Perte de contrôle (${total}) : véhicule et équipage Vulnérables (à lever par le MJ)`);
  } else {
    log.push("Perte de contrôle (12) : avarie, Dégradation critique (relance des résultats Équipage)");
    await appendJournal(vehicle, log);
    await applyCritical(vehicle, { rerollCrew: true });
    return total;
  }
  await appendJournal(vehicle, log);
  return total;
}

async function repairCriticals(vehicle) {
  const crits = vehicle.getFlag(MODULE_ID, "crits");
  if (!crits) return;
  await vehicle.unsetFlag(MODULE_ID, "crits");
  await syncCritEffect(vehicle);
  await appendJournal(vehicle, ["Réparations : Dégradations critiques effacées"]);
}

/* ------------------------------------------------------------------ */
/* Fiche                                                               */
/* ------------------------------------------------------------------ */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

class SwadeVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
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

  static DEFAULT_OPTIONS = {
    classes: ["swade-vehicle-sheet"],
    position: { width: 820, height: 880 },
    window: {
      resizable: true,
      controls: [{ icon: "fa-solid fa-sliders", label: "Fiche native SWADE (Tweaks)", action: "openNative" }]
    },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      switchTab: SwadeVehicleSheet._onSwitchTab,
      openNative: SwadeVehicleSheet._onOpenNative,
      openTweaks: SwadeVehicleSheet._onOpenTweaks,
      toggleCollapse: SwadeVehicleSheet._onToggleCollapse,
      groupRoll: SwadeVehicleSheet._onGroupRoll,
      collapseAll: SwadeVehicleSheet._onCollapseAll,
      damageHM: SwadeVehicleSheet._onDamageHM,
      toggleLock: SwadeVehicleSheet._onToggleLock,
      maneuver: SwadeVehicleSheet._onManeuver,
      posteSkill: SwadeVehicleSheet._onPosteSkill,
      fire: SwadeVehicleSheet._onFire,
      damage: SwadeVehicleSheet._onDamage,
      weaponAction: SwadeVehicleSheet._onWeaponAction,
      modAction: SwadeVehicleSheet._onModAction,
      toggleStatus: SwadeVehicleSheet._onToggleStatus,
      wound: SwadeVehicleSheet._onWound,
      addPoste: SwadeVehicleSheet._onAddPoste,
      deletePoste: SwadeVehicleSheet._onDeletePoste,
      clearOccupant: SwadeVehicleSheet._onClearOccupant,
      clearJournal: SwadeVehicleSheet._onClearJournal,
      spendEnergy: SwadeVehicleSheet._onSpendEnergy,
      rechargeEnergy: SwadeVehicleSheet._onRechargeEnergy,
      outOfControl: SwadeVehicleSheet._onOutOfControl,
      critical: SwadeVehicleSheet._onCritical,
      repair: SwadeVehicleSheet._onRepair,
      importCrew: SwadeVehicleSheet._onImportCrew,
      openItem: SwadeVehicleSheet._onOpenItem
    }
  };

  static PARTS = {
    sheet: {
      template: `modules/${MODULE_ID}/templates/vehicle-sheet.hbs`,
      scrollable: [".swv-body"]
    }
  };

  /* ---------------- Données ---------------- */

  get postes() {
    return foundry.utils.deepClone(this.document.getFlag(MODULE_ID, "postes") ?? []);
  }

  _weaponContext(item, canAct) {
    const s = item.system;
    const destroyed = (this.document.getFlag(MODULE_ID, "crits")?.destroyed ?? []).includes(item.id);
    if (destroyed) canAct = false;
    const parts = [s.damage, s.ap ? `PA ${s.ap}` : null, s.range, s.rof ? `CdT ${s.rof}` : null,
      s.isHeavyWeapon ? "ArmL" : null, s.shots ? `${s.currentShots} / ${s.shots}` : null].filter(Boolean);
    const actions = Object.entries(s.actions?.additional ?? {})
      .filter(([, a]) => a.type === "trait" || a.type === "damage")
      .map(([id, a]) => ({ id, name: a.name }));
    return {
      id: item.id,
      name: stripClasse(item.name),
      classe: item.getFlag(MODULE_ID, "classe") || computeWeaponClasse(item),
      stats: parts.join(" · "),
      actions,
      canAct,
      destroyed
    };
  }

  _modContext(item, canAct) {
    const s = item.system;
    const actions = [];
    if (s.actions?.trait) actions.push({ id: "__main", name: s.actions.trait });
    for (const [id, a] of Object.entries(s.actions?.additional ?? {})) {
      if (a.type === "trait") actions.push({ id, name: a.name });
    }
    const charge = s.charges?.hasCharges ? s.charges.charges?.[0] : null;
    return {
      id: item.id,
      name: item.name,
      charges: charge ? `${charge.value} / ${charge.max}` : null,
      actions,
      canAct
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const isGM = game.user.isGM;
    const postes = this.postes;

    const vehicular = actor.items.filter((i) => i.system?.isVehicular);
    const weaponsAll = vehicular.filter((i) => i.type === "weapon");
    const modsAll = vehicular.filter((i) => i.type !== "weapon");
    const cargo = actor.items.filter((i) => !i.system?.isVehicular && ("weight" in (i.system ?? {})));

    const modsUsed = vehicular.reduce((t, i) => t + toInt(i.system.mods) * (toInt(i.system.quantity) || 1), 0);
    const cargoUsed = cargo.reduce((t, i) => t + (Number(i.system.weight) || 0) * (toInt(i.system.quantity) || 1), 0);

    const woundsActive = Math.max(0, (sys.wounds?.value ?? 0) - (sys.wounds?.ignored ?? 0));
    const woundPenalty = -Math.min(woundsActive, 3);

    const occupants = new Set(postes.map((p) => p.occupant).filter(Boolean));
    // Équipage effectif : occupants distincts des postes + effectifs des groupes de soutien actifs.
    const supportCount = postes.reduce((t, p) => t + (p.support?.enabled ? Math.max(0, toInt(p.support.count)) : 0), 0);
    const crewCount = occupants.size + supportCount;
    const required = sys.crew?.required?.max ?? 0;

    const classeOverride = actor.getFlag(MODULE_ID, "classeOverride") ?? "";
    const classeAuto = computeVehicleClasse(actor);
    const classe = classeOverride || classeAuto;

    const postesCtx = postes.map((p) => {
      const occ = actorFromUuid(p.occupant);
      const canAct = isGM || !!occ?.isOwner;
      const mine = !isGM && !!occ?.isOwner;
      const ctx = {
        ...p,
        typeLabel: TYPE_LABEL[p.type] ?? p.type,
        isPilot: p.type === "pilote",
        isAutre: p.type === "autre" && !!p.skill,
        canAct,
        mine,
        occupant: p.occupant ? {
          uuid: p.occupant,
          name: occ?.name ?? "(introuvable)",
          img: tokenImg(p.occupant),
          missing: !occ,
          statuses: actorStatuses(occ)
        } : null,
        seatClass: mine ? "is-mine" : (occ ? "is-other" : ""),
        collapsed: this.collapsed.has(p.id),
        canGroup: isGM || actor.isOwner,
        supportPending: (() => {
          const b = actor.getFlag(MODULE_ID, `supportBonus.${p.id}`);
          return b?.value ? (b.value > 0 ? `+${b.value}` : `${b.value}`) : null;
        })(),
        supportText: p.support?.enabled
          ? `${p.support.count ?? 0} pers. · d${p.support.die || 6}${toInt(p.support.mod) ? (toInt(p.support.mod) > 0 ? " +" : " ") + toInt(p.support.mod) : ""} + dé Joker`
          : null,
        maneuverHint: sys.driver?.skill
          ? `${maneuverLabel(sys.driver.skill)} · Maniabilité ${sys.handling ?? 0} · Blessures ${woundPenalty}`
          : "compétence de manœuvre non définie (onglet Conception)",
        hasManeuverSkill: !!sys.driver?.skill,
        weapons: (p.weapons ?? []).map((id) => actor.items.get(id)).filter(Boolean)
          .map((w) => this._weaponContext(w, canAct)),
        mods: (p.mods ?? []).map((id) => actor.items.get(id)).filter(Boolean)
          .map((m) => this._modContext(m, canAct))
      };
      return ctx;
    });

    const editPostes = postes.map((p) => ({
      ...p,
      typeOptions: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label, selected: value === p.type })),
      weaponOptions: weaponsAll.map((w) => ({ id: w.id, name: stripClasse(w.name), checked: (p.weapons ?? []).includes(w.id) })),
      modOptions: modsAll.map((m) => ({ id: m.id, name: m.name, checked: (p.mods ?? []).includes(m.id) })),
      dieOptions: [4, 6, 8, 10, 12].map((n) => ({ value: n, selected: n === (toInt(p.support?.die) || 6) }))
    }));

    // Options du véhicule : cargaison et mods sont des choix du module (flags),
    // l'énergie utilise le champ natif system.energy.enabled.
    const featureFlags = actor.getFlag(MODULE_ID, "features") ?? {};
    const features = {
      cargo: featureFlags.cargo ?? ((sys.cargo?.max ?? 0) > 0 || cargo.length > 0),
      mods: featureFlags.mods ?? ((sys.mods?.max ?? 0) > 0 || modsAll.length > 0),
      energy: !!sys.energy?.enabled
    };
    if (this._tab === "cargaison" && !features.cargo) this._tab = "passerelle";

    const showConception = isGM && !this._locked;
    if (this._tab === "conception" && !showConception) this._tab = "passerelle";

    return Object.assign(context, {
      version: VERSION,
      isGM,
      locked: this._locked,
      showConception,
      heavyMetal: !!heavyMetalCombat(actor),
      inCombat: !!actorCombat(actor),
      tabs: {
        passerelle: this._tab === "passerelle",
        cargaison: this._tab === "cargaison",
        journal: this._tab === "journal",
        conception: this._tab === "conception"
      },
      img: actor.img,
      displayName: stripClasse(actor.name),
      fullName: actor.name,
      tech: {
        classification: actor._source?.system?.classification ?? sys.classification ?? "",
        size: actor._source?.system?.size ?? sys.size ?? 0,
        scale: actor._source?.system?.scale ?? sys.scale ?? 0,
        scaleForced: !!actor.getFlag(MODULE_ID, "scaleForced"),
        scaleAuto: scaleForSize(actor._source?.system?.size ?? sys.size),
        get scaleMismatch() { return !this.scaleForced && this.scale !== this.scaleAuto; },
        handling: actor._source?.system?.handling ?? sys.handling ?? 0,
        speed: actor._source?.system?.topspeed?.value ?? sys.topspeed?.value ?? 0,
        speedUnit: actor._source?.system?.topspeed?.unit ?? sys.topspeed?.unit ?? "",
        toughness: actor._source?.system?.toughness?.total ?? sys.toughness?.total ?? 0,
        armor: actor._source?.system?.toughness?.armor ?? sys.toughness?.armor ?? 0,
        woundsMax: actor._source?.system?.wounds?.max ?? sys.wounds?.max ?? 0,
        woundsForced: !!actor.getFlag(MODULE_ID, "woundsForced"),
        woundsAuto: woundsForSize(actor._source?.system?.size ?? sys.size),
        get woundsMismatch() { return !this.woundsForced && this.woundsMax !== this.woundsAuto; },
        cost: actor._source?.system?.cost ?? sys.cost ?? 0
      },
      critSummary: (() => {
        const c = actor.getFlag(MODULE_ID, "crits");
        if (!c) return null;
        const parts = [];
        if (c.handling) parts.push(`Maniabilité −${Math.min(c.handling, CRIT_MAX.handling)}`);
        if (c.speed) parts.push(`Vitesse −${Math.min(c.speed, CRIT_MAX.speed) * 10} %`);
        if (c.destroyed?.length) parts.push(`${c.destroyed.length} arme${c.destroyed.length > 1 ? "s" : ""} détruite${c.destroyed.length > 1 ? "s" : ""}`);
        return parts.length ? parts.join(" · ") : null;
      })(),
      journal: [...(actor.getFlag(MODULE_ID, "journal") ?? [])].reverse().map((e) => ({
        date: new Date(e.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
        user: e.u,
        text: e.text
      })),
      crew: {
        required: sys.crew?.required?.max ?? 0,
        passengersMax: sys.crew?.optional?.max ?? 0,
        passengers: sys.crew?.optional?.value ?? 0,
        members: occupants.size,
        support: supportCount,
        total: crewCount
      },
      maneuverOptions: (() => {
        const current = sys.driver?.skill ?? "";
        const opts = [{ value: "", label: "— à choisir —", selected: !current },
          ...Object.entries(MANEUVER_SKILLS).map(([value, label]) => ({ value, label, selected: value === current }))];
        if (current && !MANEUVER_SKILLS[current]) opts.push({ value: current, label: current, selected: true });
        return opts;
      })(),
      classe,
      classeOverride,
      classeSource: classeOverride ? "forcée" : (classeAuto ? "calculée" : "calcul à venir"),
      subtitle: [sys.classification, `Taille ${sys.size ?? "?"}`, `Échelle ${sys.scale ?? "?"}`,
        `Manœuvre : ${maneuverLabel(sys.driver?.skill) ?? "non définie"}`].filter(Boolean).join(" · "),
      stats: [
        { label: "Maniabilité", value: sys.handling ?? 0 },
        { label: "Vitesse max", value: `${sys.topspeed?.value ?? "?"}${sys.topspeed?.unit ? " " + sys.topspeed.unit : ""}` },
        { label: "Résistance", value: `${sys.toughness?.total ?? "?"} (${sys.toughness?.armor ?? 0})` },
        ...(features.mods ? [{ label: "Mods", value: `${modsUsed} / ${sys.mods?.max ?? 0}`, warn: modsUsed > (sys.mods?.max ?? Infinity) }] : [])
      ],
      wounds: { value: sys.wounds?.value ?? 0, max: sys.wounds?.max ?? 0, ignored: sys.wounds?.ignored ?? 0 },
      statuses: STATUS.map(([key, label]) => ({ key, label, active: !!sys.status?.[key] })),
      crewAlert: required > 0 && crewCount < required
        ? `Équipage requis : ${crewCount} / ${required}${supportCount ? ` (dont ${supportCount} en soutien)` : ""}` : null,
      passengers: sys.crew?.optional ? `${sys.crew.optional.value ?? 0} / ${sys.crew.optional.max ?? 0}` : null,
      postes: postesCtx,
      editPostes,
      hasNativeCrew: (sys.crew?.members?.length ?? 0) > 0,
      weapons: weaponsAll.map((w) => ({
        id: w.id,
        name: stripClasse(w.name),
        computed: computeWeaponClasse(w) ?? (w.system.isHeavyWeapon ? "formule non reconnue" : "— (pas une arme lourde)"),
        value: weaponClasseValue(w) ?? "—",
        override: w.getFlag(MODULE_ID, "classe") ?? "",
        warheadOptions: Object.entries(WARHEADS).map(([value, label]) =>
          ({ value, label, selected: value === (w.getFlag(MODULE_ID, "warhead") ?? "") }))
      })),
      mods: modsAll.map((m) => ({
        id: m.id,
        name: m.name,
        slots: toInt(m.system.mods),
        qty: toInt(m.system.quantity) || 1,
        total: toInt(m.system.mods) * (toInt(m.system.quantity) || 1),
        hasAction: !!m.system.actions?.trait
          || Object.values(m.system.actions?.additional ?? {}).some((a) => a.type === "trait")
      })),
      features,
      energy: { value: sys.energy?.value ?? 0, max: sys.energy?.max ?? 0, low: (sys.energy?.value ?? 0) <= 0 },
      canSpendEnergy: isGM || actor.isOwner,
      modsUsed,
      modsMax: sys.mods?.max ?? 0,
      modsOver: modsUsed > (sys.mods?.max ?? Infinity),
      cargo: cargo.map((i) => ({ id: i.id, name: i.name, qty: toInt(i.system.quantity) || 1, weight: Number(i.system.weight) || 0 })),
      cargoUsed,
      cargoMax: sys.cargo?.max ?? 0,
      cargoOver: (sys.cargo?.max ?? 0) > 0 && cargoUsed > sys.cargo.max
    });
  }

  /* ---------------- Rendu ---------------- */

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
    let posteId = event.target.closest?.("[data-poste-id]")?.dataset.posteId;
    if (!posteId) posteId = await this._askPoste(postes, dropped?.name ?? "cet acteur");
    if (!posteId) return;

    if (posteId.startsWith("new:")) {
      const type = posteId.slice(4);
      postes.push({ id: randomId(), label: TYPE_LABEL[type] ?? "Poste", type, skill: "", weapons: [], mods: [], occupant: data.uuid });
    } else {
      const p = postes.find((x) => x.id === posteId);
      if (!p) return;
      p.occupant = data.uuid;
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
  }

  async _onPosteField(event) {
    const el = event.currentTarget;
    const postes = this.postes;
    const p = postes.find((x) => x.id === el.dataset.posteId);
    if (!p) return;
    const field = el.dataset.posteField;
    if (field.startsWith("support.")) {
      const key = field.slice(8);
      const value = el.type === "checkbox" ? el.checked
        : (["count", "die", "mod"].includes(key) ? toInt(el.value) : el.value.trim());
      foundry.utils.setProperty(p, field, key === "count" ? Math.max(0, value) : value);
    } else if (field === "weapons" || field === "mods") {
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
    const b = poste ? this.document.getFlag(MODULE_ID, `supportBonus.${poste.id}`) : null;
    if (!b?.value) return [];
    if (this.document.isOwner) await this.document.unsetFlag(MODULE_ID, `supportBonus.${poste.id}`);
    else ui.notifications.info("Bonus de soutien appliqué : le MJ devra l'effacer de la fiche.");
    return [{ label: `Soutien${b.label ? " · " + b.label : ""}`, value: b.value }];
  }

  _runtime(target) {
    const p = this.postes.find((x) => x.id === target.closest("[data-poste-id]")?.dataset.posteId);
    return { poste: p, occupant: actorFromUuid(p?.occupant) };
  }

  /* ---------------- Actions ---------------- */

  static _onSwitchTab(event, target) {
    this._tab = target.dataset.swvTab;
    this.render();
  }

  static _onToggleLock() {
    if (!game.user.isGM) return;
    this._locked = !this._locked;
    this._tab = this._locked ? "passerelle" : "conception";
    this.render();
  }

  static async _onManeuver(event, target) {
    const { poste, occupant } = this._runtime(target);
    const sys = this.document.system;
    const wounds = Math.max(0, (sys.wounds?.value ?? 0) - (sys.wounds?.ignored ?? 0));
    if (!sys.driver?.skill) return ui.notifications.warn("Compétence de manœuvre non définie : à choisir dans l'onglet Conception.");
    if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
    await rollTrait(occupant, sys.driver.skill, [
      { label: "Maniabilité", value: toInt(sys.handling) },
      { label: "Blessures du véhicule", value: -Math.min(wounds, 3) },
      ...(await this._takeSupport(poste))
    ]);
  }

  static async _onPosteSkill(event, target) {
    const { poste, occupant } = this._runtime(target);
    if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
    await rollTrait(occupant, poste?.skill, await this._takeSupport(poste));
  }

  /** Jet de groupe du soutien : dé du groupe + dé Joker (d6), le meilleur des deux, contre 4. */
  static async _onGroupRoll(event, target) {
    const { poste } = this._runtime(target);
    const sup = poste?.support;
    if (!sup?.enabled) return;
    if (!(game.user.isGM || this.document.isOwner)) return;
    if ((sup.count ?? 1) <= 0) return ui.notifications.warn("Le groupe de soutien n'a plus d'effectif.");
    const die = [4, 6, 8, 10, 12].includes(toInt(sup.die)) ? toInt(sup.die) : 6;
    const mod = toInt(sup.mod);
    const trait = await new Roll(`1d${die}x`).evaluate();
    const wild = await new Roll("1d6x").evaluate();
    const first = (r) => r.dice[0]?.results?.[0]?.result;
    const critFail = first(trait) === 1 && first(wild) === 1;
    const total = Math.max(trait.total, wild.total) + mod;
    let bonus = 0;
    let outcome = "Échec : aucun bonus";
    if (critFail) { bonus = -2; outcome = "Échec critique : −2 au prochain jet du poste"; }
    else if (total >= 8) { bonus = 2; outcome = "Prouesse : +2 au prochain jet du poste"; }
    else if (total >= 4) { bonus = 1; outcome = "Réussite : +1 au prochain jet du poste"; }

    const label = sup.label || "Groupe de soutien";
    if (bonus) await this.document.setFlag(MODULE_ID, `supportBonus.${poste.id}`, { value: bonus, label });
    else await this.document.unsetFlag(MODULE_ID, `supportBonus.${poste.id}`);

    const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document, alias: `${label} (${this.document.name})` }),
      rolls: [trait, wild],
      content: `<div class="swv-group-card">
        <h3>Jet de groupe · ${escapeHTML(label)}</h3>
        <p>Soutien du poste <strong>${escapeHTML(poste.label)}</strong> · effectif ${sup.count ?? "?"}</p>
        <p>d${die} : ${trait.total} · dé Joker : ${wild.total}${mod ? ` · modificateur ${signed(mod)}` : ""} → <strong>${total}</strong></p>
        <p class="swv-hm-result">${outcome}</p>
      </div>`
    });
  }

  static async _onFire(event, target) {
    const { occupant } = this._runtime(target);
    const weapon = this.document.items.get(target.dataset.itemId);
    if (!weapon) return;
    if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
    const support = await this._takeSupport(this._runtime(target).poste);
    if (await nativeItemAction(weapon, occupant, "formula", support)) return;
    await rollTrait(occupant, weapon.system.actions?.trait || "Shooting", [
      { label: stripClasse(weapon.name), value: toInt(weapon.system.actions?.traitMod) },
      ...support
    ], { rof: toInt(weapon.system.rof) });
  }

  static async _onDamage(event, target) {
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
    const { occupant: shooter } = this._runtime(target);
    if (await nativeItemAction(weapon, shooter ?? this.document, "damage")) return;
    if (typeof weapon.rollDamage === "function") return weapon.rollDamage();
    const roll = await new Roll(weapon.system.damage || "0").evaluate();
    return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor: `Dégâts · ${stripClasse(weapon.name)}`
    });
  }

  /** Dégâts Heavy Metal à la demande, en combat ou non (jet ponctuel). */
  static async _onDamageHM(event, target) {
    const weapon = this.document.items.get(target.dataset.itemId);
    if (!weapon) return;
    const weaponClass = weapon.getFlag(MODULE_ID, "classe") || computeWeaponClasse(weapon);
    if (!weaponClass) return ui.notifications.warn(`${stripClasse(weapon.name)} n'a pas de Classe.`);
    const { occupant } = this._runtime(target);
    return openHeavyMetalDialog({ attacker: this.document, weapon, weaponClass, occupant });
  }

  static async _onWeaponAction(event, target) {
    const { occupant } = this._runtime(target);
    const weapon = this.document.items.get(target.dataset.itemId);
    const actionId = target.dataset.actionId;
    const a = weapon?.system.actions?.additional?.[actionId];
    if (!a) return;
    if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
    const support = a.type === "damage" ? [] : await this._takeSupport(this._runtime(target).poste);
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

  static async _onModAction(event, target) {
    const { occupant } = this._runtime(target);
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    const id = target.dataset.actionId;
    if (!occupant) return ui.notifications.warn("Aucun occupant à ce poste.");
    const support = await this._takeSupport(this._runtime(target).poste);
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

  static async _onToggleStatus(event, target) {
    if (!game.user.isGM) return;
    const key = target.dataset.key;
    const current = !!this.document.system.status?.[key];
    await this.document.update({ [`system.status.${key}`]: !current });
  }

  static async _onWound(event, target) {
    if (!game.user.isGM) return;
    const w = this.document.system.wounds;
    const value = Math.clamp((w?.value ?? 0) + toInt(target.dataset.delta), 0, w?.max ?? 0);
    await this.document.update({ "system.wounds.value": value }, { swvReason: "MJ" });
  }

  static async _onAddPoste() {
    if (!game.user.isGM) return;
    const postes = this.postes;
    postes.push({ id: randomId(), label: "Nouveau poste", type: "autre", skill: "", weapons: [], mods: [], occupant: null });
    await this._savePostes(postes);
  }

  static async _onDeletePoste(event, target) {
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

  static async _onClearOccupant(event, target) {
    if (!game.user.isGM) return;
    const postes = this.postes;
    const p = postes.find((x) => x.id === target.dataset.posteId);
    if (!p) return;
    p.occupant = null;
    await this._savePostes(postes);
  }

  static async _onImportCrew() {
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
      const occ = actorFromUuid(m.uuid);
      postes.push({
        id: randomId(),
        label: `${TYPE_LABEL[type]}${occ ? " · " + occ.name : ""}`,
        type,
        skill: "",
        weapons: [...(m.weapons ?? [])],
        mods: [],
        occupant: m.uuid
      });
    }
    await this._savePostes(postes);
  }

  /** Ouvre l'acteur avec la fiche native du système (Tweaks, caractéristiques), dans une fenêtre à part. */
  static _onOpenNative() {
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
  static async _onOpenTweaks(event, target) {
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
    SwadeVehicleSheet._onOpenNative.call(this);
  }

  /** Replie ou déplie un poste (affichage seulement, propre à chaque utilisateur). */
  static _onToggleCollapse(event, target) {
    const id = target.closest("[data-poste-id]")?.dataset.posteId;
    if (!id) return;
    if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id);
    this._saveCollapsed();
    this.render();
  }

  static _onCollapseAll(event, target) {
    const ids = this.postes.map((p) => p.id);
    if (target.dataset.mode === "collapse") ids.forEach((id) => this.collapsed.add(id));
    else this.collapsed.clear();
    this._saveCollapsed();
    this.render();
  }

  static async _onOutOfControl() {
    if (game.user.isGM) await applyOutOfControl(this.document);
  }

  static async _onCritical() {
    if (game.user.isGM) await applyCritical(this.document);
  }

  static async _onRepair() {
    if (!game.user.isGM) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Réparer le véhicule" },
      content: "<p>Effacer toutes les Dégradations critiques (Maniabilité, Vitesse, armes détruites) ? Les Blessures ne sont pas modifiées.</p>"
    });
    if (ok) await repairCriticals(this.document);
  }

  /** Dépense d'Énergie : montant et motif, refusée si la réserve est insuffisante. */
  static async _onSpendEnergy() {
    const actor = this.document;
    if (!(game.user.isGM || actor.isOwner)) return;
    const current = actor.system.energy?.value ?? 0;
    let data;
    try {
      data = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Dépenser de l'Énergie · ${actor.name}` },
        content: `<div class="swv-hm-form">
          <p>Réserve : <strong>${current} / ${actor.system.energy?.max ?? 0}</strong></p>
          <label>Montant <input type="number" name="amount" min="1" step="1" value="1" autofocus></label>
          <label>Motif <input type="text" name="reason" placeholder="ex. bouclier, saut, détournement"></label>
        </div>`,
        ok: { label: "Dépenser", callback: (ev, button) => ({ amount: toInt(button.form.elements.amount.value), reason: button.form.elements.reason.value.trim() }) }
      });
    } catch { return; }
    if (!data || data.amount <= 0) return;
    if (data.amount > current) return ui.notifications.warn(`Énergie insuffisante : ${current} disponible pour ${data.amount} demandés.`);
    const reason = data.reason || "dépense";
    await actor.update({ "system.energy.value": current - data.amount }, { swvReason: reason });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${escapeHTML(actor.name)}</strong> dépense ${data.amount} Énergie (${escapeHTML(reason)}) · reste ${current - data.amount} / ${actor.system.energy?.max ?? 0}</p>`
    });
  }

  /** Recharge (MJ) : jusqu'au maximum, ou d'un montant donné. */
  static async _onRechargeEnergy() {
    if (!game.user.isGM) return;
    const actor = this.document;
    const { value = 0, max = 0 } = actor.system.energy ?? {};
    let amount;
    try {
      amount = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Recharger l'Énergie · ${actor.name}` },
        content: `<div class="swv-hm-form">
          <p>Réserve : <strong>${value} / ${max}</strong></p>
          <label>Montant à recharger <input type="number" name="amount" min="1" step="1" value="${Math.max(max - value, 0)}"></label>
        </div>`,
        ok: { label: "Recharger", callback: (ev, button) => toInt(button.form.elements.amount.value) }
      });
    } catch { return; }
    if (!amount || amount <= 0) return;
    await actor.update({ "system.energy.value": Math.min(value + amount, max) }, { swvReason: "recharge" });
  }

  static async _onClearJournal() {
    if (!game.user.isGM) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Vider le journal" },
      content: "<p>Effacer tout le journal de ce véhicule ? Cette action est définitive.</p>"
    });
    if (ok) await this.document.unsetFlag(MODULE_ID, "journal");
  }

  static _onOpenItem(event, target) {
    this.document.items.get(target.dataset.itemId)?.sheet?.render(true);
  }
}

/* ------------------------------------------------------------------ */
/* Enregistrement                                                      */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "tableOutOfControl", {
    name: "Table de Perte de contrôle",
    hint: "UUID de la table tirée pour une Perte de contrôle (ex. RollTable.xxxx ou Compendium.…). Les effets sont appliqués d'après la valeur du 2d6.",
    scope: "world", config: true, type: String, default: DEFAULT_TABLES.outOfControl
  });
  game.settings.register(MODULE_ID, "tableCritical", {
    name: "Table des Dégradations critiques",
    hint: "UUID de la table tirée pour une Dégradation critique. Les effets sont appliqués d'après la valeur du 2d6.",
    scope: "world", config: true, type: String, default: DEFAULT_TABLES.critical
  });
  const DSC = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
  DSC.registerSheet(Actor, MODULE_ID, SwadeVehicleSheet, {
    types: ["vehicle"],
    makeDefault: false,
    label: "Fiche véhicule SWADE Vehicle (test)"
  });
  console.log(`${MODULE_ID} | v${VERSION} | fiche véhicule enregistrée`);
  game.modules.get(MODULE_ID).api = { resolveHeavyMetal, computeVehicleClasse, computeWeaponClasse, WARHEADS };
});

/* Re-rendu des fiches véhicule ouvertes quand un occupant gagne ou perd un état. */
function refreshVehicleSheetsFor(actor) {
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
function refreshAllVehicleSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof SwadeVehicleSheet && app.rendered) app.render();
  }
}
Hooks.on("updateCombat", (combat, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refreshAllVehicleSheets();
});
for (const hook of ["deleteCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, () => refreshAllVehicleSheets());
