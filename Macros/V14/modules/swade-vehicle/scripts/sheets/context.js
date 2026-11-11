/** Contexte d'affichage de la fiche véhicule (onglets Passerelle, Cargaison, Équipement, Journal, Conception). */

import { MANEUVER_SKILLS, MODULE_ID, STATUS, TYPE_LABEL, VERSION, maneuverLabel } from "../constants.js";
import { computeVehicleClasse, computeWeaponClasse, stripClasse, weaponClasseValue } from "../rules/classes.js";
import { powerLabel } from "../rules/energy.js";
import { WARHEADS } from "../rules/heavy-metal.js";
import { toInt } from "../rules/numbers.js";
import { scaleForSize, woundsForSize } from "../rules/size.js";
import { combineSupportBonuses, defaultSupportSkill, normalizeSupports, pendingSupportBonuses, supportCrewCount } from "../rules/support.js";
import { CRIT_MAX } from "../rules/tables.js";
import { powerMods, powerState, powerSystems } from "../services/energy.js";
import { actorFromUuid, actorStatuses, effectiveScale, effectsOn, findSkill, tokenImg } from "../services/foundry-utils.js";
import { actorCombat, heavyMetalCombat } from "../services/heavy-metal.js";
import { shieldInfo } from "../services/shield.js";
import { supportSkillKey, supportSkillOptions, supportSkillText } from "../services/support.js";
import { vehicleWoundsValue } from "../services/wounds.js";

export function weaponContext(sheet, item, canAct) {
  const s = item.system;
  const destroyed = (sheet.document.getFlag(MODULE_ID, "crits")?.destroyed ?? []).includes(item.id);
  if (destroyed) canAct = false;
  const parts = [s.damage, s.ap ? `PA ${s.ap}` : null, s.range, s.rof ? `CdT ${s.rof}` : null,
    s.isHeavyWeapon ? "ArmL" : null, s.shots ? `${s.currentShots} / ${s.shots}` : null].filter(Boolean);
  const actions = Object.entries(s.actions?.additional ?? {})
    .filter(([, a]) => a.type === "trait" || a.type === "damage")
    .map(([id, a]) => ({ id, name: a.name }));
  return {
    id: item.id,
    name: stripClasse(item.name),
    classe: item.getFlag(MODULE_ID, "classe") || computeWeaponClasse(item),
    stats: parts.join(" · "),
    actions,
    canAct,
    destroyed
  };
}

export function modContext(sheet, item, canAct) {
  const s = item.system;
  const actions = [];
  if (s.actions?.trait) actions.push({ id: "__main", name: s.actions.trait });
  for (const [id, a] of Object.entries(s.actions?.additional ?? {})) {
    if (a.type === "trait") actions.push({ id, name: a.name });
  }
  const charge = s.charges?.hasCharges ? s.charges.charges?.[0] : null;
  return {
    id: item.id,
    name: item.name,
    charges: charge ? `${charge.value} / ${charge.max}` : null,
    actions,
    canAct
  };
}

