/**
 * Faux objets Foundry pour tester les services en Node. Données issues des dumps réels du 15/11/2026.
 */

export class Collection extends Map {
  find(fn) { for (const v of this.values()) if (fn(v)) return v; return undefined; }
  filter(fn) { return [...this.values()].filter(fn); }
  some(fn) { return [...this.values()].some(fn); }
  map(fn) { return [...this.values()].map(fn); }
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {});
  o[keys.at(-1)] = value;
}

export function installFoundryStubs({ gm = true } = {}) {
  globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
  const hooks = new Map();
  const created = [];
  const updates = [];

  const ApplicationV2 = class {
    constructor(options = {}) { this.options = options; this.rendered = false; this.element = null; }
    render(options = {}) { this.rendered = true; this.element = {}; this.lastRenderOptions = options; return this; }
    setPosition() { if (!this.element) throw new TypeError("Cannot read properties of undefined (reading 'style')"); }
  };

  globalThis.foundry = {
    utils: { deepClone: (o) => structuredClone(o) },
    applications: {
      api: {
        ApplicationV2,
        HandlebarsApplicationMixin: (Base) => class extends Base {},
        DialogV2: {
          wait: async (opts) => {
            globalThis.__lastDialog = opts;
            const q = globalThis.__dialogQueue;
            if (q?.length) return q.shift();
            return globalThis.__dialogAnswer ?? null;
          },
          confirm: async (o) => { globalThis.__lastConfirm = o; return globalThis.__confirmAnswer ?? true; }
        }
      },
      handlebars: { loadTemplates: () => {} }
    }
  };

  let hookId = 0;
  globalThis.Hooks = {
    on: (name, fn) => { if (!hooks.has(name)) hooks.set(name, []); fn.__id = ++hookId; hooks.get(name).push(fn); return hookId; },
    off: (name, id) => { hooks.set(name, (hooks.get(name) ?? []).filter((f) => f.__id !== id)); },
    once: (name, fn) => { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn); },
    callAll: (name, ...args) => (hooks.get(name) ?? []).forEach((fn) => fn(...args)),
    _hooks: hooks
  };

  const settings = new Map([["swade-chase.launcher", "auto"], ["swade-chase.autoOpen", true]]);
  const user = { id: "u1", isGM: gm };

  globalThis.game = {
    user,
    users: new Collection([["u1", user]]),
    settings: {
      register: (m, k, d) => { if (!settings.has(`${m}.${k}`) || m !== "swade-chase") settings.set(`${m}.${k}`, d.default); },
      get: (m, k) => { if (!settings.has(`${m}.${k}`)) throw new Error(`setting ${m}.${k} not registered`); return settings.get(`${m}.${k}`); }
    },
    socket: { on: () => {}, emit: () => {} },
    modules: new Collection([
      ["swade-chase", { id: "swade-chase", active: true }],
      ["complete-card-management", { id: "complete-card-management", active: true }]
    ]),
    cards: new Collection(),
    combats: new Collection(),
    messages: new Collection(),
    combat: null
  };
  game.users.activeGM = gm ? { isSelf: true } : null;

  globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
  globalThis.CONFIG = { sounds: {} };
  globalThis.canvas = { ready: false, scene: null, grid: { size: 100 }, layers: [] };

  let msgId = 0;
  globalThis.ChatMessage = {
    getSpeaker: (o) => ({ alias: o?.actor?.name ?? "?" }),
    create: async (data) => {
      const id = `m${++msgId}`;
      const msg = {
        id, ...data, flags: data.flags ?? {},
        update: async (patch) => {
          updates.push({ doc: "message", id, patch });
          for (const [k, v] of Object.entries(patch)) setPath(msg, k, v);
        }
      };
      created.push(msg);
      game.messages.set(id, msg);
      return msg;
    }
  };

  globalThis.__rollTotal = 3;
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { this.total = globalThis.__rollTotal; return this; }
    async toMessage() { return null; }
  };

  return { hooks, created, updates, setPath };
}

