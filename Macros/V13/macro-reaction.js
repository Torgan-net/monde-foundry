/* ================================================================
   SWADE - Réaction & Persuasion.
   ================================================================ */

if (!foundry?.applications?.api?.DialogV2) {
  ui.notifications.error("Cette macro nécessite Foundry V13 ou plus récent (DialogV2 introuvable).");
  return;
}
const DialogV2 = foundry.applications.api.DialogV2;
const DEFAULT_TN = 4;
const SKILL_NAME = "Persuasion";

const REACTIONS = ["Hostile", "Inamical", "Récalcitrant", "Neutre", "Coopératif", "Amical", "Serviable"];
const REACTION_COLORS = ["#8b1e1e", "#b5502c", "#c98a2c", "#8a8a3a", "#4c8a4c", "#2f7d4f", "#1e6b6b"];

const token = canvas.tokens.controlled[0];
if (!token || !token.actor) {
  ui.notifications.warn("Sélectionne le token du PNJ (avec un acteur) avant de lancer la macro.");
  return;
}
const actor = token.actor;
const speakerOpts = { token: token.document };

let state = { initial: null, current: null };

function clampToRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function postChat(content) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker(speakerOpts), content });
}

/* ---------------- Rendu visuel de l'échelle ---------------- */

function reactionTrackHtml() {
  const chips = REACTIONS.map((label, i) => {
    const isCurrent = state.current === i;
    const isInitial = state.initial === i;
    const bg = REACTION_COLORS[i];
    const style = `
      flex:1; text-align:center; padding:6px 2px; font-size:11px; border-radius:4px;
      color:#fff; background:${bg}; opacity:${isCurrent ? 1 : 0.35};
      border:${isCurrent ? "2px solid #fff" : "2px solid transparent"};
      box-shadow:${isCurrent ? "0 0 4px rgba(0,0,0,0.6)" : "none"};
      position:relative;
    `;
    return `
      <div style="${style}">
        ${isInitial ? '<div style="position:absolute;top:-14px;left:0;right:0;font-size:10px;">▼ init</div>' : ""}
        ${label}
      </div>`;
  }).join("");
  return `<div style="display:flex; gap:3px; margin:8px 0 4px;">${chips}</div>`;
}

/* ---------------- Réaction initiale ---------------- */

async function rollInitialReaction() {
  const roll = await new Roll("2d6").evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker(speakerOpts), flavor: "Jet de réaction initiale (2d6)" });
  const total = roll.total;

  let index;
  if (total === 2) index = 0;
  else if (total === 3) index = 1;
  else if (total <= 5) index = 2;
  else if (total <= 8) index = 3;
  else if (total <= 10) index = 4;
  else if (total === 11) index = 5;
  else index = 6;

  state = { initial: index, current: index };
  await postChat(`<b>${token.name}</b> — Réaction initiale : <b>${REACTIONS[index]}</b> (2d6 = ${total})`);
  showMainDialog();
}

async function setManualReaction() {
  const buttons = REACTIONS.map((label, i) => ({
    action: `set-${i}`,
    label,
    callback: () => i
  }));

  const chosen = await DialogV2.wait({
    window: { title: "Réaction initiale manuelle" },
    content: `<p>Choisis l'attitude de départ du PNJ :</p>`,
    buttons,
    rejectClose: false
  });

  if (chosen === null || chosen === undefined) return showMainDialog();
  state = { initial: chosen, current: chosen };
  await postChat(`<b>${token.name}</b> — Réaction initiale fixée manuellement : <b>${REACTIONS[chosen]}</b>`);
  showMainDialog();
}

/* ---------------- Jet de Persuasion (système natif) ---------------- */

function findSkillItem() {
  const needle = SKILL_NAME.toLowerCase();
  return actor.items.find(i => i.type === "skill" && i.name.toLowerCase().includes(needle));
}

function collectNaturalDice(roll) {
  const naturals = [];
  const walk = (terms) => {
    for (const term of terms ?? []) {
      if (term?.terms) walk(term.terms);
      if (term?.results?.length) naturals.push(term.results[0].result);
    }
  };
  walk(roll.terms);
  return naturals;
}

