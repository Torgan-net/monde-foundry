/**
 * MACRO FOUNDRY VTT — Export fiche de personnage (PJ) SWADE en Markdown
 * ------------------------------------------------------------
 * Compatible SWADE system v6+ (ApplicationV2 sheets).
 * Limité aux Personnages Joueurs (actor.type === "character") pour le moment.
 *
 * Usage :
 * 1. Créez une macro de type "Script" dans Foundry, collez ce code.
 * 2. Sélectionnez le token du PJ (ou ciblez-le, ou ayez un personnage
 *    assigné) puis lancez la macro.
 * 3. Une fenêtre d'options s'ouvre : inclure ou non le détail des
 *    Atouts/Handicaps/Pouvoirs, et choisir le format (Markdown
 *    standard avec tableaux, ou Markdown compatible Discord avec
 *    listes à puces — Discord ne rend pas les tableaux Markdown).
 * 4. Le résultat est copié dans le presse-papiers. Si la copie
 *    automatique échoue, une fenêtre s'ouvre avec le texte pré-sélectionné.
 *
 * NOTE Discord : un salon Discord limite un message à ~2000 caractères
 * (plus pour Nitro). Une fiche complète peut dépasser cette limite ;
 * il faudra alors la couper en plusieurs messages au moment de coller.
 *
 * IMPORTANT — champs à vérifier chez vous :
 * Certains chemins de données (progression détaillée, dé de course,
 * allure nage/vol/fouissement, statistiques additionnelles du monde)
 * varient selon la version exacte du système et les options activées
 * dans "Tweaks"/"Setting Configurator". Ce script essaie plusieurs
 * noms de champs plausibles et se rabat sur un affichage générique si
 * la structure exacte diffère. En cas de doute, ouvrez la console (F12) :
 *     console.log(actor.system)
 * pour inspecter la structure réelle et ajuster les chemins "gp(sys, ...)".
 */

