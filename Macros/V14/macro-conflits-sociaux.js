(async () => {

  // =========================
  // COMPATIBILITÉ
  // Cible : Foundry VTT v13 / v14, système SWADE 5.x / 6.x.
  // - La classe `Dialog` (V1) est dépréciée dans Foundry v13+ mais reste
  //   fonctionnelle ; on utilise un alias résilient au cas où elle serait un
  //   jour déplacée sous foundry.appv1.api.
  // - Les chemins de données (system.bennies.value, system.wildcard, etc.)
  //   sont stables depuis le passage du système SWADE au Data Model (V10+),
  //   donc valables pour SWADE 5.x comme 6.x.
  // =========================
  const DialogCls = (typeof Dialog !== "undefined")
    ? Dialog
    : foundry?.appv1?.api?.Dialog;

  if (!DialogCls) {
    ui.notifications.error("Impossible de trouver la classe Dialog (incompatibilité Foundry).");
    return;
  }

  // =========================
  // VALIDATION
  // =========================
  if (canvas.tokens.controlled.length !== 1) {
    ui.notifications.warn("Sélectionne un PJ.");
    return;
  }

  if (game.user.targets.size !== 1) {
    ui.notifications.warn("Cible un PNJ.");
    return;
  }

  const actor = canvas.tokens.controlled[0].actor;
  const target = [...game.user.targets][0].actor;

  // =========================
  // CONFIG
  // =========================
  const skills = ["Persuasion", "Intimidation", "Performance", "Taunt"];
  const skillOptions = skills.map(s => `<option value="${s}">${s}</option>`).join("");

  const mapping = {
    persuasion: "spirit",
    intimidation: "spirit",
    performance: "spirit",
    taunt: "smarts"
  };

  // Seuil minimum de résistance selon les règles SWADE (un jet ne peut jamais
  // servir de seuil en-dessous de 4).
  const MIN_THRESHOLD = 4;

  // Emplacement utilisé pour stocker les jetons du MJ. Ce n'est pas une API
  // officiellement documentée par Pinnacle : c'est l'emplacement le plus
  // couramment utilisé par le système SWADE pour Foundry. Si ça ne
  // correspond pas à ta version du système, modifie uniquement ces deux
  // constantes.
  const GM_BENNY_FLAG_SCOPE = "swade";
  const GM_BENNY_FLAG_KEY = "bennies";

  // =========================
  // HELPERS
  // =========================
  const findSkill = (act, name) =>
    act.items.find(i =>
      i.type === "skill" &&
      i.name?.toLowerCase() === name.toLowerCase()
    );

  const rollSkill = async (actor, skillName) => {
    const skill = findSkill(actor, skillName);
    if (skill) return await skill.roll();
    return await actor.rollSkill("Unskilled Attempt");
  };

  const rollAttribute = async (actor, attr) => {
    try {
      return await actor.rollAttribute(attr);
    } catch {
      return await actor.rollAttributeTest(attr);
    }
  };

  const calcInfluence = (roll, targetNum) => {
    if (roll < targetNum) return 0;
    return 1 + Math.floor((roll - targetNum) / 4);
  };

  const getFinalResult = (total) => {
    if (total === 0)
      return `<p><strong>0 — Échec total</strong> : Le plaidoyer est sans effet et les négociations échouent. Les discussions peuvent reprendre suite à de nouvelles informations ou à des faveurs. Dans un procès, l’accusé est acquitté.</p>`;
    if (total <= 3)
      return `<p><strong>1–3 — Succès limité</strong> : La cible n’est pas entièrement convaincue mais procure un soutien minimum. Dans un procès, le prévenu écope d’une peine légère.</p>`;
    if (total <= 5)
      return `<p><strong>4–5 — Succès</strong> : L’auditoire est raisonnablement convaincu ou désire apporter son soutien. Il fournit à peu près l’aide demandée mais sous certaines conditions ou exige en retour un paiement, une faveur ou une tâche à accomplir. Dans un procès le procureur obtient une condamnation classique.</p>`;
    return `<p><strong>6+ — Succès majeur</strong> : La cible est pleinement convaincue ou désireuse d’apporter son aide. Elle fournit plus de ressources ou de soutien qu’espérés. Dans un procès, l’accusé écope de la peine maximum.</p>`;
  };

  const roundBox = (html) => `
    <div style="
      border:1px solid #444;
      border-radius:10px;
      padding:10px;
      margin:8px 0;
      background:rgba(0,0,0,0.03);
      font-family:sans-serif;
    ">
      ${html}
    </div>
  `;

  const separator = `
    <hr style="border:0;border-top:1px solid #555;margin:8px 0;">
  `;

  // ---- Bennies : PJ / PNJ ----
  // Un PJ est toujours considéré comme Wildcard. Pour un PNJ, on vérifie le
  // champ system.wildcard (stable depuis le Data Model SWADE, 5.x et 6.x).
  const isWildcard = (act) => act?.type === "character" || act?.system?.wildcard === true;

  const getBennies = (act) => {
    return act?.system?.bennies?.value ?? act?.system?.bennies ?? 0;
  };

  // Animation de secours (Dice So Nice est requis par SWADE, donc toujours
  // supposé présent). Utilisée quand on ne peut pas passer par la méthode
  // native de l'acteur (ex : jetons du MJ, qui n'ont pas d'acteur associé).
  // Échec critique SWADE : le dé de trait ET le dé sauvage affichent tous
  // les deux un 1 naturel (avant toute explosion/ace). Un échec critique ne
  // peut jamais être relancé, même avec un jeton. On s'appuie uniquement sur
  // l'API Roll du cœur de Foundry (roll.dice), stable en V13/V14 et
  // indépendante de la version du système SWADE.
  const isCriticalFailure = (roll) => {
    try {
      const dice = roll?.dice ?? [];
      // Un échec critique nécessite au moins deux dés (trait + sauvage).
      // Sans dé sauvage (Figurant, tentative non qualifiée), la règle ne
      // s'applique pas.
      if (dice.length < 2) return false;

      return dice.every(d => {
        const first = d.results?.[0];
        return first?.result === 1;
      });
    } catch {
      return false;
    }
  };

  const spendBenny = async (act) => {
    // On privilégie la méthode native de l'acteur SWADE si elle existe :
    // elle gère à la fois la décrémentation ET l'animation Dice So Nice
    // du jeton, exactement comme un clic sur la fiche de personnage.
    if (typeof act?.spendBenny === "function") {
      try {
        const result = await act.spendBenny();
        if (result === false) return false;
        return true;
      } catch {
        // On retombe sur la méthode manuelle ci-dessous si l'appel échoue
        // (ex : signature différente selon la version du système).
      }
    }

    const current = getBennies(act);
    if (current <= 0) return false;

    await act.update({
      "system.bennies.value": current - 1
    });

    // Pas d'animation ici : le jet relancé juste après (rollSkill /
    // rollAttribute) est un jet normal du système, qui déclenche déjà
    // nativement Dice So Nice tout seul. Ajouter un jet ici en plus serait
    // trompeur (un second jet factice sans rapport avec le vrai résultat).

    return true;
  };

  // ---- Bennies : MJ ----
  const getGMBennies = () => {
    try {
      return game.user?.getFlag(GM_BENNY_FLAG_SCOPE, GM_BENNY_FLAG_KEY) ?? 0;
    } catch {
      return 0;
    }
  };

  const spendGMBenny = async () => {
    try {
      const current = getGMBennies();
      if (current <= 0) return false;
      await game.user.setFlag(GM_BENNY_FLAG_SCOPE, GM_BENNY_FLAG_KEY, current - 1);
      // Pas d'acteur ni de jet associé à la dépense d'un jeton du MJ : on
      // n'affiche volontairement aucune animation plutôt que d'en simuler
      // une fausse.
      return true;
    } catch {
      return false;
    }
  };

  // Propose une relance avec un ou plusieurs jetons possibles.
  // sources = [{ key, label, count }]
  // Renvoie la clé choisie, ou null si aucune relance.
  const chooseBennySource = async (title, description, sources) => {
    const usable = sources.filter(s => s.count > 0);
    if (usable.length === 0) return null;

    return await new Promise((resolve) => {
      const buttons = {};

      usable.forEach(s => {
        buttons[s.key] = {
          label: `${s.label} (${s.count})`,
          callback: () => resolve(s.key)
        };
      });

      buttons.none = {
        label: "Ne pas relancer",
        callback: () => resolve(null)
      };

      new DialogCls({
        title,
        content: `<p style="font-family:sans-serif;">${description}</p>`,
        buttons,
        default: "none",
        close: () => resolve(null)
      }).render(true);
    });
  };

  // =========================
  // UI
  // =========================
  const content = `
  <div style="font-family:sans-serif;">
    <h2>🎭 Conflit Social SWADE</h2>

    <label>Compétence PJ</label>
    <select id="skillPJ" style="width:100%">
      ${skillOptions}
    </select>

    <br><br>

    <label>Mode de résistance</label>
    <select id="mode" style="width:100%">
      <option value="attribute" selected>Attribut (défaut)</option>
      <option value="active">Opposition active</option>
    </select>

    <br><br>

    <label>Compétence PNJ</label>
    <select id="skillPNJ" style="width:100%">
      ${skillOptions}
    </select>

    <br><br>

    <label>Rounds</label>
    <input id="rounds" type="number" value="3" style="width:100%">

  </div>
  
  `;

  new DialogCls({
    title: "Conflit Social",
    content,
    buttons: {
      start: {
        label: "Démarrer",
        callback: async (html) => {

          const skillPJName = html.find("#skillPJ").val();
          const skillPNJName = html.find("#skillPNJ").val();
          const mode = html.find("#mode").val();
          const rounds = parseInt(html.find("#rounds").val());

          let totalInfluence = 0;
          const history = [];

          // =========================
          // INTRO
          // =========================
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: roundBox(`
              <h2>🎭 Conflit social</h2>
              <p><strong>${actor.name}</strong> tente de convaincre <strong>${target.name}</strong></p>
            `)
          });

          // =========================
          // ROUNDS
          // =========================
          for (let i = 1; i <= rounds; i++) {

            const skillPNJ = findSkill(target, skillPNJName);
            const attr = mapping[skillPJName.toLowerCase()];

            // ---- Fonction de jet de défense (utilisée pour le jet initial et les relances) ----
            const rollDefense = async () => {
              if (mode === "active") {
                return skillPNJ
                  ? await skillPNJ.roll()
                  : await target.rollSkill("Unskilled Attempt");
              }
              return await rollAttribute(target, attr);
            };

            let currentDefense = await rollDefense();
            let bestDefense = currentDefense;
            const defenseBennyLabels = [];
            let defenseCritFail = isCriticalFailure(currentDefense);

            // ---- Proposition de relance de la défense (jeton du PNJ EN PRIORITÉ, puis MJ) ----
            // Répétée tant qu'il reste des jetons disponibles ET que le
            // dernier résultat n'est pas un échec critique (règle SWADE :
            // un échec critique — double 1 — ne peut jamais être relancé).
            // Règle SWADE : on garde le MEILLEUR résultat de toute la série
            // de jets (pas forcément le dernier).
            // Les jetons du PNJ sont proposés EN PRIORITÉ tant qu'il y en a.
            // Les jetons du MJ ne sont proposés que si le PNJ n'en a plus.
            while (!defenseCritFail) {
              const defenseSources = [];
              
              // Toujours proposer les jetons du PNJ d'abord s'il en a
              if (getBennies(target) > 0) {
                defenseSources.push({
                  key: "npc",
                  label: `Jeton de ${target.name}`,
                  count: getBennies(target)
                });
              } else {
                // Ne proposer les jetons du MJ que si le PNJ n'a plus de jetons
                const gmBennies = getGMBennies();
                if (gmBennies > 0) {
                  defenseSources.push({
                    key: "gm",
                    label: "Jeton du MJ",
                    count: gmBennies
                  });
                }
              }

              if (defenseSources.length === 0) break;

              const choice = await chooseBennySource(
                `Relance — Défense de ${target.name} (Round ${i})`,
                `Meilleur résultat de ${target.name} pour l'instant : <strong>${bestDefense.total}</strong> (dernier jet : ${currentDefense.total}). Relancer avec un jeton ?`,
                defenseSources
              );

              if (!choice) break;

              let spent = false;
              if (choice === "npc") {
                spent = await spendBenny(target);
                if (spent) defenseBennyLabels.push(target.name);
              } else if (choice === "gm") {
                spent = await spendGMBenny();
                if (spent) defenseBennyLabels.push("MJ");
              }

              if (!spent) break;

              currentDefense = await rollDefense();
              defenseCritFail = isCriticalFailure(currentDefense);
              if (currentDefense.total > bestDefense.total) bestDefense = currentDefense;
            }

            const rawThreshold = bestDefense.total;
            const threshold = Math.max(rawThreshold, MIN_THRESHOLD);
            const thresholdBumped = rawThreshold < MIN_THRESHOLD;

            let currentPjRoll = await rollSkill(actor, skillPJName);
            let bestPjRoll = currentPjRoll;
            const pjBennyLabels = [];
            let pjCritFail = isCriticalFailure(currentPjRoll);

            // ---- Proposition de relance du jet du PJ (jeton du PJ uniquement) ----
            // Proposée après chaque jet (succès ou échec), et répétable tant
            // que le PJ a encore des jetons et n'a pas fait d'échec critique.
            // Là aussi, on garde le MEILLEUR résultat de la série.
            while (!pjCritFail && getBennies(actor) > 0) {
              const choice = await chooseBennySource(
                `Relance — Jet de ${actor.name} (Round ${i})`,
                `Meilleur résultat de ${actor.name} pour l'instant : <strong>${bestPjRoll.total}</strong> (dernier jet : ${currentPjRoll.total}) face à un seuil de <strong>${threshold}</strong>. Relancer avec un jeton ?`,
                [{
                  key: "pj",
                  label: `Jeton de ${actor.name}`,
                  count: getBennies(actor)
                }]
              );

              if (choice !== "pj") break;

              const spent = await spendBenny(actor);
              if (!spent) break;

              pjBennyLabels.push(actor.name);
              currentPjRoll = await rollSkill(actor, skillPJName);
              pjCritFail = isCriticalFailure(currentPjRoll);
              if (currentPjRoll.total > bestPjRoll.total) bestPjRoll = currentPjRoll;
            }

            const influence = calcInfluence(bestPjRoll.total, threshold);
            totalInfluence += influence;

            history.push({
              i,
              threshold,
              thresholdBumped,
              pj: bestPjRoll.total,
              influence,
              defenseBennyLabels,
              pjBennyLabels,
              defenseCritFail,
              pjCritFail
            });

            // =========================
            // ROUND MESSAGE
            // =========================
            const bennyNotes = [];
            if (defenseBennyLabels.length) {
              bennyNotes.push(`🔄 Défense de ${target.name} relancée ${defenseBennyLabels.length}× (jetons : ${defenseBennyLabels.join(", ")})`);
            }
            if (defenseCritFail) bennyNotes.push(`💀 Échec critique de ${target.name} — relance impossible`);
            if (pjBennyLabels.length) {
              bennyNotes.push(`🔄 Jet de ${actor.name} relancé ${pjBennyLabels.length}× (jetons de ${actor.name})`);
            }
            if (pjCritFail) bennyNotes.push(`💀 Échec critique de ${actor.name} — relance impossible`);
            if (thresholdBumped) bennyNotes.push(`⚠️ Seuil ramené au minimum SWADE (4)`);

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: roundBox(`
                <h3>🎭 Round ${i}</h3>

                <p><strong>${target.name} (défense) :</strong> ${threshold}${thresholdBumped ? ` <em>(jet brut : ${rawThreshold})</em>` : ""}</p>
                <p><strong>${actor.name} :</strong> ${bestPjRoll.total}</p>
                <p><strong>Influence :</strong> ${influence}</p>

                ${bennyNotes.length ? `<p style="font-size:0.9em;color:#555;">${bennyNotes.join("<br>")}</p>` : ""}

                ${separator}

                <p><strong>Cumul des marqueurs d’influence :</strong> ${totalInfluence}</p>
              `)
            });
          }

          // =========================
          // FINAL RECAP (AVANT RÉSULTAT)
          // =========================
          const recap = history.map(r => {
            const notes = [];
            if (r.defenseBennyLabels.length) {
              notes.push(`Défense de ${target.name} relancée ${r.defenseBennyLabels.length}× (${r.defenseBennyLabels.join(", ")})`);
            }
            if (r.defenseCritFail) notes.push(`Échec critique de ${target.name}`);
            if (r.pjBennyLabels.length) {
              notes.push(`Jet de ${actor.name} relancé ${r.pjBennyLabels.length}×`);
            }
            if (r.pjCritFail) notes.push(`Échec critique de ${actor.name}`);
            if (r.thresholdBumped) notes.push(`Seuil min. SWADE appliqué`);

            return `
            <div style="margin:8px 0;">
    
            <div style="font-weight:bold;font-size:14px;">
              Round ${r.i}
            </div>

            <div style="margin-left:10px;">
              <div>${target.name} (défense) : ${r.threshold}</div>
              <div>${actor.name} : ${r.pj}</div>
              <div><strong>Influence gagnée : ${r.influence}</strong></div>
              ${notes.length ? `<div style="font-size:0.9em;color:#555;">${notes.join(" • ")}</div>` : ""}
            </div>

            <hr style="border:0;border-top:1px solid #444;margin:8px 0;">
            </div>
          `;
          }).join("");

          const finalRecapMessage = `
            ${roundBox(`
              <h2>🎭 Récapitulatif du conflit</h2>

              <p><strong>${actor.name}</strong> vs <strong>${target.name}</strong></p>

              <p><strong>Total marqueurs d’influence :</strong> ${totalInfluence}</p>

              <h3>📊 Détail des rounds</h3>

              ${recap}
            `)}
          `;

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: finalRecapMessage
          });

          // =========================
          // FINAL RESULT (APRÈS RECAP)
          // =========================
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: roundBox(`
              <h2>🎯 Résultat du conflit social</h2>

              ${getFinalResult(totalInfluence)}
            `)
          });

        }
      }
    }
  }).render(true);

})();