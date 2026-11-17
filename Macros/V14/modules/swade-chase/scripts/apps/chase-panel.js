/**
 * Panneau de poursuite partagé (ApplicationV2). Chaque utilisateur voit ses unités ; le MJ voit tout
 * et configure la poursuite. Les textes d'aide s'ouvrent avec le bouton « ? » de chaque action.
 */
import { MODULE_ID, VERSION, MODES, CHASE_TYPES, STATUS, OFF_TRACK_REASONS } from "../constants.js";
import { GROUPS } from "../rules/maneuvers.js";
import { chaseCardLabel, SUIT_LABELS, isRedSuit, triggersComplication } from "../rules/cards.js";
import { complicationFor } from "../rules/complication.js";
import { getChase, isChaseActive } from "../services/state.js";
import { computeChaseView, actionsFor, turnOf, autoSpeedFor } from "../services/chase.js";
import { minPlanned, multiActionMod, MAX_ACTIONS, turnDone, plannedLocked, actionsSpent, remainingActions, currentTurn } from "../rules/turn.js";
import { asGM, canControl, canObserve } from "../services/socket.js";
import { startChase, endChase, runActionRoll, runActionApply, endTurn } from "../services/handlers.js";
import { broadcast } from "../services/socket.js";
import { readSceneTrack } from "../services/track-reader.js";
import { signed, modsTotal } from "../services/util.js";
import { mountCandidates } from "../services/mount.js";
import { complicationBlock, rollUnitComplication } from "../services/complication-flow.js";
import { rollerMode } from "../integrations/swade-tools.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class ChasePanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "swade-chase-panel",
    classes: ["swade-chase"],
    tag: "section",
    window: { title: "Poursuite", icon: "fa-solid fa-person-running", resizable: true },
    position: { width: 460, height: 560 },
    actions: {
      roll: ChasePanel.onRoll,
      apply: ChasePanel.onApply,
      help: ChasePanel.onHelp,
      start: ChasePanel.onStart,
      end: ChasePanel.onEnd,
      setTab: ChasePanel.onSetTab,
      plan: ChasePanel.onPlan,
      resetTurn: ChasePanel.onResetTurn,
      endTurn: ChasePanel.onEndTurn,
      endTurnEarly: ChasePanel.onEndTurnEarly,
      reopenFor: ChasePanel.onReopenFor,
      gmBump: ChasePanel.onGmBump,
      compRoll: ChasePanel.onCompRoll,
      compResolve: ChasePanel.onCompResolve,
      compSuit: ChasePanel.onCompSuit
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/panel.hbs`, scrollable: [".sc-body"] }
  };

  /** Ouvre (ou ramène au premier plan) le panneau. */
  static open() {
    if (!ChasePanel.instance) ChasePanel.instance = new ChasePanel();
    const app = ChasePanel.instance;
    const options = { force: true };
    // Fenêtre pas encore rendue : la taille passe par les options de rendu (setPosition exige un élément).
    if (!app.rendered) {
      options.position = {
        width: Math.min(460, window.innerWidth - 40),
        height: Math.min(600, Math.round(window.innerHeight * 0.8))
      };
    }
    app.render(options);
    return app;
  }

  static refresh() {
    const app = ChasePanel.instance;
    if (app?.rendered) app.render();
  }

  constructor(options) {
    super(options);
    this.selectedId = null;
    this.speedBonus = new Map();
    this.openHelp = new Set();
    this.tab = "move";
    this.lastTurnKey = null;
  }

  get combat() {
    return game.combat ?? null;
  }

  async _prepareContext() {
    const isGM = game.user.isGM;
    let launcher = "native";
    try { launcher = game.settings.get(MODULE_ID, "launcher"); } catch { /* réglage absent */ }
    const mode = launcher === "native" ? "native" : rollerMode();
    const launcherLabel = { native: "jets natifs SWADE", simple: "SWADE Tools (jets simplifiés)", tagged: "SWADE Tools" }[mode];
    const base = { version: VERSION, isGM, launcherLabel };
    const combat = this.combat;
    if (!combat) return { ...base, noCombat: true };

    const chase = getChase(combat) ?? { type: "ground", interval: 5 };
    const config = this.#configContext(chase);
    const trackCount = readSceneTrack(combat.scene ?? canvas?.scene).length;
    if (!isChaseActive(combat)) return { ...base, inactive: true, config, trackCount, started: combat.started };

    const view = computeChaseView(combat);
    const visible = [...view.units.values()].filter((u) => isGM || canObserve(game.user, u.combatant));
    const active = combat.combatant?.id;
    // Le tour a changé : on suit le nouveau participant actif (s'il est visible pour cet utilisateur).
    const turnKey = `${combat.id}:${combat.round}:${active}`;
    if (turnKey !== this.lastTurnKey) {
      this.lastTurnKey = turnKey;
      if (visible.some((u) => u.combatant.id === active) && this.selectedId !== active) {
        this.selectedId = active;
        this.tab = "move";          // nouveau participant : on repart sur l'onglet Déplacement
      }
    }
    if (!visible.some((u) => u.combatant.id === this.selectedId)) {
      this.selectedId = visible.find((u) => u.combatant.id === active)?.combatant.id ?? visible[0]?.combatant.id ?? null;
    }
    const units = visible.map((u) => ({
      id: u.combatant.id,
      label: `${u.combatant.name}${u.combatant.id === active ? " (son tour)" : ""}${!canControl(game.user, u.combatant) ? " (lecture seule)" : ""}${u.unit.status !== "in" ? ` — ${STATUS[u.unit.status]}` : ""}`,
      selected: u.combatant.id === this.selectedId
    }));

    const ctx = {
      ...base, active: true, config,
      players: isGM ? game.users.filter((u) => !u.isGM && u.active).map((u) => ({ id: u.id, name: u.name })) : [],
      typeLabel: CHASE_TYPES[chase.type]?.label ?? "", interval: view.chase.interval,
      trackCount: view.track.length,
      trackWarning: !view.track.length
        ? (game.modules.get("complete-card-management")?.active
          ? "Aucune carte de poursuite sur cette scène : posez la piste avec Complete Card Management."
          : "Le module Complete Card Management n'est pas actif : la piste ne peut pas être lue.")
        : null,
      units, showUnitSelect: units.length > 1, noUnits: !units.length,
      round: combat.round
    };

    const me = this.selectedId ? view.units.get(this.selectedId) : null;
    if (me) Object.assign(ctx, this.#unitContext(view, me, isGM));
    return ctx;
  }

  #configContext(chase) {
    return {
      types: Object.entries(CHASE_TYPES).map(([value, t]) => ({
        value, label: t.interval ? `${t.label} (Intervalle ${t.interval})` : t.label, selected: value === chase.type
      })),
      interval: chase.interval,
      customInterval: chase.type === "custom",
      cityStreets: !!chase.cityStreets,
      rooftops: !!chase.rooftops,
      oneManeuver: chase.oneManeuver === true
    };
  }

  #unitContext(view, me, isGM) {
    const id = me.combatant.id;
    const card = me.actionCard;
    const chaseCard = me.loc.onTrack ? view.track[me.loc.index] : null;
    const alt = me.loc.ambiguous ? view.track[me.loc.alternative] : null;
    const auto = autoSpeedFor(view, id);
    const manual = this.speedBonus.has(id) ? this.speedBonus.get(id) : null;
    const bonus = manual ?? auto?.bonus ?? 0;
    const canAct = canControl(game.user, me.combatant);

    const compBlock = complicationBlock(this.combat, me.combatant, me.unit, canAct);
    let complication = null;
    const compDone = me.unit.complication?.round === view.round;
    if (!compBlock && !compDone && me.unit.status === "in" && triggersComplication(card)) {
      complication = "Trèfle : Complication au début de son tour, avant toute action.";
    }

    const speedOptions = [
      ...(auto ? [{ value: "auto", label: `Vitesse auto (${auto.bonus ? `+${auto.bonus}` : "—"})`, selected: manual == null }] : []),
      ...[0, 1, 2].map((v) => ({ value: String(v), label: `Vitesse ${v ? `+${v}` : "—"}`, selected: manual === v || (!auto && manual == null && v === 0) }))
    ];
    const speedTip = auto
      ? (auto.kind === "pace"
        ? `Calculé : Allure ${auto.mine} contre ${auto.fastest} pour le plus rapide des assaillants. Strictement plus rapide : +1 ; au moins deux fois plus rapide : +2.`
        : `Calculé : ${Math.round(auto.mine)} km/h contre ${Math.round(auto.fastest)} km/h pour le plus rapide des assaillants. Strictement plus rapide : +1 ; au moins deux fois plus rapide : +2.`)
      : "Bonus de vitesse : +1 si vous êtes plus rapide (Allure ou Vitesse max) que le plus rapide de vos assaillants, +2 si vous l'êtes au moins deux fois. Calcul automatique entre véhicules (Vitesse max) ou entre personnages à pied (Allure).";
    const actions = actionsFor(view, id, { speedBonus: bonus }).map((a) => ({
      ...a,
      speedSelect: a.id === "changePosition" && me.unit.status === "in",
      speedOptions, speedTip,
      helpOpen: this.openHelp.has(a.id),
      canAct,
      rolls: a.rolls.map((r) => ({ ...r, total: r.mods.length ? signed(modsTotal(r.mods)) : "" })),
      targets: a.targets ?? []
    }));
    const TAB_LABELS = { move: "Déplacement", harass: "Adversaires", defend: "Défense", usual: "Autres" };
    const tabs = GROUPS.map((g) => {
      const list = actions.filter((a) => a.group === g.id);
      return { id: g.id, label: TAB_LABELS[g.id] ?? g.label, title: g.label, actions: list,
        count: list.filter((a) => a.available && (a.rolls.length || a.applies.length)).length };
    }).filter((t) => t.actions.length);
    if (isGM) tabs.push({ id: "gm", label: "Réglages", title: "Réglages du MJ", actions: [], count: null, gm: true });
    if (!tabs.some((t) => t.id === this.tab)) this.tab = tabs[0]?.id ?? "move";
    for (const t of tabs) t.active = t.id === this.tab;
    const currentTab = tabs.find((t) => t.active);

    const turn = turnOf(view, id);
    const multi = multiActionMod(turn.planned);
    const locked = plannedLocked(turn) && !isGM;
    const done = turnDone(turn);
    const turnCtx = {
      done, locked, spent: !done && actionsSpent(turn),
      isTurn: this.combat?.combatant?.id === id,
      lockTip: locked ? "Verrouillé après la première action du tour (le MJ peut corriger)." : "Nombre d'actions prévues ce tour",
      planned: turn.planned, used: turn.standard.length,
      freeUsed: !!turn.free, exclusive: turn.exclusive,
      helpOpen: this.openHelp.has("turn"),
      options: Array.from({ length: MAX_ACTIONS }, (_, i) => i + 1).map((n) => {
        const m = multiActionMod(n);
        return { n, label: m ? `${n} (${m.value})` : `${n}`, selected: n === turn.planned,
          disabled: !canAct || turn.exclusive || locked || n < minPlanned(turn) };
      }),
      malus: multi ? multi.value : null
    };

    return {
      unit: {
        id, name: me.combatant.name, img: me.combatant.img ?? me.combatant.actor?.img,
        isTurn: this.combat?.combatant?.id === id,
        onHold: me.onHold,
        isVehicle: me.isVehicle,
        mounted: !me.isVehicle,
        mount: me.mount ? { name: me.mount.name, fatigue: Number(me.mount.actor.system?.fatigue?.value) || 0 } : null,
        mounts: isGM && !me.isVehicle
          ? [{ value: "", label: "— aucune —", selected: !me.unit.mountTokenId },
             ...mountCandidates(this.combat, me.combatant).map((m) => ({ ...m, selected: m.value === me.unit.mountTokenId }))]
          : [],
        modeLabel: MODES[me.unit.mode]?.label, skill: MODES[me.unit.mode]?.skill,
        status: me.unit.status, statusLabel: STATUS[me.unit.status], inChase: me.unit.status === "in",
        out: me.unit.status === "out",
        actionCard: card ? { label: card.label, red: card.red, clubs: card.suit === "clubs" && !card.isJoker, joker: card.isJoker } : null,
        chaseCard: chaseCard ? {
          label: chaseCardLabel(chaseCard), suitLabel: SUIT_LABELS[chaseCard.suit], red: isRedSuit(chaseCard.suit),
          position: me.loc.index + 1, count: view.track.length
        } : null,
        ambiguous: me.loc.ambiguous ? `Jeton entre deux cartes : rattaché au ${chaseCardLabel(chaseCard)} plutôt qu'au ${chaseCardLabel(alt)}. Recentrez-le si besoin.` : null,
        offTrack: !me.loc.onTrack ? `Jeton ${OFF_TRACK_REASONS[me.loc.reason] ?? "hors piste"}.` : null,
        complication, complicationBlock: compBlock,
        canAct,
        readOnly: !canAct,
        modes: [
          { value: "auto", label: `Automatique : ${MODES[me.unit.mode]?.label ?? ""}`, selected: me.unit.modeSetting === "auto" },
          ...Object.entries(MODES).map(([value, m]) => ({ value, label: `${m.label} (${m.skill})`, selected: me.unit.modeSetting === value }))
        ],
        statuses: Object.entries(STATUS).map(([value, label]) => ({ value, label, selected: value === me.unit.status })),
        npcCrew: me.unit.npcCrew,
        speedOptions: [0, 1, 2].map((v) => ({ value: v, label: v ? `+${v}` : "Aucun", selected: v === bonus }))
      },
      tabs, currentTab, turn: turnCtx
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const el of this.element.querySelectorAll("[data-sc-field]")) {
      el.addEventListener("change", (ev) => this.#onField(ev.currentTarget));
    }
  }

  async #onField(el) {
    const field = el.dataset.scField;
    const combat = this.combat;
    if (!combat) return;
    const value = el.type === "checkbox" ? el.checked : el.value;
    switch (field) {
      case "unit": this.selectedId = value; return this.render();
      case "speed":
        if (value === "auto") this.speedBonus.delete(this.selectedId);
        else this.speedBonus.set(this.selectedId, Number(value) || 0);
        return this.render();
      case "type": case "interval": case "cityStreets": case "rooftops": case "oneManeuver":
        return asGM("setChase", { combatId: combat.id, patch: { [field]: value } });
      case "mode": case "status": case "npcCrew": case "mountTokenId":
        return asGM("setUnit", { combatId: combat.id, combatantId: this.selectedId, patch: { [field]: value } });
    }
  }

  static async onRoll(event, target) {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    target.disabled = true;
    try {
      await runActionRoll(combat, this.selectedId, target.dataset.actionId, target.dataset.key,
        { speedBonus: this.speedBonus.has(this.selectedId) ? this.speedBonus.get(this.selectedId) : undefined });
    } finally { target.disabled = false; }
  }

  static async onApply(event, target) {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    target.disabled = true;
    try {
      await runActionApply(combat, this.selectedId, target.dataset.actionId, target.dataset.key);
    } finally { target.disabled = false; }
  }

  static onHelp(event, target) {
    const id = target.dataset.helpId;
    if (this.openHelp.has(id)) this.openHelp.delete(id); else this.openHelp.add(id);
    this.render();
  }

  static onSetTab(event, target) {
    this.tab = target.dataset.tab;
    this.render();
  }

  static async onPlan(event, target) {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    await asGM("setPlanned", { combatId: combat.id, combatantId: this.selectedId, planned: Number(target.dataset.n) });
  }

  static async onGmBump(event, target) {
    const combat = this.combat;
    if (!combat || !this.selectedId || !game.user.isGM) return;
    const control = target.dataset.control === "1";
    await asGM("damageBump", {
      combatId: combat.id, combatantId: this.selectedId, control,
      cause: control ? "vehicle" : "manual"
    });
  }

  static async onCompRoll() {
    const combat = this.combat;
    if (combat && this.selectedId) await rollUnitComplication(combat, this.selectedId);
  }

  static async onCompResolve(event, target) {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    target.disabled = true;
    await asGM("unitComplicationResolve", { combatId: combat.id, combatantId: this.selectedId, outcome: target.dataset.outcome });
  }

  static async onCompSuit(event, target) {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    await asGM("unitComplicationPatch", { combatId: combat.id, combatantId: this.selectedId, patch: { suit: target.dataset.suit } });
  }

  /** Passer au participant suivant avant d'avoir tout joué : avertissement s'il reste des actions. */
  static async onEndTurnEarly() {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    const combatant = combat.combatants.get(this.selectedId);
    const unit = combat.flags?.[MODULE_ID]?.units?.[this.selectedId] ?? {};
    const left = remainingActions(currentTurn(unit.turn, combat.round));
    const comp = unit.complication?.round === combat.round && unit.complication?.state !== "resolved";
    const warnings = [...(comp ? ["la Complication n'est pas résolue"] : []), ...(left.length ? [`il reste ${left.join(" et ")}`] : [])];
    if (warnings.length) {
      const ok = await DialogV2.confirm({
        window: { title: "Passer au participant suivant", icon: "fa-solid fa-triangle-exclamation" },
        content: `<p><strong>Attention</strong> : ${warnings.join(" ; ")} pour ${combatant?.name ?? "ce participant"}.</p><p>Passer quand même au participant suivant ? Les actions non jouées sont perdues.</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    await endTurn(combat, this.selectedId);
  }

  /** MJ : rouvre le panneau chez un joueur (ou tous) s'il l'a fermé ; rien s'il est déjà ouvert. */
  static async onReopenFor(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.userId;
    await broadcast("forceOpenPanel", { userIds: id ? [id] : null });
    ui.notifications.info(id ? `Panneau rouvert chez ${game.users.get(id)?.name ?? "le joueur"} (s'il était fermé).` : "Panneau rouvert chez les joueurs qui l'avaient fermé.");
  }

  static async onEndTurn() {
    const combat = this.combat;
    if (!combat || !this.selectedId) return;
    await endTurn(combat, this.selectedId);
  }

  static async onResetTurn() {
    const combat = this.combat;
    if (!combat || !this.selectedId || !game.user.isGM) return;
    await asGM("resetTurn", { combatId: combat.id, combatantId: this.selectedId });
  }

  static async onStart() {
    const combat = this.combat;
    if (!combat || !game.user.isGM) return;
    await startChase(combat);
  }

  static async onEnd() {
    const combat = this.combat;
    if (!combat || !game.user.isGM) return;
    const ok = await DialogV2.confirm({
      window: { title: "Terminer la poursuite" },
      content: "<p>Terminer la poursuite ? Le combat continue ; seules les aides de poursuite s'arrêtent.</p>"
    });
    if (ok) await endChase(combat);
  }
}