(async () => {
  // ------------------------------------------------------------
  // Utilitaires génériques
  // ------------------------------------------------------------
  const gp = foundry.utils.getProperty;

  // Retire les références de compendium Foundry non-enrichies, du type
  // @UUID[Compendium.swade.edges.Item.abc123]{Combat Reflexes} ou
  // @Compendium[swade.edges.abc123]{Combat Reflexes}, et ne garde que
  // le texte affiché (ou rien s'il n'y a pas de libellé).
  function cleanCompendiumRefs(text) {
    if (!text) return text;
    return text
      .replace(/@(?:UUID|Compendium)\[[^\]]+\]\{([^}]+)\}/g, "$1")
      .replace(/@(?:UUID|Compendium)\[[^\]]+\]/g, "");
  }

  // Convertit un bloc HTML (ou du texte contenant encore des balises
  // <a> déjà enrichies) en texte brut. Les liens <a> sont convertis en
  // leur seul texte visible via textContent (le href est ignoré).
  function stripHtml(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = cleanCompendiumRefs(html);
    return div.textContent.trim();
  }

  function firstDefined(...values) {
    return values.find(v => v !== undefined && v !== null && v !== "");
  }

  function fmtMod(mod) {
    const n = Number(mod);
    if (!n) return null;
    return n > 0 ? `+${n}` : `${n}`;
  }

  function findNamedModifiers(source) {
    if (!source) return [];
    const candidateKeys = ["rollMods", "modifiers", "situationalMods", "mods"];
    for (const key of candidateKeys) {
      const list = source[key];
      if (Array.isArray(list) && list.length) {
        return list.map(m => {
          const label = firstDefined(m.label, m.name, m.text, "Modificateur");
          const value = firstDefined(m.value, m.mod, m.bonus);
          const valStr = value !== undefined ? fmtMod(value) : null;
          return valStr ? `${label} (${valStr})` : label;
        });
      }
    }
    return [];
  }

  // Renvoie la première valeur numérique NON NULLE parmi plusieurs
  // chemins candidats (contrairement à firstDefined, qui s'arrêterait
  // sur un premier "0" légitime et masquerait un champ alternatif
  // contenant le vrai bonus).
  function firstNonZeroMod(...values) {
    for (const v of values) {
      const n = Number(v);
      if (n) return n;
    }
    return 0;
  }

  // Recherche récursive (profondeur limitée) d'une clé dont le nom
  // correspond à un motif (ex: /wealth|richesse|fortune/i), utile pour
  // les champs dont le chemin exact varie selon le monde/la version.
  function deepFindByKeyPattern(obj, pattern, maxDepth = 4, path = "") {
    if (!obj || typeof obj !== "object" || maxDepth < 0) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (pattern.test(k)) {
        return { path: path ? `${path}.${k}` : k, value: v };
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const found = deepFindByKeyPattern(v, pattern, maxDepth - 1, path ? `${path}.${k}` : k);
        if (found) return found;
      }
    }
    return null;
  }

  // Rendu générique d'un tableau : vrai tableau Markdown en mode
  // "standard", liste à puces en mode "discord" (Discord ne rend pas
  // les tableaux Markdown à base de pipes).
  function renderTableOrList(headers, rows, flavor) {
    if (!rows.length) return "";
    if (flavor === "discord") {
      const sep = headers.length <= 2 ? " " : " — ";
      return rows.map(r => `- ${r.join(sep)}`).join("\n") + "\n\n";
    }
    let out = `| ${headers.join(" | ")} |\n|${headers.map(() => "---").join("|")}|\n`;
    out += rows.map(r => `| ${r.join(" | ")} |`).join("\n") + "\n\n";
    return out;
  }

  // ------------------------------------------------------------
  // 1. Sélection de l'acteur (PJ uniquement)
  // ------------------------------------------------------------
  let actor = null;

  if (canvas.tokens.controlled.length > 0) {
    actor = canvas.tokens.controlled[0].actor;
  } else if (game.user.targets.size > 0) {
    actor = Array.from(game.user.targets)[0].actor;
  } else if (game.user.character) {
    actor = game.user.character;
  }

  if (actor && actor.type !== "character") {
    ui.notifications.warn(
      `${actor.name} est un(e) ${actor.type}. Cette macro n'exporte pour le moment que des Personnages Joueurs.`
    );
    actor = null;
  }

  if (!actor) {
    const owned = game.actors.filter(a => a.isOwner && a.type === "character");
    if (owned.length === 0) {
      ui.notifications.error("Aucun Personnage Joueur trouvé. Sélectionnez un token de PJ ou possédez un acteur de type personnage.");
      return;
    }
    const options = owned.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
    actor = await new Promise((resolve) => {
      new Dialog({
        title: "Choisir un Personnage Joueur",
        content: `<form><div class="form-group"><label>Personnage :</label><select id="actor-select">${options}</select></div></form>`,
        buttons: {
          ok: {
            label: "Suivant",
            callback: (html) => {
              const id = html.find("#actor-select").val();
              resolve(game.actors.get(id));
            }
          }
        },
        default: "ok"
      }).render(true);
    });
  }

  if (!actor) return;

  if (actor.type !== "character") {
    ui.notifications.error("Cette macro n'exporte que des Personnages Joueurs (PJ) pour le moment.");
    return;
  }

  // ------------------------------------------------------------
  // 2. Options d'export
  // ------------------------------------------------------------
  const exportOptions = await new Promise((resolve) => {
    new Dialog({
      title: "Options d'export",
      content: `
        <form>
          <div class="form-group">
            <label>
              <input type="checkbox" id="opt-details">
              Inclure le détail (description) des Atouts, Handicaps et Pouvoirs
            </label>
            <p class="notes">Par défaut, seuls les noms sont exportés.</p>
          </div>
          <div class="form-group">
            <label for="opt-flavor">Format Markdown :</label>
            <select id="opt-flavor" style="width:100%;">
              <option value="standard">Standard (avec tableaux)</option>
              <option value="discord">Compatible Discord (listes à puces, sans tableaux)</option>
            </select>
          </div>
        </form>
      `,
      buttons: {
        ok: {
          label: "Exporter",
          callback: (html) => resolve({
            includeDetails: html.find("#opt-details").is(":checked"),
            flavor: html.find("#opt-flavor").val()
          })
        },
        cancel: {
          label: "Annuler",
          callback: () => resolve(null)
        }
      },
      default: "ok"
    }).render(true);
  });

  if (!exportOptions) return;
  const { includeDetails, flavor } = exportOptions;

  const sys = actor.system;

  // ------------------------------------------------------------
  // Attributs / rangs / dés
  // ------------------------------------------------------------
  const formatDie = (sides, mod) => {
    const s = sides ?? 4;
    if (!mod) return `d${s}`;
    return `d${s}${mod > 0 ? "+" + mod : mod}`;
  };

  const rankFromAdvances = (adv) => {
    if (adv >= 16) return "Légendaire";
    if (adv >= 12) return "Héroïque";
    if (adv >= 8) return "Vétéran";
    if (adv >= 4) return "Aguerri";
    return "Novice";
  };

  const attrNames = {
    agility: "Agilité",
    smarts: "Intellect",
    spirit: "Âme",
    strength: "Force",
    vigor: "Vigueur"
  };

  let md = "";

  // ------------------------------------------------------------
  // En-tête
  // ------------------------------------------------------------
  md += `# ${actor.name}\n\n`;

  const archetype = gp(sys, "details.archetype") || "";
  const speciesName = gp(sys, "details.species.name") || gp(sys, "details.ancestry") || "";
  const advancesCount = gp(sys, "advances.value") ?? 0;
  const storedRank = gp(sys, "details.rank") || gp(sys, "advances.rank");
  const rank = storedRank || rankFromAdvances(advancesCount);
  const wildcard = sys.wildcard ? "Oui" : "Non";

  md += `**Archétype :** ${archetype || "—"}  \n`;
  if (speciesName) md += `**Espèce/Ancêtre :** ${speciesName}  \n`;
  md += `**Rang :** ${rank} (${advancesCount} avancement${advancesCount > 1 ? "s" : ""})  \n`;
  md += `**Joueur (Wild Card) :** ${wildcard}\n\n`;

  // ------------------------------------------------------------
  // Attributs
  // ------------------------------------------------------------
  md += `## Attributs\n\n`;
  {
    const rows = [];
    const attrModifierNotes = [];
    for (const [key, label] of Object.entries(attrNames)) {
      const attr = gp(sys, `attributes.${key}`);
      const sides = gp(attr, "die.sides") ?? 4;
      const mod = firstNonZeroMod(gp(attr, "die.mod"), gp(attr, "modifier"), gp(attr, "bonus"));
      rows.push([label, formatDie(sides, mod)]);

      const named = findNamedModifiers(attr);
      if (named.length) attrModifierNotes.push(`- **${label} :** ${named.join(", ")}`);
    }

    md += renderTableOrList(["Attribut", "Dé"], rows, flavor);

    if (attrModifierNotes.length) {
      md += `**Modificateurs situationnels :**\n\n${attrModifierNotes.join("\n")}\n\n`;
    }
  }

  // ------------------------------------------------------------
  // Statistiques dérivées (dont Allure détaillée)
  // ------------------------------------------------------------
  md += `## Statistiques dérivées\n\n`;

  const parry = gp(sys, "stats.parry.value") ?? "—";
  const toughness = gp(sys, "stats.toughness.value") ?? "—";
  const armorTough = gp(sys, "stats.toughness.armor") ?? 0;
  const bennies = gp(sys, "bennies.value") ?? "—";
  const beniesMax = gp(sys, "bennies.max") ?? "—";
  const wounds = gp(sys, "wounds.value") ?? 0;
  const woundsMax = gp(sys, "wounds.max") ?? 0;
  const fatigue = gp(sys, "fatigue.value") ?? 0;
  const fatigueMax = gp(sys, "fatigue.max") ?? 0;
  const conviction = gp(sys, "conviction.value");

  md += `- **Parade :** ${parry}\n`;
  md += `- **Résistance (Toughness) :** ${toughness}${armorTough ? ` (dont ${armorTough} d'armure)` : ""}\n`;
  md += `- **Jetons :** ${bennies} / ${beniesMax}\n`;
  md += `- **Blessures :** ${wounds} / ${woundsMax}\n`;
  md += `- **Fatigue :** ${fatigue} / ${fatigueMax}\n`;
  if (conviction !== undefined) md += `- **Conviction :** ${conviction}\n`;

  const paceGround = firstDefined(
    gp(sys, "pace.ground.value"), gp(sys, "pace.ground"), gp(sys, "pace.base"),
    gp(sys, "stats.speed.adjusted"), gp(sys, "stats.speed.value")
  );
  const paceSwim = firstDefined(gp(sys, "pace.swim.value"), gp(sys, "pace.swim"));
  const paceFly = firstDefined(gp(sys, "pace.fly.value"), gp(sys, "pace.fly"));
  const paceBurrow = firstDefined(gp(sys, "pace.burrow.value"), gp(sys, "pace.burrow"));

  const runningDieSides = firstDefined(
    gp(sys, "pace.runningDie.sides"), gp(sys, "stats.runningDie.sides"), gp(sys, "runningDie.sides")
  );
  const runningDieMod = firstDefined(
    gp(sys, "pace.runningDie.mod"), gp(sys, "stats.runningDie.mod"), gp(sys, "runningDie.mod"), 0
  ) ?? 0;
  const runningDieLabel = runningDieSides
    ? `d${runningDieSides}${runningDieMod > 0 ? "+" + runningDieMod : runningDieMod < 0 ? runningDieMod : ""}`
    : "d6 (valeur par défaut des règles)";

  md += `- **Allure (Terrestre) :** ${paceGround ?? "—"}\n`;
  if (paceSwim !== undefined) md += `  - Nage : ${paceSwim}\n`;
  if (paceFly !== undefined) md += `  - Vol : ${paceFly}\n`;
  if (paceBurrow !== undefined) md += `  - Fouissement : ${paceBurrow}\n`;
  md += `- **Dé de course :** ${runningDieLabel}\n`;
  md += `\n`;

  const additionalStats = gp(sys, "additionalStats") || {};
  const additionalStatEntries = Object.entries(additionalStats);
  if (additionalStatEntries.length) {
    md += `**Statistiques additionnelles :**\n\n`;
    for (const [key, stat] of additionalStatEntries) {
      const label = firstDefined(stat?.label, stat?.short, key);
      let value = stat?.value;
      if (value === undefined || value === null) {
        value = (stat !== null && typeof stat === "object") ? undefined : stat;
      }
      if (value === undefined || value === null || typeof value === "object") value = "N/A";
      md += `- **${label} :** ${value}\n`;
    }
    md += `\n`;
  }

  // ------------------------------------------------------------
  // Progression / Avancements détaillés (masquée si vide)
  // ------------------------------------------------------------
  const advancesRoot = gp(sys, "advances") || {};

  const progArrayKeys = ["list", "entries", "items", "advances", "records"];
  let advancesArray = null;

  for (const k of progArrayKeys) {
    const candidate = advancesRoot[k];
    if (Array.isArray(candidate) && candidate.length) {
      advancesArray = candidate;
      break;
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const vals = Object.values(candidate);
      if (vals.length && typeof vals[0] === "object") {
        advancesArray = vals;
        break;
      }
    }
  }

  const legacyAdvancesText = stripHtml(firstDefined(
    advancesRoot.text, advancesRoot.summary, advancesRoot.notes, advancesRoot.value,
    gp(sys, "details.advances")
  ));

  const hasProgressionContent = advancesCount > 0 || (advancesArray && advancesArray.length) || !!legacyAdvancesText;

  if (hasProgressionContent) {
    md += `## Progression\n\n`;
    md += `**Nombre d'avancements :** ${advancesCount}\n\n`;

    if (advancesArray && advancesArray.length) {
      const headers = ["#", "Rang", "Bénéfice", "Détail"];
      const rows = advancesArray.map((entry, i) => {
        const entryRank = firstDefined(entry.rank, entry.rankLabel, entry.label, "—");
        const benefit = firstDefined(entry.benefit, entry.type, entry.name, entry.title, "—");
        const detail = stripHtml(firstDefined(entry.notes, entry.description, entry.text, entry.value, "")) || "—";
        return [String(i + 1), entryRank, benefit, detail];
      });
      md += renderTableOrList(headers, rows, flavor);
    } else if (legacyAdvancesText) {
      md += `${legacyAdvancesText}\n\n`;
    } else {
      md += `_Détail des avancements non trouvé dans un champ standard. Vérifiez \`actor.system.advances\` dans la console si le mode "Expanded" est actif._\n\n`;
    }
  }

  // ------------------------------------------------------------
  // Compétences
  // ------------------------------------------------------------
  const skills = actor.items.filter(i => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
  if (skills.length) {
    md += `## Compétences\n\n`;
    const rows = [];
    const skillModifierNotes = [];
    for (const s of skills) {
      const attrKey = gp(s.system, "attribute") || "";
      const attrLabel = attrKey ? (attrNames[attrKey] || attrKey) : "";
      const displayName = attrLabel ? `${s.name} (${attrLabel})` : s.name;

      const sides = gp(s.system, "die.sides") ?? 4;
      const mod = firstNonZeroMod(
        gp(s.system, "die.mod"), gp(s.system, "modifier"), gp(s.system, "bonus"), gp(s.system, "mod")
      );
      rows.push([displayName, formatDie(sides, mod)]);

      const named = findNamedModifiers(s.system);
      if (named.length) skillModifierNotes.push(`- **${s.name} :** ${named.join(", ")}`);
    }

    md += renderTableOrList(["Compétence", "Dé"], rows, flavor);

    if (skillModifierNotes.length) {
      md += `**Modificateurs situationnels :**\n\n${skillModifierNotes.join("\n")}\n\n`;
    }
  }

  // ------------------------------------------------------------
  // Atouts (Edges) — noms seuls par défaut, détail sur option
  // ------------------------------------------------------------
  const edges = actor.items.filter(i => i.type === "edge").sort((a, b) => a.name.localeCompare(b.name));
  if (edges.length) {
    md += `## Atouts\n\n`;
    if (!includeDetails) {
      md += edges.map(e => `- ${e.name}`).join("\n") + "\n\n";
    } else {
      for (const e of edges) {
        const desc = stripHtml(gp(e.system, "description"));
        md += `### ${e.name}\n${desc || "_Pas de description_"}\n\n`;
      }
    }
  }

  // ------------------------------------------------------------
  // Handicaps (Hindrances) — noms seuls par défaut, détail sur option
  // ------------------------------------------------------------
  const hindrances = actor.items.filter(i => i.type === "hindrance").sort((a, b) => a.name.localeCompare(b.name));
  if (hindrances.length) {
    md += `## Handicaps\n\n`;
    if (!includeDetails) {
      md += hindrances.map(h => {
        const major = gp(h.system, "major") ? "Majeur" : "Mineur";
        return `- ${h.name} (${major})`;
      }).join("\n") + "\n\n";
    } else {
      for (const h of hindrances) {
        const major = gp(h.system, "major") ? "Majeur" : "Mineur";
        const desc = stripHtml(gp(h.system, "description"));
        md += `### ${h.name} (${major})\n${desc || "_Pas de description_"}\n\n`;
      }
    }
  }

  // ------------------------------------------------------------
  // Pouvoirs (Powers) — infos mécaniques toujours visibles,
  // description complète seulement si includeDetails est actif.
  // ------------------------------------------------------------
  const powers = actor.items.filter(i => i.type === "power").sort((a, b) => a.name.localeCompare(b.name));
  if (powers.length) {
    md += `## Pouvoirs\n\n`;
    if (!includeDetails) {
      md += powers.map(p => {
        const pp = gp(p.system, "pp") ?? "—";
        const range = gp(p.system, "range") || "—";
        const duration = gp(p.system, "duration") || "—";
        return `- ${p.name} (PP: ${pp}, Portée: ${range}, Durée: ${duration})`;
      }).join("\n") + "\n\n";
    } else {
      for (const p of powers) {
        const pp = gp(p.system, "pp") ?? "—";
        const range = gp(p.system, "range") || "—";
        const duration = gp(p.system, "duration") || "—";
        const desc = stripHtml(gp(p.system, "description"));
        md += `### ${p.name}\n`;
        md += `**PP :** ${pp} | **Portée :** ${range} | **Durée :** ${duration}\n\n`;
        md += `${desc || "_Pas de description_"}\n\n`;
      }
    }
  }

  // ------------------------------------------------------------
  // Argent : Dé de Richesse (system.details.wealth = {die, modifier,
  // "wild-die"}) si la règle "Wealth" est active pour ce monde ;
  // sinon numéraire classique (system.details.currency). On n'affiche
  // jamais les deux en même temps : le Dé de Richesse remplace le
  // numéraire quand il est configuré. Affiché dans la section
  // Équipement, juste avant la liste des objets.
  // ------------------------------------------------------------
  function formatWealthDie(val) {
    if (!val || typeof val !== "object" || val.die === undefined) return null;
    const mod = Number(val.modifier) || 0;
    let label = `d${val.die}${mod > 0 ? "+" + mod : mod < 0 ? mod : ""}`;
    const wildDie = val["wild-die"];
    if (wildDie !== undefined && wildDie !== val.die) {
      label += ` (dé sauvage : d${wildDie})`;
    }
    return label;
  }

  const wealthData = gp(sys, "details.wealth");
  let wealthLabel = formatWealthDie(wealthData);

  if (!wealthLabel) {
    // Repli : autre emplacement possible selon le monde/module tiers.
    const wealthMatch = deepFindByKeyPattern(sys, /wealth|richesse|fortune/i, 4);
    if (wealthMatch) {
      const val = wealthMatch.value;
      if (val && typeof val === "object") {
        wealthLabel = formatWealthDie(val) || firstDefined(val.value, null);
      } else {
        wealthLabel = val;
      }
    }
  }

  const money = gp(sys, "details.currency");

  // ------------------------------------------------------------
  // Équipement
  // ------------------------------------------------------------
  const gear = actor.items.filter(i => ["gear", "weapon", "armor", "shield"].includes(i.type))
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasEquipmentSection = gear.length > 0 || !!wealthLabel || money !== undefined;

  if (hasEquipmentSection) {
    md += `## Équipement\n\n`;

    if (wealthLabel) {
      md += `**Richesse (dé) :** ${wealthLabel}\n\n`;
    } else if (money !== undefined) {
      md += `**Argent :** ${money}\n\n`;
    }

    const weapons = gear.filter(i => i.type === "weapon");
    const armors = gear.filter(i => i.type === "armor" || i.type === "shield");
    const misc = gear.filter(i => i.type === "gear");

    if (weapons.length) {
      md += `### Armes\n\n`;
      const headers = ["Nom", "Dégâts", "Portée", "CdT", "PA", "Équipée"];
      const rows = weapons.map(w => [
        w.name,
        gp(w.system, "damage") || "—",
        gp(w.system, "range") || "—",
        gp(w.system, "rof") ?? "—",
        gp(w.system, "ap") ?? "—",
        gp(w.system, "equipped") ? "Oui" : "Non"
      ]);
      md += renderTableOrList(headers, rows, flavor);
    }

    if (armors.length) {
      md += `### Armures / Boucliers\n\n`;
      const headers = ["Nom", "Armure", "Équipée"];
      const rows = armors.map(a => [
        a.name,
        gp(a.system, "armor") ?? "—",
        gp(a.system, "equipped") ? "Oui" : "Non"
      ]);
      md += renderTableOrList(headers, rows, flavor);
    }

    if (misc.length) {
      md += `### Divers\n\n`;
      const headers = ["Nom", "Quantité", "Poids"];
      const rows = misc.map(g => [
        g.name,
        gp(g.system, "quantity") ?? 1,
        gp(g.system, "weight") ?? "—"
      ]);
      md += renderTableOrList(headers, rows, flavor);
    }
  }

  // ------------------------------------------------------------
  // Biographie (3 sous-parties) + Notes séparées
  // ------------------------------------------------------------
  const bioDescription = stripHtml(firstDefined(
    gp(sys, "details.biography.value"), gp(sys, "details.biography"), ""
  ));
  const bioAppearance = stripHtml(firstDefined(
    gp(sys, "details.appearance.value"), gp(sys, "details.appearance"), ""
  ));
  const bioGoals = stripHtml(firstDefined(
    gp(sys, "details.goals.value"), gp(sys, "details.goals"),
    gp(sys, "details.motivation.value"), gp(sys, "details.motivation"), ""
  ));
  const notes = stripHtml(firstDefined(
    gp(sys, "details.notes.value"), gp(sys, "details.notes"), ""
  ));

  if (bioDescription || bioAppearance || bioGoals) {
    md += `## Biographie\n\n`;
    if (bioDescription) md += `### Description\n\n${bioDescription}\n\n`;
    if (bioAppearance) md += `### Apparence\n\n${bioAppearance}\n\n`;
    if (bioGoals) md += `### Motivations / Objectifs\n\n${bioGoals}\n\n`;
  }

  if (notes) {
    md += `## Notes\n\n${notes}\n\n`;
  }

  // ------------------------------------------------------------
  // Copie dans le presse-papiers (avec repli en fenêtre manuelle)
  // ------------------------------------------------------------
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn("Copie via navigator.clipboard échouée, repli sur execCommand.", err);
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) return true;
    } catch (err) {
      console.warn("Copie via execCommand échouée.", err);
    }

    return false;
  }

  const copied = await copyToClipboard(md);

  if (copied) {
    const lenWarning = flavor === "discord" && md.length > 2000
      ? ` (⚠️ ${md.length} caractères — dépasse la limite de 2000 d'un message Discord standard, il faudra le couper)`
      : "";
    ui.notifications.info(`Fiche de ${actor.name} copiée dans le presse-papiers.${lenWarning}`);
  } else {
    new Dialog({
      title: `Fiche Markdown — ${actor.name}`,
      content: `
        <p>La copie automatique n'a pas fonctionné (restrictions du navigateur).
        Le texte ci-dessous est déjà sélectionné : faites <kbd>Ctrl+C</kbd> (ou <kbd>Cmd+C</kbd>).</p>
        <textarea id="md-output" rows="20" style="width:100%; font-family: monospace;" readonly></textarea>
      `,
      buttons: {
        close: { label: "Fermer" }
      },
      render: (html) => {
        const ta = html.find("#md-output")[0];
        ta.value = md;
        ta.focus();
        ta.select();
      }
    }, { width: 600 }).render(true);
  }
})();