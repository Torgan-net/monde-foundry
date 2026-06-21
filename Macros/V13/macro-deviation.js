/*******************************************
 * Unshake macro for SWD
 * version 2.2.0
 * (c): brunocalado; altered by SalieriC.
 ******************************************/

async function deviation_script(weapontype = false, range = false) {
    /* image d'une horloge au format svg pour voir la direction de la déviation*/
    const chatimage = "modules/clock.svg";

    if (weapontype && range) {
        rollForIt()
    } else {
        getRequirements();
    }

    function getRequirements() {
        let template = `
  <h2>Type d'Arme</h2>
  <table style="width:100%">
  <tr>
    <td><input type="radio" id="thrown" name="weapontype" value="thrown"><label for="thrown"> Arme lancée</label></td>
    <td><input type="radio" id="projectile" name="weapontype" value="projectile" checked="checked><label for="projectile"> Projectile</label></td>    
  </tr>
  </table>  
  <h2>Distance</h2>
  <table style="width:100%">
  <tr>
    <td><input type="radio" id="short" name="range" value="short" checked="checked><label for="thrown"> Courte</label></td>
    <td><input type="radio" id="medium" name="range" value="medium"><label for="projectile"> Moyenne</label></td>
    <td><input type="radio" id="long" name="range" value="long"><label for="projectile"> Longue</label></td>
    <td><input type="radio" id="extreme" name="range" value="extreme"><label for="projectile"> Extrême</label></td>
  </tr>
  </table>
  </div>
  `;
        new Dialog({
            title: "Déviation",
            content: template,
            buttons: {
                ok: {
                    label: "Calculer",
                    callback: async (html) => {
                        weapontype = html.find('input[name="weapontype"]:checked').val();
                        range = html.find('input[name="range"]:checked').val();
                        rollForIt();
                    },
                }
            },
        }).render(true);
    }

    function rollForIt() {
        let deviation;

        if (weapontype == 'thrown') {
            deviation = diceRoll('1d6', range);
        } else {
            deviation = diceRoll('2d6', range);
        }
    }

    async function diceRoll(die, range) {
        const rangeMultiplier = rangeCheck(range);
        let direction = await new Roll('1d12').roll();
        let roll = await new Roll(die).roll();
        let message = `<h2>Deviation</h2>`;
        message += "<p>Déplacer le gabarit d'explosion de <b>" + roll.total * rangeMultiplier + "</b> case(s) en suivant la direction de <b style='color:red'>" + direction.total + "</b> heures </p>";
        //if (directionCheck(direction.total)) {
            message += "<p><b style='color:red'>il est impossible qu’une attaque dévie de plus de la moitié de la distance initiale (ce qui empêche que l’attaque finisse derrière le tireur).</b></p>";
        //}
        message += "<p style='text-align:center'><img style='vertical-align:middle; border: none;' src=" + chatimage + " width='200' height='200'><p></p>";
        message += `</div>`

        let tempChatData = {
            //type: CHAT_MESSAGE_TYPES.ROLL,
            roll: roll,
            rollMode: game.settings.get("core", "rollMode"),
            content: message
        };
        ChatMessage.create(tempChatData);
        return roll.total;
    }

    function rangeCheck(range) {
        if (range == 'short') {
            return 1;
        } else if (range == 'medium') {
            return 2;
        } else if (range == 'long') {
            return 3;
        } else if (range == 'extreme') {
            return 4;
        }
    }

    function directionCheck(direction) {
        //console.log(direction);
        if (direction == 4 || direction == 5 || direction == 6 || direction == 7 || direction == 8) {
            return true
        } else {
            return false
        }
    }
}

deviation_script();