import { MODULE_ID } from "../constants.js";
import { effectiveScale } from "./foundry-utils.js";

/**
 * Le système recalcule l'Échelle d'un véhicule à partir de sa Taille avec une table qui s'arrête à 20,
 * ce qui ramène une Taille 21+ à 0. Après sa préparation, on impose l'Échelle retenue par le module
 * (forcée, ou d'après la Taille selon la table étendue). À appeler au hook setup.
 */
export function patchVehicleScale() {
  const Model = CONFIG.Actor.dataModels?.vehicle;
  if (!Model?.prototype) return console.warn(`${MODULE_ID} | modèle de données véhicule introuvable : Échelle non corrigée`);
  const original = Model.prototype.prepareDerivedData;
  Model.prototype.prepareDerivedData = function (...args) {
    const result = original?.apply(this, args);
    try {
      const actor = this.parent;
      if (actor) {
        const wanted = effectiveScale(actor);
        if (this.scale !== wanted) this.scale = wanted;
      }
    } catch (err) { console.warn(`${MODULE_ID} | correction de l'Échelle impossible`, err); }
    return result;
  };
}
