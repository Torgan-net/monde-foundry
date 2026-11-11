/**
 * Tests d'intégration dans Foundry, exécutés par le module Quench s'il est actif (sinon, rien ne se passe).
 * Ils créent leurs propres acteurs de test et les suppriment : aucune donnée de campagne n'est touchée.
 * Lancement : interface de Quench, ou en console  quench.runBatches("swade-vehicle.**")
 */
import { MODULE_ID } from "./constants.js";
import { syncCritEffect } from "./services/criticals.js";
import { SwadeVehicleSheet } from "./sheets/vehicle-sheet.js";

Hooks.on("quenchReady", (quench) => {
  quench.registerBatch(`${MODULE_ID}.integration`, (context) => {
    const { describe, it, assert, before, after } = context;
    const api = () => game.modules.get(MODULE_ID).api;
    let ship, pilot;

    before(async () => {
      pilot = await Actor.create({ name: "[Test swade-vehicle] Pilote", type: "character" });
      ship = await Actor.create({
        name: "[Test swade-vehicle] Vaisseau (Class IV)", type: "vehicle",
        system: { size: 21, scale: 0, handling: -2, toughness: { total: 45, armor: 20 }, wounds: { value: 0, max: 8 }, driver: { skill: "Piloting" } }
      });
    });
    after(async () => {
      for (const app of foundry.applications.instances.values()) if (app.document?.id === ship?.id) await app.close();
      await ship?.delete();
      await pilot?.delete();
    });

    describe("Données du véhicule", function () {
      it("Classe calculée d'après la Résistance (45 → IV)", () => {
        assert.equal(api().getClasse(ship), "IV");
      });
      it("Échelle imposée après le calcul du système (Taille 21 → 6)", () => {
        assert.equal(ship.system.scale, 6);
      });
    });

    describe("Écritures", function () {
      it("Affectation d'un poste : équipage natif synchronisé", async () => {
        const sheet = new SwadeVehicleSheet({ document: ship });
        await sheet._savePostes([{ id: "t1", label: "Barre", type: "pilote", skill: "", weapons: [], mods: [], occupant: pilot.uuid }]);
        assert.equal(ship.system.crew.members.length, 1);
        assert.equal(ship.system.crew.members[0].role, "operator");
        assert.equal(api().getPilot(ship)?.id, pilot.id);
      });
      it("Blessures au-delà du maximum : épave", async () => {
        await api().setWounds(ship, 9, "test");
        assert.equal(api().getWounds(ship).value, 9);
        assert.equal(ship.system.status.isWrecked, true);
        await ship.update({ "system.wounds.value": 0, "system.status.isWrecked": false }, { swvReason: "test" });
      });
      it("Dégradation de guidage : effet actif au format v14", async () => {
        await ship.setFlag(MODULE_ID, "crits", { handling: 1, speed: 0, destroyed: [] });
        await syncCritEffect(ship);
        const effect = ship.effects.find((e) => e.getFlag(MODULE_ID, "crit"));
        assert.equal(effect?.changes?.[0]?.type, "add");
        assert.equal(ship.system.handling, -3);
      });
    });

    describe("Fiche", function () {
      it("La fiche s'affiche dans chaque onglet sans erreur", async () => {
        const sheet = new SwadeVehicleSheet({ document: ship });
        for (const tab of ["passerelle", "equipement", "journal", "cargaison"]) {
          sheet._tab = tab;
          await sheet.render({ force: true });
          assert.ok(sheet.element?.querySelector(".swv-body"), `onglet ${tab}`);
        }
        await sheet.close();
      });
    });
  }, { displayName: "SWADE Vehicle : intégration" });
});
