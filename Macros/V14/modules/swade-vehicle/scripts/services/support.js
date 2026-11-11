import { MANEUVER_SKILLS, MODULE_ID, maneuverLabel } from "../constants.js";
import { groupRollOutcome, normalizeSupports } from "../rules/support.js";
import { actorFromUuid, escapeHTML, findSkill, tokenImg } from "./foundry-utils.js";
import { rollTrait } from "./rolls.js";

/*
 * Soutiens d'un poste. Chaque soutien donne un bonus au prochain jet de l'occupant du poste.
 *  - Sans acteur : jet de groupe du module (dé du soutien + dé Joker, le meilleur contre 4).
 *  - Avec acteur : jet de l'acteur par la fenêtre normale (système ou SWADE Tools), où l'on choisit
 *    jet de groupe ou non. Le résultat est ensuite indiqué sur une carte du chat (Prouesse, Réussite…).
 * Les bonus sont rangés dans flags.swade-vehicle.supportBonus.<poste>.<soutien> et cumulés (+4 au plus).
 */

const RESULTS = [
  { value: 2, label: "Prouesse", text: "+2 au prochain jet du poste" },
  { value: 1, label: "Réussite", text: "+1 au prochain jet du poste" },
  { value: 0, label: "Échec", text: "aucun bonus" },
  { value: -2, label: "Échec critique", text: "−2 au prochain jet du poste" }
];
const resultOf = (value) => RESULTS.find((r) => r.value === value) ?? RESULTS[2];

/** Poste et soutien désignés, au format liste (l'ancien soutien unique a l'identifiant « legacy »). */
export function findSupport(vehicle, posteId, supportId) {
  const poste = (vehicle.getFlag(MODULE_ID, "postes") ?? []).find((p) => p.id === posteId);
  const supports = normalizeSupports(poste);
  return { poste, support: supports.find((s) => s.id === supportId) ?? (supportId ? null : supports[0] ?? null) };
}

/* Compétences d'un acteur de soutien, pour le choix dans la Conception et au jet. */
export const supportSkillText = (i) => `${i.name}${i.system?.die?.sides ? ` d${i.system.die.sides}` : ""}`;
const skillValue = (i) => (i.system?.swid && i.system.swid !== "none" ? i.system.swid : i.name);

/** Compétences d'un acteur, triées par nom. */
const actorSkills = (actor) => [...(actor?.items ?? [])].filter((i) => i.type === "skill")
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

/**
 * Compétence effective d'un soutien avec acteur : celle réglée, sinon la première compétence de l'acteur
 * (aucune compétence de poste n'est imposée). null si l'acteur n'a aucune compétence.
 */
export function supportSkillKey(actor, skill) {
  if (skill) return skill;
  const first = actorSkills(actor)[0];
  return first ? skillValue(first) : null;
}

/** Options de compétence d'un soutien avec acteur (null sans acteur ou acteur introuvable). */
export function supportSkillOptions(sActor, skill) {
  if (!sActor) return null;
  const chosen = skill ? findSkill(sActor, skill) : null;
  const options = [];
  if (skill && !chosen) options.push({ value: skill, label: `${maneuverLabel(skill)} (absente de l'acteur)`, selected: true });
  for (const i of actorSkills(sActor)) options.push({ value: skillValue(i), label: supportSkillText(i), selected: !!chosen && chosen.id === i.id });
  if (!options.some((o) => o.selected) && options[0]) options[0].selected = true; // rien de réglé : la première
  return options;
}