/** Données du gabarit vehicle-sheet.hbs. `sheet` est la fiche (document, onglet, verrou, replis). */
export async function buildSheetContext(sheet, context) {
  const actor = sheet.document;
  const sys = actor.system;
  const isGM = game.user.isGM;
  const postes = sheet.postes;

  const vehicular = actor.items.filter((i) => i.system?.isVehicular);
  const weaponsAll = vehicular.filter((i) => i.type === "weapon");
  const modsAll = vehicular.filter((i) => i.type !== "weapon");
  const cargo = actor.items.filter((i) => !i.system?.isVehicular && ("weight" in (i.system ?? {})));

  const modsUsed = vehicular.reduce((t, i) => t + toInt(i.system.mods) * (toInt(i.system.quantity) || 1), 0);
  const cargoUsed = cargo.reduce((t, i) => t + (Number(i.system.weight) || 0) * (toInt(i.system.quantity) || 1), 0);

  const woundsActive = Math.max(0, (sys.wounds?.value ?? 0) - (sys.wounds?.ignored ?? 0));
  const woundPenalty = -Math.min(woundsActive, 3);

  const occupants = new Set(postes.map((p) => p.occupant).filter(Boolean));
  // Équipage effectif : occupants distincts des postes + effectifs des soutiens (un acteur compte au moins pour 1).
  const supportCount = postes.reduce((t, p) => t + supportCrewCount(normalizeSupports(p)), 0);
  const crewCount = occupants.size + supportCount;
  const required = sys.crew?.required?.max ?? 0;

  const classeOverride = actor.getFlag(MODULE_ID, "classeOverride") ?? "";
  const classeAuto = computeVehicleClasse(actor);
  const classe = classeOverride || classeAuto;

  const postesCtx = postes.map((p) => {
    const occ = actorFromUuid(p.occupant);
    const canAct = isGM || !!occ?.isOwner;
    const mine = !isGM && !!occ?.isOwner;
    const ctx = {
      ...p,
      typeLabel: TYPE_LABEL[p.type] ?? p.type,
      isPilot: p.type === "pilote",
      isAutre: p.type === "autre" && !!p.skill,
      canAct,
      mine,
      occupant: p.occupant ? {
        uuid: p.occupant,
        name: occ?.name ?? "(introuvable)",
        img: tokenImg(p.occupant),
        missing: !occ,
        statuses: actorStatuses(occ)
      } : null,
      seatClass: mine ? "is-mine" : (occ ? "is-other" : ""),
      collapsed: sheet.collapsed.has(p.id),
      canGroup: isGM || actor.isOwner,
      supportPending: (() => {
        const list = pendingSupportBonuses(actor.getFlag(MODULE_ID, `supportBonus.${p.id}`));
        if (!list.length) return null;
        const n = combineSupportBonuses(list.map((b) => b.value));
        return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
      })(),
      supports: normalizeSupports(p).map((s) => {
        const sActor = s.actor ? actorFromUuid(s.actor) : null;
        const skill = sActor ? supportSkillKey(sActor, s.skill) : s.skill || defaultSupportSkill(p, sys.driver?.skill);
        const found = sActor && skill ? findSkill(sActor, skill) : null;
        const skillName = found ? supportSkillText(found) : skill ? maneuverLabel(skill) : null;
        const mod = s.mod ? (s.mod > 0 ? ` +${s.mod}` : ` −${Math.abs(s.mod)}`) : "";
        return {
          id: s.id,
          label: s.label || sActor?.name || "Groupe de soutien",
          actorName: s.actor ? (sActor?.name ?? "(introuvable)") : null,
          actorImg: s.actor ? tokenImg(s.actor) : null,
          actorUuid: s.actor,
          skillLabel: skillName,
          text: s.actor && sActor
            ? `${skillName ?? "aucune compétence"} par défaut · compétence choisie au jet`
            : `${s.count} pers. · d${s.die}${mod} + dé Joker`
        };
      }),
      maneuverHint: sys.driver?.skill
        ? `${maneuverLabel(sys.driver.skill)} · Maniabilité ${sys.handling ?? 0} · Blessures ${woundPenalty}`
        : "compétence de manœuvre non définie (onglet Conception)",
      hasManeuverSkill: !!sys.driver?.skill,
      weapons: (p.weapons ?? []).map((id) => actor.items.get(id)).filter(Boolean)
        .map((w) => weaponContext(sheet, w, canAct)),
      mods: (p.mods ?? []).map((id) => actor.items.get(id)).filter(Boolean)
        .map((m) => modContext(sheet, m, canAct))
    };
    return ctx;
  });

  const editPostes = postes.map((p) => ({
    ...p,
    typeOptions: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label, selected: value === p.type })),
    weaponOptions: weaponsAll.map((w) => ({ id: w.id, name: stripClasse(w.name), checked: (p.weapons ?? []).includes(w.id) })),
    modOptions: modsAll.map((m) => ({ id: m.id, name: m.name, checked: (p.mods ?? []).includes(m.id) })),
    supports: normalizeSupports(p).map((s) => ({
      ...s,
      skillOptions: supportSkillOptions(s.actor ? actorFromUuid(s.actor) : null, s.skill),
      actorName: s.actor ? (actorFromUuid(s.actor)?.name ?? "(introuvable)") : null,
      actorImg: s.actor ? tokenImg(s.actor) : null,
      skillPlaceholder: maneuverLabel(defaultSupportSkill(p, sys.driver?.skill)) ?? "ex. Electronics",
      dieOptions: [4, 6, 8, 10, 12].map((n) => ({ value: n, selected: n === s.die }))
    }))
  }));

  // Options du véhicule : cargaison et mods sont des choix du module (flags),
  // l'énergie utilise le champ natif system.energy.enabled.
  const featureFlags = actor.getFlag(MODULE_ID, "features") ?? {};
  const features = {
    cargo: featureFlags.cargo ?? ((sys.cargo?.max ?? 0) > 0 || cargo.length > 0),
    mods: featureFlags.mods ?? ((sys.mods?.max ?? 0) > 0 || modsAll.length > 0),
    energy: !!sys.energy?.enabled
  };
  if (sheet._tab === "cargaison" && !features.cargo) sheet._tab = "passerelle";

  const showConception = isGM && !sheet._locked;
  if (sheet._tab === "conception" && !showConception) sheet._tab = "passerelle";

  return Object.assign(context, {
    version: VERSION,
    isGM,
    locked: sheet._locked,
    showConception,
    heavyMetal: !!heavyMetalCombat(actor),
    inCombat: !!actorCombat(actor),
    tabs: {
      passerelle: sheet._tab === "passerelle",
      cargaison: sheet._tab === "cargaison",
      journal: sheet._tab === "journal",
      equipement: sheet._tab === "equipement",
      conception: sheet._tab === "conception"
    },
    img: actor.img,
    displayName: stripClasse(actor.name),
    fullName: actor.name,
    techFx: {
      handling: effectsOn(actor, "handling"),
      speed: effectsOn(actor, "topspeed.value"),
      toughness: effectsOn(actor, "toughness.total"),
      armor: effectsOn(actor, "toughness.armor"),
      woundsMax: effectsOn(actor, "wounds.max")
    },
    tech: {
      classification: actor._source?.system?.classification ?? sys.classification ?? "",
      size: actor._source?.system?.size ?? sys.size ?? 0,
      scale: actor._source?.system?.scale ?? sys.scale ?? 0,
      scaleForced: !!actor.getFlag(MODULE_ID, "scaleForced"),
      scaleAuto: scaleForSize(actor._source?.system?.size ?? sys.size),
      get scaleMismatch() { return !sheet.scaleForced && sheet.scale !== sheet.scaleAuto; },
      handling: actor._source?.system?.handling ?? sys.handling ?? 0,
      speed: actor._source?.system?.topspeed?.value ?? sys.topspeed?.value ?? 0,
      speedUnit: actor._source?.system?.topspeed?.unit ?? sys.topspeed?.unit ?? "",
      toughness: actor._source?.system?.toughness?.total ?? sys.toughness?.total ?? 0,
      armor: actor._source?.system?.toughness?.armor ?? sys.toughness?.armor ?? 0,
      woundsMax: actor._source?.system?.wounds?.max ?? sys.wounds?.max ?? 0,
      woundsForced: !!actor.getFlag(MODULE_ID, "woundsForced"),
      woundsAuto: woundsForSize(actor._source?.system?.size ?? sys.size),
      get woundsMismatch() { return !sheet.woundsForced && sheet.woundsMax !== sheet.woundsAuto; },
      cost: actor._source?.system?.cost ?? sys.cost ?? 0
    },
    critSummary: (() => {
      const c = actor.getFlag(MODULE_ID, "crits");
      if (!c) return null;
      const parts = [];
      if (c.handling) parts.push(`Maniabilité −${Math.min(c.handling, CRIT_MAX.handling)}`);
      if (c.speed) parts.push(`Vitesse −${Math.min(c.speed, CRIT_MAX.speed) * 10} %`);
      if (c.destroyed?.length) parts.push(`${c.destroyed.length} arme${c.destroyed.length > 1 ? "s" : ""} détruite${c.destroyed.length > 1 ? "s" : ""}`);
      return parts.length ? parts.join(" · ") : null;
    })(),
    journal: [...(actor.getFlag(MODULE_ID, "journal") ?? [])].reverse().map((e) => ({
      date: new Date(e.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
      user: e.u,
      text: e.text
    })),
    crew: {
      required: sys.crew?.required?.max ?? 0,
      passengersMax: sys.crew?.optional?.max ?? 0,
      passengers: sys.crew?.optional?.value ?? 0,
      members: occupants.size,
      support: supportCount,
      total: crewCount
    },
    maneuverOptions: (() => {
      const current = sys.driver?.skill ?? "";
      const opts = [{ value: "", label: "— à choisir —", selected: !current },
        ...Object.entries(MANEUVER_SKILLS).map(([value, label]) => ({ value, label, selected: value === current }))];
      if (current && !MANEUVER_SKILLS[current]) opts.push({ value: current, label: current, selected: true });
      return opts;
    })(),
    classe,
    classeOverride,
    classeSource: classeOverride ? "forcée" : (classeAuto ? "calculée" : "calcul à venir"),
    subtitle: [sys.classification, `Taille ${sys.size ?? "?"}`, `Échelle ${effectiveScale(actor)}`,
      `Manœuvre : ${maneuverLabel(sys.driver?.skill) ?? "non définie"}`].filter(Boolean).join(" · "),
    stats: [
      { label: "Maniabilité", value: sys.handling ?? 0 },
      { label: "Vitesse max", value: `${sys.topspeed?.value ?? "?"}${sys.topspeed?.unit ? " " + sys.topspeed.unit : ""}` },
      { label: "Résistance", value: `${sys.toughness?.total ?? "?"} (${sys.toughness?.armor ?? 0})` },
      ...(features.mods ? [{ label: "Mods", value: `${modsUsed} / ${sys.mods?.max ?? 0}`, warn: modsUsed > (sys.mods?.max ?? Infinity) }] : [])
    ],
    wounds: { value: vehicleWoundsValue(actor), max: sys.wounds?.max ?? 0, ignored: sys.wounds?.ignored ?? 0, over: vehicleWoundsValue(actor) > (sys.wounds?.max ?? 0) },
    statuses: STATUS.map(([key, label]) => ({ key, label, active: !!sys.status?.[key] })),
    crewAlert: required > 0 && crewCount < required
      ? `Équipage requis : ${crewCount} / ${required}${supportCount ? ` (dont ${supportCount} en soutien)` : ""}` : null,
    passengers: sys.crew?.optional ? `${sys.crew.optional.value ?? 0} / ${sys.crew.optional.max ?? 0}` : null,
    postes: postesCtx,
    editPostes,
    hasNativeCrew: (sys.crew?.members?.length ?? 0) > 0,
    weapons: weaponsAll.map((w) => ({
      id: w.id,
      name: stripClasse(w.name),
      computed: computeWeaponClasse(w) ?? (w.system.isHeavyWeapon ? "formule non reconnue" : "— (pas une arme lourde)"),
      value: weaponClasseValue(w) ?? "—",
      override: w.getFlag(MODULE_ID, "classe") ?? "",
      fixed: !!w.getFlag(MODULE_ID, "fixed"),
      energy: !!w.getFlag(MODULE_ID, "energy"),
      warheadOptions: Object.entries(WARHEADS).map(([value, label]) =>
        ({ value, label, selected: value === (w.getFlag(MODULE_ID, "warhead") ?? "") }))
    })),
    mods: modsAll.map((m) => ({
      id: m.id,
      name: m.name,
      slots: toInt(m.system.mods),
      qty: toInt(m.system.quantity) || 1,
      total: toInt(m.system.mods) * (toInt(m.system.quantity) || 1),
      hasAction: !!m.system.actions?.trait
        || Object.values(m.system.actions?.additional ?? {}).some((a) => a.type === "trait")
    })),
    features,
    energy: { value: sys.energy?.value ?? 0, max: sys.energy?.max ?? 0, low: (sys.energy?.value ?? 0) <= 0 },
    canSpendEnergy: isGM || actor.isOwner,
    shield: shieldInfo(actor),
    equipment: await (async () => {
      const destroyed = actor.getFlag(MODULE_ID, "crits")?.destroyed ?? [];
      const TE = foundry.applications.ux.TextEditor.implementation;
      const enrich = async (h) => (h ? TE.enrichHTML(h, { relativeTo: actor, secrets: actor.isOwner }) : "");
      const postesFor = (id) => postes.filter((p) => (p.weapons ?? []).includes(id) || (p.mods ?? []).includes(id));
      const crewOf = (id) => postesFor(id).map((p) => `${p.label}${p.occupant ? " (" + (actorFromUuid(p.occupant)?.name ?? "?") + ")" : ""}`).join(", ");
      const weapons = [];
      for (const w of weaponsAll) {
        const st = w.system;
        weapons.push({
          id: w.id, name: stripClasse(w.name), img: w.img,
          classe: w.getFlag(MODULE_ID, "classe") || computeWeaponClasse(w),
          damage: st.damage || "—", ap: st.ap || 0, range: st.range || "—", rof: st.rof || 1,
          ammo: st.shots ? `${st.currentShots ?? 0} / ${st.shots}` : null,
          canReload: !!st.shots && (st.currentShots ?? 0) < st.shots && (isGM || actor.isOwner),
          tags: [st.isHeavyWeapon ? "Arme lourde" : null, w.getFlag(MODULE_ID, "fixed") ? "Fixe" : null,
            w.getFlag(MODULE_ID, "energy") ? "Énergie" : null, WARHEADS[w.getFlag(MODULE_ID, "warhead") ?? ""] && w.getFlag(MODULE_ID, "warhead") ? "Ogive " + WARHEADS[w.getFlag(MODULE_ID, "warhead")] : null].filter(Boolean),
          postes: crewOf(w.id),
          destroyed: destroyed.includes(w.id),
          notes: st.notes || "",
          description: await enrich(st.description)
        });
      }
      const mods = [];
      for (const m of modsAll) {
        const st = m.system;
        const charge = st.charges?.hasCharges ? st.charges.charges?.[0] : null;
        const actions = [st.actions?.trait ? `Jet : ${st.actions.trait}` : null,
          ...Object.values(st.actions?.additional ?? {}).filter((a) => a.type === "trait").map((a) => a.name)].filter(Boolean);
        mods.push({
          id: m.id, name: m.name, img: m.img,
          slots: toInt(st.mods) * (toInt(st.quantity) || 1), qty: toInt(st.quantity) || 1,
          charges: charge ? `${charge.value} / ${charge.max}` : null,
          actions: actions.join(" · "),
          postes: crewOf(m.id),
          description: await enrich(st.description)
        });
      }
      return { weapons, mods };
    })(),
    power: (() => {
      const st = powerState(actor);
      const m = powerMods(actor);
      const fx = [];
      const sg = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
      if (m.handling) fx.push(`Maniabilité ${sg(m.handling)}`);
      if (m.soak) fx.push(`encaissement ${sg(m.soak)}`);
      if (m.weaponDamage) fx.push(`armes à énergie ${sg(m.weaponDamage)} dégâts (${sg(m.weaponWounds)} B en Heavy Metal)`);
      return { label: powerLabel(st), effects: fx.join(" · "), active: !!st, available: powerSystems(actor).length >= 2 };
    })(),
    modsUsed,
    modsMax: sys.mods?.max ?? 0,
    modsOver: modsUsed > (sys.mods?.max ?? Infinity),
    cargo: cargo.map((i) => ({ id: i.id, name: i.name, qty: toInt(i.system.quantity) || 1, weight: Number(i.system.weight) || 0 })),
    cargoUsed,
    cargoMax: sys.cargo?.max ?? 0,
    cargoOver: (sys.cargo?.max ?? 0) > 0 && cargoUsed > sys.cargo.max
  });
}

/* ---------------- Rendu ---------------- */
