/**
 * Service : corrections d'affichage du HUD des états et du suivi de combat.
 * Réglages par joueur (portée client), classes CSS sur <body>, recalage du panneau en JS.
 */
import { MODULE_ID } from "../constants.js";
import { HUD_FIXES, isFixAvailable, activeFixClasses } from "../rules/hud-fixes.js";
import { computePaletteShift, toLocalTranslate } from "../rules/hud-clamp.js";

const isModuleActive = (id) => Boolean(game.modules.get(id)?.active);
const getValue = (key) => Boolean(game.settings.get(MODULE_ID, key));

/** Enregistre un réglage client par correction (hook init). Ceux d'un module absent sont masqués. */
export function registerHudSettings() {
  for (const fix of HUD_FIXES) {
    game.settings.register(MODULE_ID, fix.key, {
      name: fix.name,
      hint: fix.hint,
      scope: "client",
      config: isFixAvailable(fix, isModuleActive),
      type: Boolean,
      default: true,
      onChange: () => refreshHudFixes()
    });
  }
}

/** Pose ou retire les classes CSS, démarre ou arrête le recalage, selon les réglages. */
export function refreshHudFixes() {
  const wanted = new Set(activeFixClasses(HUD_FIXES, getValue, isModuleActive));
  for (const fix of HUD_FIXES) {
    if (fix.cssClass) document.body.classList.toggle(fix.cssClass, wanted.has(fix.cssClass));
  }
  if (getValue("fixPaletteClamp")) startPaletteClamp();
  else stopPaletteClamp();
}

/* ---------- Recalage du panneau des états ---------- */

let clamp = null; // { obs, hookId, onResize, raf }

export const isClampRunning = () => clamp !== null;

/** Mesure le panneau ouvert et le décale s'il sort de l'écran */
export function clampPalette() {
  const pal = document.querySelector("#token-hud .status-effects");
  if (!pal) return;
  pal.style.translate = "";
  const r = pal.getBoundingClientRect();
  if (!r.width || !r.height || getComputedStyle(pal).visibility === "hidden") return;

  const sidebar = document.getElementById("sidebar");
  const shift = computePaletteShift({
    rect: r,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    rightLimit: sidebar ? sidebar.getBoundingClientRect().left : undefined
  });
  // Zoom du canevas ou Token HUD Scale : px écran → px du panneau
  const translate = toLocalTranslate(shift, r.width / pal.offsetWidth);
  if (translate) pal.style.translate = translate;
}

export function startPaletteClamp() {
  if (clamp) return;
  const hud = document.getElementById("hud");
  if (!hud) return;

  const state = { raf: null };
  const schedule = () => {
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(clampPalette);
  };
  state.obs = new MutationObserver((muts) => {
    // Ignore nos propres écritures de style sur le panneau
    if (muts.every((m) => m.attributeName === "style" && m.target.classList?.contains("status-effects"))) return;
    schedule();
  });
  state.obs.observe(hud, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
  state.hookId = Hooks.on("canvasPan", schedule);
  state.onResize = schedule;
  window.addEventListener("resize", schedule);
  clamp = state;
  schedule(); // panneau peut-être déjà ouvert
}

export function stopPaletteClamp() {
  if (!clamp) return;
  clamp.obs.disconnect();
  Hooks.off("canvasPan", clamp.hookId);
  window.removeEventListener("resize", clamp.onResize);
  cancelAnimationFrame(clamp.raf);
  document.querySelector?.("#token-hud .status-effects")?.style.removeProperty("translate");
  clamp = null;
}
