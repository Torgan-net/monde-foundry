import { MODULE_ID } from "../constants.js";
import { normalizeSupports } from "../rules/support.js";
import { actorFromUuid, isResponsibleGM } from "./foundry-utils.js";

/*
 * Instances d'acteurs propres à un véhicule.
 * Un acteur déposé sur un poste ou un soutien :
 *  - lié (« Lié à l'acteur » coché sur son prototype de jeton, cas des Jokers) : référencé tel quel,
 *    ses états sont ceux de l'acteur sur toutes les scènes ;
 *  - non lié (Extras) : le modèle n'est pas utilisé ; le module crée une copie propre au véhicule,
 *    rangée dans le dossier « Équipages des véhicules », marquée flags.swade-vehicle.{instanceOf, instanceFor}.
 *    La copie est liée (ses jetons éventuels partagent ses états) et supprimée quand le véhicule ne la référence plus.
 *  - acteur de jeton (synthétique) : déjà une instance, référencé tel quel.
 */

export const INSTANCE_FOLDER = "Équipages des véhicules";

/** Instance créée par le module pour ce véhicule. */
export const isInstanceOf = (actor, vehicle) => actor?.getFlag?.(MODULE_ID, "instanceFor") === vehicle.uuid;

/** L'acteur doit-il être copié pour le véhicule ? */
export function needsInstance(actor, uuid = actor?.uuid, vehicle = null) {
  if (!actor || actor.isToken || String(uuid).includes(".Token.")) return false;
  const owner = actor.getFlag?.(MODULE_ID, "instanceFor");
  if (owner) return !!vehicle && owner !== vehicle.uuid; // instance d'un autre véhicule : nouvelle copie
  if (String(uuid).startsWith("Compendium.")) return true;     // un acteur de compendium est toujours importé
  return actor.prototypeToken?.actorLink !== true;
}

async function instanceFolder() {
  const found = game.folders?.find((f) => f.type === "Actor" && f.name === INSTANCE_FOLDER);
  if (found) return found;
  return Folder.implementation.create({ name: INSTANCE_FOLDER, type: "Actor", color: "#7c2d12" });
}

function instanceName(vehicle, base) {
  const root = `${base} (${vehicle.name})`;
  const names = new Set((game.actors?.contents ?? []).map((a) => a.name));
  if (!names.has(root)) return root;
  let i = 2;
  while (names.has(`${root} ${i}`)) i++;
  return `${root} ${i}`;
}

/**
 * UUID à enregistrer pour un acteur déposé sur le véhicule : l'acteur lui-même s'il est lié,
 * sinon une instance créée pour le véhicule.
 */
export async function crewUuidFor(vehicle, uuid) {
  let actor = actorFromUuid(uuid);
  if (String(uuid).startsWith("Compendium.")) actor = await fromUuid(uuid);
  if (!needsInstance(actor, uuid, vehicle)) return actor?.uuid ?? uuid;

  const linked = actor.prototypeToken?.actorLink === true && !actor.getFlag?.(MODULE_ID, "instanceFor");
  const data = actor.toObject();
  delete data._id;
  if (linked) { // Joker de compendium : simple import dans le monde
    const imported = await Actor.implementation.create(data);
    return imported.uuid;
  }
  const sourceUuid = actor.getFlag?.(MODULE_ID, "instanceOf") ?? uuid;
  const source = actor.getFlag?.(MODULE_ID, "instanceOf") ? actorFromUuid(sourceUuid) : actor;
  const name = instanceName(vehicle, source?.name ?? actor.name);
  data.name = name;
  data.folder = (await instanceFolder())?.id ?? null;
  data.prototypeToken = { ...(data.prototypeToken ?? {}), actorLink: true, name };
  data.flags = { ...(data.flags ?? {}), [MODULE_ID]: { ...(data.flags?.[MODULE_ID] ?? {}), instanceOf: sourceUuid, instanceFor: vehicle.uuid } };
  const created = await Actor.implementation.create(data);
  ui.notifications.info(`${source?.name ?? actor.name} n'est pas lié : instance « ${name} » créée pour ${vehicle.name}.`);
  return created.uuid;
}

/** Acteurs référencés par un véhicule : occupants, acteurs de soutien, membres d'équipage natifs. */
export function referencedActors(postes, members = []) {
  const set = new Set();
  for (const p of postes ?? []) {
    if (p.occupant) set.add(p.occupant);
    for (const s of normalizeSupports(p)) if (s.actor) set.add(s.actor);
  }
  for (const m of members ?? []) if (m?.uuid) set.add(m.uuid);
  return set;
}

/** Supprime les instances du véhicule qu'il ne référence plus. */
export async function pruneInstances(vehicle, referenced) {
  const keep = new Set(referenced);
  const orphans = (game.actors?.contents ?? []).filter((a) => isInstanceOf(a, vehicle) && !keep.has(a.uuid));
  for (const a of orphans) await a.delete();
  return orphans.length;
}

/* Véhicule supprimé : ses instances aussi. */
Hooks.on("deleteActor", (actor) => {
  if (actor.type !== "vehicle" || !isResponsibleGM()) return;
  pruneInstances(actor, []).catch((err) => console.error(`${MODULE_ID} |`, err));
});
