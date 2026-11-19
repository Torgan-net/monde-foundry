/**
 * Tests d'intégration Quench (niveau 2) du curseur de combat.
 * Crée un acteur et un combat de test, puis les supprime.
 */
import { MODULE_ID } from "../../scripts/constants.js";
import { setActiveCombatant } from "../../scripts/services/turns.js";

export function registerTurnQuenchTests(quench) {
  quench.registerBatch(
    `${MODULE_ID}.turns`,
    (context) => {
      const { describe, it, assert, before, after } = context;

      describe("Curseur du Combat Tracker", function () {
        this.timeout(10000);
        let actor, combat;

        before(async () => {
          actor = await Actor.create({ name: "Curseur (test swade-tweaks)", type: "npc" });
          combat = await Combat.create({ scene: canvas.scene?.id ?? null });
          await combat.createEmbeddedDocuments("Combatant", [
            { actorId: actor.id, name: "Premier", initiative: 20 },
            { actorId: actor.id, name: "Second", initiative: 10 }
          ]);
          await combat.update({ round: 1, turn: 0 });
        });

        after(async () => {
          await combat?.delete();
          await actor?.delete();
        });

        it("place le curseur sur le combattant choisi", async () => {
          const target = combat.turns[1];
          assert.equal(await setActiveCombatant(target), true);
          assert.equal(combat.combatant.id, target.id);
        });

        it("ne fait rien sur le combattant déjà actif", async () => {
          assert.equal(await setActiveCombatant(combat.combatant), false);
        });
      });
    },
    { displayName: "SWADE Tweaks : curseur" }
  );
}
