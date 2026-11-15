/**
 * Faux objets Foundry pour les tests Node (niveau 1 bis).
 * Ne couvrent que ce que le module utilise.
 */

export const DEFAULT_ICON = "icons/environment/people/charge.webp";

/** Installe game, foundry, CONFIG, Hooks sur globalThis ; renvoie le journal des hooks */
export function installFoundryStubs({ isGM = true } = {}) {
  const hooks = { on: [], once: [], callAll: [] };

  globalThis.Hooks = {
    on: (name, fn) => hooks.on.push({ name, fn }),
    once: (name, fn) => hooks.once.push({ name, fn }),
    callAll: (name, ...args) => hooks.callAll.push({ name, args })
  };

  globalThis.foundry = {
    utils: {
      isEmpty: (o) => !o || Object.keys(o).length === 0,
      hasProperty: (obj, path) => {
        let cur = obj;
        for (const k of path.split(".")) {
          if (cur == null || !(k in Object(cur))) return false;
          cur = cur[k];
        }
        return true;
      }
    }
  };

  globalThis.CONFIG = { SWADE: { combat: { group: { icon: DEFAULT_ICON } } } };

  const modules = new Map([["swade-tweaks", { id: "swade-tweaks" }]]);
  globalThis.game = {
    users: { activeGM: { isSelf: isGM } },
    modules,
    combats: []
  };

  return hooks;
}

/** Combattant factice */
export function makeCombatant({ id, name, img = null, tokenImg = null, actorImg = null, group = null }) {
  return {
    id,
    name,
    img,
    group,
    token: tokenImg ? { texture: { src: tokenImg } } : null,
    actor: actorImg ? { img: actorImg } : null
  };
}

/**
 * Combat factice contenant des combattants et des groupes.
 * Chaque groupe enregistre ses écritures dans group.writes.
 */
export function makeCombat({ combatants = [], groups = [] }) {
  const combat = {
    combatants: new Map(),
    groups: new Map()
  };
  for (const c of combatants) {
    c.parent = combat;
    combat.combatants.set(c.id, c);
  }
  for (const g of groups) {
    const group = {
      id: g.id,
      name: g.name,
      img: g.img ?? DEFAULT_ICON,
      system: { leader: g.leader ?? null },
      parent: combat,
      writes: [],
      async update(changes, options) {
        this.writes.push({ changes, options });
        Object.assign(this, changes);
        return this;
      }
    };
    combat.groups.set(group.id, group);
  }
  // Les Collections Foundry sont itérables sur leurs valeurs
  combat.groups[Symbol.iterator] = function* () { yield* combat.groups.values(); };
  return combat;
}