/** Fenêtre du choix de la compétence de soutien au moment du jet. Renvoie la clé choisie, ou null. */
export async function askSupportSkill(actor, skill, posteLabel) {
  const options = supportSkillOptions(actor, skill) ?? [];
  if (!options.length) { ui.notifications.warn(`${actor.name} n'a aucune compétence.`); return null; }
  const content = `<p><strong>${escapeHTML(actor.name)}</strong> soutient le poste <strong>${escapeHTML(posteLabel)}</strong> avec :</p>
    <select name="skill" style="width:100%">${options.map((o) => `<option value="${escapeHTML(o.value)}"${o.selected ? " selected" : ""}>${escapeHTML(o.label)}</option>`).join("")}</select>`;
  try {
    return await foundry.applications.api.DialogV2.prompt({
      window: { title: "Compétence de soutien" },
      content,
      ok: { label: "Lancer", callback: (ev, button) => button.form.elements.skill.value }
    }) || null;
  } catch { return null; } // fenêtre fermée
}

export const supportLabel = (support, actor) => support?.label || actor?.name || "Groupe de soutien";

/** Range le bonus d'un soutien (0 = rien en attente). Convertit au passage l'ancien format du flag. */
export async function applySupportResult(vehicle, posteId, supportId, value, label) {
  const current = vehicle.getFlag(MODULE_ID, `supportBonus.${posteId}`);
  if (current && "value" in current) await vehicle.unsetFlag(MODULE_ID, `supportBonus.${posteId}`);
  if (value) await vehicle.setFlag(MODULE_ID, `supportBonus.${posteId}.${supportId}`, { value, label });
  else if (vehicle.getFlag(MODULE_ID, `supportBonus.${posteId}.${supportId}`)) await vehicle.unsetFlag(MODULE_ID, `supportBonus.${posteId}.${supportId}`);
}

/**
 * Jet d'un soutien.
 * @param {Actor} vehicle
 * @param {string} posteId
 * @param {string} supportId  identifiant du soutien (le premier si absent)
 * @param {{previous?:{bonus:number}}} [o]  relance avec un Jeton (jet de groupe du module)
 */
export async function groupRoll(vehicle, posteId, supportId, { previous = null } = {}) {
  const { poste, support } = findSupport(vehicle, posteId, supportId);
  if (!support) return;
  const actor = support.actor ? actorFromUuid(support.actor) : null;
  if (actor) return supportActorRoll(vehicle, poste, support, actor);
  if (support.actor) ui.notifications.warn("Acteur du soutien introuvable : jet de groupe du module.");
  return moduleGroupRoll(vehicle, poste, support, previous);
}

/** Jet de l'acteur du soutien, puis carte où l'on indique le résultat (le module ne lit pas le jet). */
async function supportActorRoll(vehicle, poste, support, actor) {
  const skill = await askSupportSkill(actor, support.skill, poste.label); // réglée, sinon la première de l'acteur
  if (!skill) return;
  await rollTrait(actor, skill, support.mod ? [{ label: "Modificateur du soutien", value: support.mod }] : []);
  const label = supportLabel(support, actor);
  const buttons = RESULTS.map((r) => `<button type="button" data-swv-support-result="${r.value}">${r.label} (${r.value > 0 ? "+" : r.value < 0 ? "−" : ""}${Math.abs(r.value)})</button>`).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { supportResult: { vehicleUuid: vehicle.uuid, posteId: poste.id, supportId: support.id, label } } },
    content: `<div class="swv-group-card swv-support-card">
      <h3><img src="${tokenImg(actor.uuid)}" alt=""> Soutien · ${escapeHTML(label)}</h3>
      <p>Poste <strong>${escapeHTML(poste.label)}</strong> · ${escapeHTML(findSkill(actor, skill)?.name ?? MANEUVER_SKILLS[skill] ?? skill)}</p>
      <p class="swv-hint">Après le jet (et une éventuelle relance), indiquer le résultat :</p>
      <div class="swv-support-results">${buttons}</div>
    </div>`
  });
}

