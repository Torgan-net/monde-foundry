/**
 * Faux environnement Foundry minimal pour les tests en Node.
 * installFoundryStubs() place game, foundry, Hooks, CONFIG… sur globalThis et renvoie des outils :
 *  - hooks : handlers enregistrés, par nom ; callHook(name, ...args) les exécute ;
 *  - actors : registre UUID → document pour fromUuidSync ;
 *  - calls : journal des effets de bord (messages de chat, notifications).
 */

export function installFoundryStubs() {
  const hooks = {};
  const calls = { chat: [], notifications: [], settings: {}, sheets: [] };
  const add = (name, fn, once) => { (hooks[name] ??= []).push({ fn, once }); };

  globalThis.Hooks = {
    on: (n, fn) => add(n, fn, false),
    once: (n, fn) => add(n, fn, true),
    callAll: (n, ...a) => (hooks[n] ?? []).forEach((h) => h.fn(...a)),
    call: (n, ...a) => (hooks[n] ?? []).every((h) => h.fn(...a) !== false)
  };

  class Actor {}
  globalThis.Actor = Actor;
  globalThis.Item = class Item {};
  globalThis.RollTable = class RollTable {};
  globalThis.ActiveEffect = class ActiveEffect {};

  const actors = {};
  globalThis.fromUuidSync = (uuid) => actors[uuid] ?? null;
  globalThis.fromUuid = async (uuid) => actors[uuid] ?? null;

  class ApplicationV2 { constructor(options = {}) { this.options = options; } }
  globalThis.foundry = {
    utils: {
      deepClone: (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o))),
      randomID: () => Math.random().toString(36).slice(2, 10),
      getProperty: (o, p) => p.split(".").reduce((x, k) => x?.[k], o),
      setProperty: (o, p, v) => { const ks = p.split("."); const last = ks.pop(); ks.reduce((x, k) => (x[k] ??= {}), o)[last] = v; },
      hasProperty: (o, p) => p.split(".").reduce((x, k) => (x && k in Object(x) ? x[k] : undefined), o) !== undefined,
      mergeObject: (a, b) => Object.assign(a, b),
      escapeHTML: (t) => String(t)
    },
    applications: {
      api: { ApplicationV2, HandlebarsApplicationMixin: (C) => C, DialogV2: { confirm: async () => true, prompt: async () => null, wait: async () => null } },
      sheets: { ActorSheetV2: class ActorSheetV2 extends ApplicationV2 {} },
      apps: { DocumentSheetConfig: { registerSheet: (...a) => calls.sheets.push(a) }, FilePicker: { implementation: class {} }, ImagePopout: class {} },
      ux: { TextEditor: { implementation: { enrichHTML: async (h) => h, getDragEventData: () => null } } },
      instances: new Map()
    }
  };

  class VehicleModel { prepareDerivedData() { this.scale = 0; } }
  globalThis.CONFIG = { statusEffects: [{ id: "distracted", name: "Distrait" }, { id: "vulnerable", name: "Vulnérable" }, { id: "shaken", name: "Secoué" }],
    Actor: { sheetClasses: {}, dataModels: { vehicle: VehicleModel } } };
  globalThis.CONST = {};

  globalThis.ui = { notifications: { warn: (m) => calls.notifications.push(m), info: (m) => calls.notifications.push(m), error: (m) => calls.notifications.push(m) } };
  globalThis.ChatMessage = {
    create: async (d) => { calls.chat.push(d); return d; },
    getSpeaker: () => ({}),
    getWhisperRecipients: () => []
  };

  const module = { id: "swade-vehicle", version: "test", active: true };
  globalThis.game = {
    user: { id: "u1", isGM: true, name: "MJ", targets: new Set() },
    users: { activeGM: { isSelf: true }, get: () => null },
    combats: [],
    actors: { get: (id) => Object.values(actors).find((a) => a.id === id) ?? null },
    modules: { get: (id) => (id === "swade-vehicle" ? module : null) },
    settings: {
      settings: new Map(),
      register: (ns, key, data) => { calls.settings[`${ns}.${key}`] = data; },
      get: (ns, key) => calls.settings[`${ns}.${key}`]?.default
    },
    i18n: { localize: (k) => k },
    swade: {}
  };

  const callHook = async (name, ...args) => {
    for (const h of hooks[name] ?? []) await h.fn(...args);
  };

  return { hooks, calls, actors, callHook, module, VehicleModel };
}

/** Faux acteur véhicule : getFlag / setFlag / update enregistrent dans des objets simples. */
export function makeVehicle({ uuid = "Actor.V", name = "Far Star", system = {}, flags = {}, items = [] } = {}) {
  const v = Object.assign(new globalThis.Actor(), {
    uuid, id: uuid.split(".").pop(), name, type: "vehicle", img: "ship.png", isOwner: true, effects: [],
    system: structuredClone(system), flags: { "swade-vehicle": structuredClone(flags) }, updates: []
  });
  v._source = { system: structuredClone(system) };
  v.items = Object.assign([...items], { get: (id) => items.find((i) => i.id === id) });
  v.getFlag = (scope, key) => foundry.utils.getProperty(v.flags[scope] ?? {}, key);
  v.setFlag = async (scope, key, value) => { foundry.utils.setProperty((v.flags[scope] ??= {}), key, value); };
  v.unsetFlag = async (scope, key) => { const ks = key.split("."); const last = ks.pop(); const o = ks.reduce((x, k) => x?.[k], v.flags[scope]); if (o) delete o[last]; };
  v.update = async (data) => {
    v.updates.push(data);
    for (const [k, val] of Object.entries(data)) if (k.startsWith("system.")) foundry.utils.setProperty(v, k, val);
  };
  v.createEmbeddedDocuments = async (type, docs) => {
    for (const d of docs) {
      const e = { ...structuredClone(d), getFlag: (s, k) => e.flags?.[s]?.[k],
        update: async (u) => Object.assign(e, u), delete: async () => v.effects.splice(v.effects.indexOf(e), 1) };
      v.effects.push(e);
    }
  };
  return v;
}

/** Faux jets : chaque new Roll(formule).evaluate() renvoie la prochaine valeur de la file. */
export function installRollQueue() {
  const queue = [];
  globalThis.Roll = class Roll {
    constructor(formula) { this.formula = formula; }
    async evaluate() {
      if (!queue.length) throw new Error(`File de jets vide pour ${this.formula}`);
      this.total = queue.shift();
      this.dice = [{ results: [{ result: this.total }] }];
      return this;
    }
    async toMessage() {}
  };
  return queue;
}

export function makeCharacter({ uuid, name, wildcard = true } = {}) {
  return Object.assign(new globalThis.Actor(), {
    uuid, id: uuid.split(".").pop(), name, type: "character", isWildcard: wildcard, isOwner: true, bennies: 0,
    items: Object.assign([], { get: () => null }), statuses: new Set(), effects: [],
    getBenny() { this.bennies += 1; },
    async toggleStatusEffect(id, { active = true } = {}) { if (active) this.statuses.add(id); else this.statuses.delete(id); }
  });
}