/** Piste et combat du dump. */
export function buildDumpWorld(stubs) {
  const sceneId = "MPy3bt7bDJVBNE46";
  const ccm = (x, y, sort) => ({ "complete-card-management": { [sceneId]: { x, y, rotation: 0, sort } } });
  const trackCards = [
    ["King of Clubs", "clubs", 13, 1004.24, 1780.72],
    ["2 of Hearts", "hearts", 2, 1352.29, 1682.28],
    ["9 of Diamonds", "diamonds", 9, 1686.72, 1621.49],
    ["3 of Diamonds", "diamonds", 3, 2059.38, 1623.67],
    ["9 of Clubs", "clubs", 9, 2409.25, 1666.02],
    ["2 of Clubs", "clubs", 2, 2776.77, 1699.31],
    ["Ace of Clubs", "clubs", 14, 3104.86, 1605.83],
    ["4 of Spades", "spades", 4, 3455.56, 1454.41],
    ["7 of Clubs", "clubs", 7, 3781.16, 1393.57]
  ].map(([name, suit, value, x, y], i) => ({ uuid: `Cards.P.Card.${i}`, name, suit, value, flags: ccm(x, y, i) }));
  // Une carte d'aventure posée sur la même scène : doit être ignorée.
  trackCards.push({ uuid: "Cards.A.Card.x", name: "Rally", suit: "", value: null, flags: ccm(0, 0, 9) });
  game.cards.set("pile", { cards: new Collection(trackCards.map((c) => [c.uuid, c])) });
  // Cartes posées sur une autre scène : ignorées.
  game.cards.set("voyage", { cards: new Collection([["v", { uuid: "v", suit: "spades", value: 4,
    flags: { "complete-card-management": { other: { x: 0, y: 0, rotation: 0, sort: 0 } } } }]]) });

  const scene = { id: sceneId, grid: { size: 100 }, tokens: new Collection() };
  const tok = (id, x, y, disposition) => {
    const t = { id, x, y, width: 1, height: 1, disposition, parent: scene,
      update: async (patch) => { stubs.updates.push({ doc: "token", id, patch }); Object.assign(t, patch); } };
    return t;
  };
  const actor = (name, owner = true) => {
    const a = {
      name, type: "character", isOwner: owner, img: "",
      system: { fatigue: { value: 0, max: 2 } },
      items: [{ id: `${name}-ath`, type: "skill", name: "Athlétisme", system: { swid: "athletics" } }],
      testUserPermission: () => owner,
      update: async (patch) => { stubs.updates.push({ doc: "actor", name, patch }); for (const [k, v] of Object.entries(patch)) stubs.setPath(a, k, v); },
      rollSkill: async (id, opts) => { stubs.updates.push({ doc: "roll", name, id, opts }); return { total: 2, isCritfail: false }; },
      makeUnskilledAttempt: async (opts) => { stubs.updates.push({ doc: "roll", name, id: "unskilled", opts }); return { total: 1, isCritfail: false }; }
    };
    return a;
  };
  actor.cache = {};
  const mk = (id, name, sys, t) => {
    const a = actor(name); actor.cache[name] = a;
    const cb = { id, name, tokenId: t.id, token: t, actor: a, system: sys, isDefeated: false, img: "",
      update: async (patch) => { stubs.updates.push({ doc: "combatant", id, patch }); for (const [k, v] of Object.entries(patch)) stubs.setPath(cb, k, v); } };
    return cb;
  };
  const card = (v, s, j = false, str = "") => ({ cardValue: v, suitValue: s, hasJoker: j, cardString: str });
  const combatants = [
    mk("cG1", "Goblin", card(6, 3), tok("t1", 2493, 1446, -1)),
    mk("cG2", "Goblin", card(7, 3), tok("t2", 2452, 1570, -1)),
    mk("cG3", "Goblin", card(98, 4, true, "Blk J"), tok("t3", 1406, 1590, -1)),
    mk("cG4", "Goblin", card(9, 3), tok("t4", 2790, 1431, -1)),
    mk("cEl", "Elharn", card(99, 4, true, "Red J"), tok("t5", 3626, 1320, 1)),
    mk("cJa", "Janar", card(10, 1, false, "10♣"), tok("t6", 3491, 1181, 1)),
    mk("cEd", "Edrin \"Ed\"", card(12, 2, false, "Q♦"), tok("t7", 3812, 1158, 1)),
    mk("cKa", "Kapla", card(5, 2), tok("t8", 4007, 1270, 1))
  ];
  const combat = {
    id: "combat1", round: 1, started: true, active: true, scene,
    flags: {},
    combatants: new Collection(combatants.map((c) => [c.id, c])),
    combatant: combatants[5],
    nextTurn: async () => { stubs.updates.push({ doc: "nextTurn" }); },
    update: async (patch) => {
      stubs.updates.push({ doc: "combat", patch });
      for (const [k, v] of Object.entries(patch)) stubs.setPath(combat, k, v);
    }
  };
  for (const c of combatants) { c.parent = combat; Object.assign(c.token, { actor: c.actor, name: c.name }); scene.tokens.set(c.token.id, c.token); }
  // Une monture posée sur la scène, hors combat
  const horse = actor("Cheval");
  horse.system.pace = { base: "ground", ground: 12, default: 12 };
  horse.system.fatigue = { value: 0, max: 2 };
  scene.tokens.set("tHorse", { id: "tHorse", name: "Cheval", actor: horse, x: -1000, y: -1000, width: 2, height: 2 });
  game.combats.set(combat.id, combat);
  game.combat = combat;
  canvas.scene = scene;
  return { combat, scene, combatants, horse };
}