/** Jet de groupe du module : dé du soutien + dé Joker (d6), le meilleur des deux, contre 4. */
async function moduleGroupRoll(vehicle, poste, support, previous) {
  if (support.count <= 0) return ui.notifications.warn("Le groupe de soutien n'a plus d'effectif.");
  const trait = await new Roll(`1d${support.die}x`).evaluate();
  const wild = await new Roll("1d6x").evaluate();
  const first = (r) => r.dice[0]?.results?.[0]?.result;
  const r = groupRollOutcome({ trait: trait.total, wild: wild.total, traitFirst: first(trait), wildFirst: first(wild), mod: support.mod, previous: previous?.bonus });
  const { critFail, total, bonus } = r;
  const kept = r.kept ? " (meilleur résultat conservé)" : "";
  const label = supportLabel(support);
  await applySupportResult(vehicle, poste.id, support.id, bonus, label);

  const signed = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  const res = resultOf(bonus);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: vehicle, alias: `${label} (${vehicle.name})` }),
    rolls: [trait, wild],
    flags: { [MODULE_ID]: { group: { vehicleUuid: vehicle.uuid, posteId: poste.id, supportId: support.id, bonus, critFail, rerolled: !!previous } } },
    content: `<div class="swv-group-card">
      <h3>Jet de groupe · ${escapeHTML(label)}${previous ? " (relance)" : ""}</h3>
      <p>Soutien du poste <strong>${escapeHTML(poste.label)}</strong> · effectif ${support.count}</p>
      <p>d${support.die} : ${trait.total} · dé Joker : ${wild.total}${support.mod ? ` · modificateur ${signed(support.mod)}` : ""} → <strong>${total}</strong></p>
      <p class="swv-hm-result">${res.label} : ${res.text}${kept}</p>
      ${critFail ? "<p class=\"swv-hint\">Un échec critique ne peut pas être relancé.</p>" : `<button type="button" data-swv-group-reroll>Relancer avec un Jeton (MJ)</button>`}
    </div>`
  });
}

/* Relance du jet de groupe du module avec un Jeton MJ. */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const g = message.getFlag(MODULE_ID, "group");
  const btn = g && html.querySelector?.("[data-swv-group-reroll]");
  if (!btn) return;
  if (!game.user.isGM || g.used) { btn.disabled = true; if (g.used) btn.textContent = "Relancé"; return; }
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const vehicle = actorFromUuid(g.vehicleUuid);
    if (!vehicle) return ui.notifications.warn("Véhicule introuvable.");
    if (typeof game.user.spendBenny === "function") {
      const before = game.user.bennies ?? game.user.getFlag?.("swade", "bennies");
      if (Number.isFinite(before) && before <= 0) { btn.disabled = false; return ui.notifications.warn("Plus de Jetons MJ."); }
      await game.user.spendBenny();
    } else ui.notifications.info("Jeton MJ à déduire à la main.");
    await message.setFlag(MODULE_ID, "group.used", true);
    await groupRoll(vehicle, g.posteId, g.supportId ?? "legacy", { previous: { bonus: g.bonus } });
  });
});

/* Carte de résultat d'un soutien avec acteur : le MJ ou l'auteur du jet indique le résultat, une fois. */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const s = message.getFlag(MODULE_ID, "supportResult");
  if (!s) return;
  const buttons = html.querySelectorAll?.("[data-swv-support-result]") ?? [];
  const allowed = game.user.isGM || message.isAuthor;
  for (const b of buttons) {
    if (s.chosen !== undefined || !allowed) {
      b.disabled = true;
      if (Number(b.dataset.swvSupportResult) === s.chosen) b.classList.add("is-chosen");
      continue;
    }
    b.addEventListener("click", async () => {
      buttons.forEach((x) => { x.disabled = true; });
      const vehicle = actorFromUuid(s.vehicleUuid);
      if (!vehicle) return ui.notifications.warn("Véhicule introuvable.");
      const value = Number(b.dataset.swvSupportResult);
      await applySupportResult(vehicle, s.posteId, s.supportId, value, s.label);
      await message.setFlag(MODULE_ID, "supportResult.chosen", value);
    });
  }
});