function determineOutcome(roll) {
  const total = roll.total;
  const naturals = collectNaturalDice(roll);
  const criticalFail = naturals.length >= 2 && naturals.every(n => n === 1);

  if (criticalFail) return { shift: -1, label: "Échec critique" };
  if (total >= DEFAULT_TN + 4) return { shift: 2, label: "Succès avec Prouesse" };
  if (total >= DEFAULT_TN) return { shift: 1, label: "Succès" };
  return { shift: 0, label: "Échec" };
}

// Compare deux résultats et retourne le meilleur (priorité au cran de décalage,
// puis au total du jet en cas d'égalité de catégorie).
function betterOf(a, b) {
  if (a.outcome.shift !== b.outcome.shift) return a.outcome.shift > b.outcome.shift ? a : b;
  return a.roll.total >= b.roll.total ? a : b;
}

async function spendBennyAndReroll(previousRoll) {
  const benny = actor.system?.bennies?.value ?? 0;
  if (benny <= 0) {
    ui.notifications.warn(`${actor.name} n'a plus de jeton à dépenser.`);
    return null;
  }
  await actor.update({ "system.bennies.value": benny - 1 });

  // Affichage visuel de la dépense du jeton : notification à l'écran
  // + message de chat dédié (indépendant du jet lui-même).
  ui.notifications.info(`🪙 ${actor.name} dépense un jeton (restants : ${benny - 1}).`);
  await postChat(`
    <div style="display:flex;align-items:center;gap:6px;font-style:italic;color:#8a6d1a;">
      <img src="icons/svg/coins.svg" style="width:20px;height:20px;">
      <span>${actor.name} dépense un jeton pour relancer.</span>
    </div>
  `);

  const rerollRoll = await new Roll(previousRoll.formula).evaluate();
  // toMessage() déclenche automatiquement l'animation Dice So Nice si le module est actif.
  await rerollRoll.toMessage({
    speaker: ChatMessage.getSpeaker(speakerOpts),
    flavor: `🎲 Relance à jeton — Persuasion (${actor.name})`
  });
  return rerollRoll;
}

async function confirmOrReroll(initialRoll) {
  let latest = { roll: initialRoll, outcome: determineOutcome(initialRoll) };
  let best = latest;

  while (true) {
    const benny = actor.system?.bennies?.value ?? 0;
    const canReroll = benny > 0 && latest.outcome.label !== "Échec critique";
    const bestIsLatest = best === latest;

    const choice = await DialogV2.wait({
      window: { title: "Résultat de Persuasion" },
      content: `
        <p style="text-align:center;font-size:1.1em;margin-bottom:2px;">
          <b>${latest.outcome.label}</b>
        </p>
        <p style="text-align:center;font-size:0.85em;color:#888;">
          Total : ${latest.roll.total}${canReroll ? ` — Jetons disponibles : ${benny}` : ""}
        </p>
        ${!bestIsLatest ? `
          <p style="text-align:center;font-size:0.8em;color:#4c8a4c;">
            Meilleur résultat conservé : <b>${best.outcome.label}</b> (total ${best.roll.total})
          </p>` : ""}
      `,
      buttons: [
        { action: "validate", label: "✅ Valider le meilleur résultat", default: true, callback: () => "validate" },
        ...(canReroll ? [{ action: "reroll", label: "🎲 Relancer (jeton)", callback: () => "reroll" }] : [])
      ],
      rejectClose: false
    });

    if (choice === "reroll") {
      const rerolledRoll = await spendBennyAndReroll(latest.roll);
      if (rerolledRoll) {
        latest = { roll: rerolledRoll, outcome: determineOutcome(rerolledRoll) };
        best = betterOf(best, latest);
        continue;
      }
    }
    break;
  }

  return best;
}

