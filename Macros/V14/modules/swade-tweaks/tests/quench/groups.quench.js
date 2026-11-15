/**
 * Tests d'intégration Quench (niveau 2).
 * Crée un acteur et un combat de test, puis les supprime.
 * Ne touche à aucune donnée de campagne.
 */
import { MODULE_ID } from "../../scripts/constants.js";

export function registerQuenchTests(quench) {
  quench.registerBatch(
    `${MODULE_ID}.groups`,
    (context) => {
      const { describe, it, assert, before, after } = context;

      describe("Groupes du Combat Tracker", function () {
        this.timeout(10000);
        let actor, combat;

        before(async () => {
          actor = await Actor.create({ name: "Elharn (test swade-tweaks)", type: "npc" });
          combat = await Combat.create({ scene: canvas.scene?.id ?? null });
        });

        after(async () => {
          await combat?.delete();
          await actor?.delete();
        });

        it("renomme un groupe neuf d'après son meneur", async () => {
          const [leader] = await combat.createEmbeddedDocuments("Combatant", [
            { actorId: actor.id, name: "Elharn", img: "icons/svg/mystery-man.svg" }
          ]);
          const [group] = await combat.createEmbeddedDocuments("CombatantGroup", [
            { name: "Groupe de combattants", system: { leader: leader.id } }
          ]);
          await leader.update({ group: group.id });
          await new Promise((r) => setTimeout(r, 300));
          const g = combat.groups.get(group.id);
          assert.equal(g.name, "Groupe d'Elharn");
          assert.equal(g.img, "icons/svg/mystery-man.svg");
        });

        it("ne réécrit pas un nom saisi à la main", async () => {
          const leader = combat.combatants.contents[0];
          const group = combat.groups.contents[0];
          await group.update({ name: "Les Charognards" });
          await leader.update({ name: "Elharn le Roux" });
          await new Promise((r) => setTimeout(r, 300));
          assert.equal(combat.groups.get(group.id).name, "Les Charognards");
        });
      });
    },
    { displayName: "SWADE Tweaks : groupes" }
  );
}
