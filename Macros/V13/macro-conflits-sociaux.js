(async () => {

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
      return `<p><strong>0 — Échec total</strong> : aucun effet.</p>`;
    if (total <= 3)
      return `<p><strong>1–3 — Succès limité</strong> : soutien faible.</p>`;
    if (total <= 5)
      return `<p><strong>4–5 — Succès</strong> : aide conditionnelle.</p>`;
    return `<p><strong>6+ — Succès majeur</strong> : soutien total.</p>`;
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

  new Dialog({
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

            let defense;

            if (mode === "active") {
              const skillPNJ = findSkill(target, skillPNJName);
              defense = skillPNJ
                ? await skillPNJ.roll()
                : await target.rollSkill("Unskilled Attempt");
            } else {
              const attr = mapping[skillPJName.toLowerCase()];
              defense = await rollAttribute(target, attr);
            }

            const threshold = defense.total;

            const pjRoll = await rollSkill(actor, skillPJName);

            const influence = calcInfluence(pjRoll.total, threshold);
            totalInfluence += influence;

            history.push({ i, threshold, pj: pjRoll.total, influence });

            // =========================
            // ROUND MESSAGE (AVEC SÉPARATEUR AJOUTÉ)
            // =========================
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: roundBox(`
                <h3>🎭 Round ${i}</h3>

                <p><strong>Défense :</strong> ${threshold}</p>
                <p><strong>PJ :</strong> ${pjRoll.total}</p>
                <p><strong>Influence :</strong> ${influence}</p>

                ${separator}

                <p><strong>Cumul des marqueurs d’influence :</strong> ${totalInfluence}</p>
              `)
            });
          }

          // =========================
          // FINAL RECAP (AVANT RÉSULTAT)
          // =========================
          const recap = history.map(r => `
            <div style="margin:8px 0;">
    
            <div style="font-weight:bold;font-size:14px;">
              Round ${r.i}
            </div>

            <div style="margin-left:10px;">
              <div>Défense : ${r.threshold}</div>
              <div>PJ : ${r.pj}</div>
              <div><strong>Influence gagnée : ${r.influence}</strong></div>
            </div>

            <hr style="border:0;border-top:1px solid #444;margin:8px 0;">
            </div>
          `).join("");

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
          // FINAL RESULT (APRÈS RECAP — CORRECTION DEMANDÉE)
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