/**
 * Tests d'intégration Quench (niveau 2) des corrections d'affichage.
 * Ne crée aucun document ; rétablit les réglages du joueur à la fin.
 */
import { MODULE_ID } from "../../scripts/constants.js";
import { HUD_FIXES, MLD_ID } from "../../scripts/rules/hud-fixes.js";
import { isClampRunning } from "../../scripts/services/hud-fixes.js";

export function registerHudQuenchTests(quench) {
  quench.registerBatch(
    `${MODULE_ID}.hud`,
    (context) => {
      const { describe, it, assert, before, after } = context;

      describe("Corrections d'affichage", function () {
        const saved = {};

        before(() => {
          for (const f of HUD_FIXES) saved[f.key] = game.settings.get(MODULE_ID, f.key);
        });

        after(async () => {
          for (const [k, v] of Object.entries(saved)) await game.settings.set(MODULE_ID, k, v);
        });

        it("chaque correction a son réglage client", () => {
          for (const f of HUD_FIXES) {
            const def = game.settings.settings.get(`${MODULE_ID}.${f.key}`);
            assert.ok(def, f.key);
            assert.equal(def.scope, "client");
          }
        });

        it("décocher puis cocher une correction retire puis pose sa classe", async () => {
          await game.settings.set(MODULE_ID, "fixTrackerOpacity", false);
          assert.isFalse(document.body.classList.contains("swade-tweaks--tracker-opacity"));
          await game.settings.set(MODULE_ID, "fixTrackerOpacity", true);
          assert.isTrue(document.body.classList.contains("swade-tweaks--tracker-opacity"));
        });

        it("les corrections de Monk's Little Details suivent la présence du module", async () => {
          await game.settings.set(MODULE_ID, "fixMldHeight", true);
          const mld = Boolean(game.modules.get(MLD_ID)?.active);
          assert.equal(document.body.classList.contains("swade-tweaks--mld-height"), mld);
        });

        it("le recalage du panneau démarre et s'arrête avec son réglage", async () => {
          await game.settings.set(MODULE_ID, "fixPaletteClamp", true);
          assert.equal(isClampRunning(), Boolean(document.getElementById("hud")));
          await game.settings.set(MODULE_ID, "fixPaletteClamp", false);
          assert.isFalse(isClampRunning());
        });
      });
    },
    { displayName: "SWADE Tweaks : affichage" }
  );
}