async function doPersuasionRoll() {
  if (state.current === null) {
    ui.notifications.warn("Définis d'abord la réaction initiale de ce PNJ.");
    return showMainDialog();
  }

  const skillItem = findSkillItem();
  if (!skillItem) {
    ui.notifications.error(`Compétence "${SKILL_NAME}" introuvable sur ${actor.name}.`);
    return showMainDialog();
  }

  const roll = await actor.rollSkill(skillItem.id, {});
  if (!roll) return showMainDialog();

  const best = await confirmOrReroll(roll);
  await applyReactionShift(best.outcome.shift, best.outcome.label, best.roll);
}

/* ---------------- Application du résultat + chat enrichi ---------------- */

function outcomeStyle(label) {
  switch (label) {
    case "Échec critique": return { color: "#8b1e1e", icon: "💥" };
    case "Échec": return { color: "#666", icon: "❌" };
    case "Succès avec Prouesse": return { color: "#c98a2c", icon: "🌟" };
    default: return { color: "#2f7d4f", icon: "✅" };
  }
}

async function applyReactionShift(shift, label, roll) {
  const newIndex = clampToRange(state.current + shift, 0, 6); // borne uniquement sur l'échelle globale
  const oldIndex = state.current;
  state.current = newIndex;

  const { color, icon } = outcomeStyle(label);
  const capped = newIndex === oldIndex && shift !== 0; // extrémité haute/basse de l'échelle atteinte
  const img = token.document.texture?.src ?? token.document.img ?? "icons/svg/mystery-man.svg";

  const content = `
    <div style="border:1px solid ${color}; border-radius:6px; padding:8px; background:rgba(0,0,0,0.03);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <img src="${img}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;">
        <div>
          <div style="font-weight:bold;">${token.name}</div>
          <div style="font-size:0.8em;color:#888;">Jet de Persuasion</div>
        </div>
      </div>
      <div style="text-align:center; font-size:1.05em; color:${color}; font-weight:bold; margin:4px 0;">
        ${icon} ${label} <span style="font-weight:normal;color:#888;font-size:0.85em;">(total ${roll.total})</span>
      </div>
      <div style="display:flex; align-items:center; justify-content:center; gap:6px; margin-top:6px; font-size:0.95em;">
        <span style="padding:2px 8px;border-radius:4px;background:${REACTION_COLORS[oldIndex]};color:#fff;">${REACTIONS[oldIndex]}</span>
        <span>→</span>
        <span style="padding:2px 8px;border-radius:4px;background:${REACTION_COLORS[newIndex]};color:#fff;font-weight:bold;">${REACTIONS[newIndex]}</span>
      </div>
      ${capped ? `<div style="text-align:center;font-size:0.75em;color:#888;margin-top:4px;"><i>Extrémité de l'échelle atteinte</i></div>` : ""}
    </div>
  `;

  await postChat(content);
  showMainDialog();
}

/* ---------------- Réinitialisation ---------------- */

function resetReaction() {
  state = { initial: null, current: null };
  showMainDialog();
}

/* ---------------- Dialogue principal ---------------- */

async function showMainDialog() {
  const action = await DialogV2.wait({
    window: { title: `Réaction — ${token.name}` },
    content: `
      ${reactionTrackHtml()}
      <p style="text-align:center;margin-top:2px;font-size:0.85em;color:#888;">
        ${state.current !== null ? `Actuel : <b>${REACTIONS[state.current]}</b>` : "Aucune réaction définie"}
      </p>
    `,
    buttons: [
      { action: "roll-init", label: "🎲 Tirer réaction initiale", callback: () => "roll-init" },
      { action: "manual-init", label: "✏️ Définir manuellement", callback: () => "manual-init" },
      { action: "persuasion", label: "💬 Jet de Persuasion", default: true, callback: () => "persuasion" },
      { action: "reset", label: "↺ Réinitialiser", callback: () => "reset" }
    ],
    rejectClose: false
  });

  if (action === "roll-init") await rollInitialReaction();
  else if (action === "manual-init") await setManualReaction();
  else if (action === "persuasion") await doPersuasionRoll();
  else if (action === "reset") resetReaction();
}

showMainDialog();