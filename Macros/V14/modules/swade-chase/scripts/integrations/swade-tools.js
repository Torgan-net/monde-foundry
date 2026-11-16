/**
 * Intégration SWADE Tools (repris de swade-vehicle / swade-clash, constaté en jeu).
 * - API (4.1.4) : game.swadetools.skill(actor, skillItemId), sans options de modificateurs.
 * - Ses boutons (relance avec un Jeton, relance gratuite, ajouts) n'apparaissent que sur les messages de jet
 *   marqués flags.swade-tools.rolltype : il les pose lui-même sur ses jets ; un jet natif lancé par un autre
 *   module (ex. swade-vehicle) doit être marqué par nous.
 * - Modes :
 *   "simple" : ses « jets simplifiés » sont actifs → sa propre fenêtre (champ #mod prérempli avec le total) ;
 *   "tagged" : jets simplifiés désactivés → fenêtre native de SWADE (modificateurs ajoutés par la ligne
 *              « Ajout », voir roll-dialog.js) ; le message est habillé par SWADE Tools ;
 *   "native" : SWADE Tools absent.
 */
import { modsText, signed } from "../services/util.js";
import { armRollDialog } from "./roll-dialog.js";

const ST_ID = "swade-tools";

export function swadeToolsAvailable() {
  return !!game.modules.get(ST_ID)?.active && typeof game.swadetools?.skill === "function";
}

export function rollerMode() {
  if (!swadeToolsAvailable()) return "native";
  let simple = false;
  try { simple = !!game.settings.get(ST_ID, "simpleRolls"); } catch { /* réglage absent */ }
  return simple ? "simple" : "tagged";
}

let tagHook = null;

/** Marque le prochain message de jet de cet utilisateur pour que SWADE Tools l'habille (ses boutons). */
export function tagNextRoll(rolltype = "skill", { timeout = 60000 } = {}) {
  untag();
  const handler = (message, html, data) => {
    const hasRoll = (message.rolls?.length ?? 0) > 0 || !!message.isRoll;
    const author = message.author?.id ?? message.authorId ?? data?.user?.id;
    if (!hasRoll || author !== game.user.id || !message.isOwner) return;
    untag();
    message.update({ [`flags.${ST_ID}.rolltype`]: rolltype });
  };
  const id = Hooks.on("renderChatMessageHTML", handler);
  const timer = setTimeout(untag, timeout);
  timer.unref?.();
  tagHook = { id, timer };
}

export function untag() {
  if (!tagHook) return;
  Hooks.off("renderChatMessageHTML", tagHook.id);
  clearTimeout(tagHook.timer);
  tagHook = null;
}

/** Mode simplifié : préremplit le champ « Modificateur » (#mod) de la prochaine fenêtre de SWADE Tools. */
export function prefillSimpleMods(mods, prefix = "Poursuite") {
  const active = (mods ?? []).filter((m) => m.value);
  if (!active.length) return;
  const total = active.reduce((t, m) => t + m.value, 0);
  const detail = active.map((m) => `${m.label} ${signed(m.value)}`).join(", ");
  Hooks.once("renderDialog", (app, html) => {
    const root = html?.[0] ?? html;
    const input = root?.querySelector?.("#mod");
    if (!input) return;
    input.value = total ? String(total) : "";
    input.title = `${prefix} : ${detail}`;
    if (typeof document !== "undefined" && input.parentElement) {
      const note = document.createElement("p");
      note.className = "sc-st-note";
      note.textContent = `${prefix} : ${detail}`;
      input.parentElement.after(note);
    }
  });
}

/**
 * Jet de compétence par SWADE Tools.
 * @returns {Promise<{roll:any, via:string}|null>} null si l'appel a échoué (retour au jet natif)
 */
export async function rollSkillWithSwadeTools(actor, skill, mods, title, multiAction = 1) {
  try {
    const mode = rollerMode();
    if (mode === "simple") {
      prefillSimpleMods(mods);
      if (multiAction > 1) {
        await ChatMessage.create({
          content: `<div class="sc-chat sc-reminder"><strong>${title}</strong><br>Actions multiples : ${multiAction} (${signed(multiAction === 2 ? -2 : -4)}), à indiquer dans la fenêtre de SWADE Tools. Modificateurs préremplis : ${modsText(mods)}.</div>`,
          whisper: [game.user.id], speaker: ChatMessage.getSpeaker({ actor })
        });
      }
    } else {
      armRollDialog({ multiAction, mods });   // fenêtre native : ligne « Ajout » + actions multiples
    }
    const roll = await game.swadetools.skill(actor, skill.id);
    return { roll, via: "swade-tools" };
  } catch (err) {
    console.warn("swade-chase | SWADE Tools : échec de l'appel, retour au jet natif", err);
    return null;
  }
}
