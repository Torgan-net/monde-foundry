/**
 * Faux objets Foundry pour les tests Node (niveau 1 bis).
 * Ne couvrent que ce que le module utilise.
 */

export const DEFAULT_ICON = "icons/environment/people/charge.webp";

/** Installe game, foundry, CONFIG, Hooks sur globalThis ; renvoie le journal des hooks */
export function installFoundryStubs({ isGM = true, activeModules = [] } = {}) {
  const hooks = { on: [], once: [], callAll: [] };

  globalThis.Hooks = {
    on: (name, fn) => hooks.on.push({ name, fn }),
    once: (name, fn) => hooks.once.push({ name, fn }),
    callAll: (name, ...args) => hooks.callAll.push({ name, args }),
    off: () => {}
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

  const modules = new Map([["swade-tweaks", { id: "swade-tweaks", active: true }]]);
  for (const id of activeModules) modules.set(id, { id, active: true });

  // Réglages : register enregistre la définition, get/set lisent et écrivent la valeur
  const registered = new Map();
  const values = new Map();
  const settings = {
    registered,
    register(ns, key, def) { registered.set(`${ns}.${key}`, def); values.set(`${ns}.${key}`, def.default); },
    get(ns, key) { return values.get(`${ns}.${key}`); },
    async set(ns, key, value) {
      values.set(`${ns}.${key}`, value);
      registered.get(`${ns}.${key}`)?.onChange?.(value);
      return value;
    }
  };

  globalThis.game = {
    user: { isGM },
    users: { activeGM: { isSelf: isGM } },
    modules,
    settings,
    combats: []
  };

  globalThis.document = makeDocument();

  return hooks;
}

/** document factice : body.classList et getElementById */
export function makeDocument({ elements = {} } = {}) {
  const classes = new Set();
  return {
    body: {
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => {
          const on = force ?? !classes.has(c);
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
        contains: (c) => classes.has(c)
      },
      classes
    },
    getElementById: (id) => elements[id] ?? null,
    querySelector: () => null
  };
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

/**
 * Combat lancé, avec ordre de tour et position du curseur.
 * Chaque écriture sur le combat est enregistrée dans combat.writes.
 */
export function makeStartedCombat({ combatants = [], groups = [], order, turn = 0, started = true }) {
  const combat = makeCombat({ combatants, groups });
  combat.started = started;
  combat.turn = turn;
  combat.turns = (order ?? combatants.map((c) => c.id)).map((id) => combat.combatants.get(id));
  combat.writes = [];
  combat.update = async function (changes, options) {
    this.writes.push({ changes, options });
    Object.assign(this, changes);
    return this;
  };
  return combat;
}

/** Élément du suivi de combat factice : ligne de combattant ou en-tête de groupe */
export function makeRow({ combatantId = null, groupId = null, nestedGroupId = null } = {}) {
  const row = {
    dataset: {
      ...(combatantId ? { combatantId } : {}),
      ...(groupId ? { groupId } : {})
    },
    closest(selector) {
      if (selector === "[data-combatant-id]") return combatantId ? row : null;
      if (selector === "[data-group-id]") return groupId ? row : null;
      return null;
    },
    querySelector(selector) {
      if (selector === "[data-group-id]" && nestedGroupId) return { dataset: { groupId: nestedGroupId } };
      return null;
    }
  };
  return row;
}
