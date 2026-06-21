/*******************************************
 * Falling Damage Macro.
 * This macro automatically calculates falling damage for all selected tokens.
 * It is capable of factoring in water and snow/soft surfaces as per the core rules.
 * v. 2.2.1 by SalieriC#8263, CSS of the dialogue by Kyane von Schnitzel#8654
 * (Do not remove credits, even if editing.)
 *******************************************/

async function falling_damage_script() {
    //use deduplication to get rid of those which are both, selected and targeted:
    let tokens = [...new Set([...canvas.tokens.controlled, ...game.user.targets])];
    if (tokens.length === 0) {
        return "Veuillez sélectionner ou cibler un ou plusieurs jetons.";
    }
    
    const icon = "modules/falling_sbed_game-icons.net.png"
    let messageContent = `<h2><img style="border: 0;" src=${icon} width="35" height="35" /> Dégâts causés par une chute</h2>`;

    const options = `<option value="na">n/a</option>
    <option value="success">Réussite</option>
    <option value="raise">Prouesse</option>`;

    main();

    //rol the damage the character takes based on the distance:
    async function roll_damage(token, fallingDepth, snowDepth, waterSuccess) {
        let halvedDepth = Math.ceil(fallingDepth / 2); //damage per 2"
        let damageFormula = halvedDepth >= 10 ? `(1d6x+1)*10` : `(1d6x+1)*${halvedDepth}`; //cap falling damage at 10d6+10
        let rollDamage = await new Roll(`${damageFormula}`).evaluate({ async: false });
        let damage = rollDamage.total;
        let waterRaise = false;
        if (snowDepth > 0) {
            damage = damage - snowDepth;
        } else if (waterSuccess != "na") {
            if (waterSuccess === "success") { damage = Math.ceil(damage / 2) }
            else if (waterSuccess === "raise") { waterRaise = true; damage = 0; }
        }
        if (waterRaise === false) {
            messageContent += `<p>` + token.name + `tombe ` + fallingDepth + ` &rdquo; et subit <strong><span style=“font-size:115%”>`+ damage + `</strong></span> points de dégâts.`
        } else if (waterRaise === true) {
            messageContent += `<p>` + tokenName + ` tombe ` + fallingDepth + ` &rdquo;, mais plonge gracieusement dans l'eau sans subir aucun dommage.</p>`
        }
        await calculate_damage(token, damage);
    }

    async function calculate_damage(token, damage) {
        const toughness = token.actor.system.stats.toughness.value;
        const isShaken = token.actor.system.status.isShaken;
        const raises = Math.floor((damage - toughness) / 4);
        const isHardy = token.actor.items.find(function (item) {
            return (item.name.toLowerCase() === "hardy" && item.type === "ability");
        });
        if (toughness > damage) {
            messageContent += `<p>=> Pas de mal.</p>`
        } else if (toughness <= damage) {
            if (isShaken === false && raises <= 0) {
                messageContent += `<p>=> Secoué</p>`
            } else if (isShaken === false && raises >= 1) {
                messageContent += `<p>=> Secoué et " + ` + raises + ` blessure(s)</p>`
            } else if (isShaken === true && raises <= 1) {
                if (!isHardy || raises === 1) {
                    messageContent += `<p>=> 1 blessure.</p>`
                } else if (isHardy) {
                    messageContent += `<p>=> Pas de mal.</p>`
                }
            } else if (isShaken === true && raises >= 1) {
                let wounds = raises - 1;
                messageContent += `<p>=> ` + wounds + `blessure(s).</p>`
            }
        }
    }

    async function main() {
        let content = "<p>Qui tombe à quelle hauteur ?</p><p>Indiquez la hauteur de chute en &rdquo; (carrés sur la table ; chacun équivaut à 2 yards &cong; 2 mètres).</p><p>La neige et autres sols mous réduisent les dégâts. Indiquez la hauteur en pieds (&cong; 30 cm) si applicable, ou laissez 0 si ce n'est pas le cas. </p><p>Une chute dans l'eau permet un jet d'athlétisme. Si applicable, indiquez le degré de réussite. Si cela n'est pas applicable ou si le jet a échoué, laissez « n/a ».</p><div style='display: grid; grid-template-columns: 5fr 1.2fr 1fr 1.3fr; grid-gap: 2px;“><strong style='text-align: left;”>Jeton</strong><strong style=“text-align: center;”>Hauteur</strong><strong style=“text-align: center;”>Neige</strong><strong style=“text-align: center;”>Athlétisme</strong>"
        for (let token of tokens) {
            content += `
        <p>
          <img style="border: 0; text-align: left;" src="${token.document.texture.src}" width="25" height="25" /> 
          <span style="vertical-align: super; text-align: left;">${token.name}</span>
        </p>
        <input style="text-align: center;" id="fallingDepth-${token.id}" style="flex: 1;" type="number" value="0" />
        <input style="text-align: center;" id="snowDepth-${token.id}" style="flex: 1;" type="number" value="0" />
        <select style="text-align: center;" id="water-${token.id}">${options}</select>
    `;
        }
        content += `
        </div>
    </div>`;
        new Dialog({
            title: "On ne peut pas combiner l'eau et la neige.",
            content: content,
            buttons: {
                roll: {
                    label: "Jet de Vigueur",
                    callback: async (html) => {
                        for (let token of tokens) {
                            //Getting results from checkboxes and making the rolls.
                            let fallingDepth = Number(html.find(`#fallingDepth-${token.id}`)[0].value);
                            let snowDepth = Number(html.find(`#snowDepth-${token.id}`)[0].value);
                            let waterSuccess = html.find(`#water-${token.id}`)[0].value;
                            //console.log(fallingDepth, snowDepth, waterSuccess)
                            if (waterSuccess != "na" && snowDepth != 0) {
                                return ui.notifications.error("On ne peut pas combiner l'eau et la neige.")
                            }
                            messageContent += `<h3><img style="border: 0;" src=${token.document.texture.src} width="35" height="35" /> ${token.name}</h3>`;
                            await roll_damage(token, fallingDepth, snowDepth, waterSuccess);
                        }
                        messageContent += `</div>`;
                        ChatMessage.create({
                            content: messageContent
                        });
                    }
                },
                cancel: {
                    label: "Annuler"
                }
            }
        }).render(true)
    }
}

falling_damage_script()