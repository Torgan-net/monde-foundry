/*******************************************
 * Token Vision macro for SWADE
 * Created by SalieriC#8263
 * version 5.2.1
 * Inspired by @Sky#9453:
 * https://github.com/Sky-Captain-13/foundry
 ******************************************/

// Get Macro Variables
async function get_macro_variables() {
    // Add variables to the evaluation scope
    const speaker = ChatMessage.implementation.getSpeaker();
    const character = game.user.character;
    const actor = game.actors.get(speaker.actor);
    const token = (canvas.ready ? canvas.tokens.get(speaker.token) : null);
    return { speaker, character, actor, token }
  }

async function token_vision_script(condition = false) {
    const { speaker, _, __, token } = await get_macro_variables()

    if (!token || canvas.tokens.controlled.length > 1) {
        ui.notifications.error("Veuillez d'abord sélectionner un seul jeton.")
        return
    }
    const actor = token.actor
    const scene = token.scene
    let currentColour = token.document.light.color
    let sceneDarkness = token.scene.darkness
    let selectFull = ""
    let selectDim = ""
    let selectDark = ""
    let selectPitch = ""
    if (scene.flags?.swim?.config?.illuminationLevel) {
        if (scene.flags?.swim?.config?.illuminationLevel === "none") { sceneDarkness = 0 }
        else if (scene.flags?.swim?.config?.illuminationLevel === "dim") { sceneDarkness = 0.5 }
        else if (scene.flags?.swim?.config?.illuminationLevel === "dark") { sceneDarkness = 0.75 }
        else if (scene.flags?.swim?.config?.illuminationLevel === "pitch") { sceneDarkness = 1 }
    }
    if (sceneDarkness <= 0.1) { selectFull = "selected" }
    else if (sceneDarkness <= 0.5) { selectDim = "selected" }
    else if (sceneDarkness <= 0.75) { selectDark = "selected" }
    else if (sceneDarkness <= 1) { selectPitch = "selected" }
    const illuminationTypes = `
        <option value="nochange"}>Pas de changement</option>    
        <option value="none" ${selectFull}>Pleine lumière / Lumière du jour</option>
        <option value="dim" ${selectDim}>Pénombre</option>
        <option value="dark" ${selectDark}>Obscurité</option>
        <option value="pitch" ${selectPitch}>Ténèbres</option>
    `

    const lowLightVision = actor.items.find(a => a.type === "ability" && a.name === "Low Light Vision")
    const infravision = actor.items.find(a => a.type === "ability" && a.name === "Infravision")
    const darkvision = actor.items.find(a => a.type === "ability" && a.name === "Darkvision")
    let visionTypes = `
        <option value="nochange">Pas de changement</option>    
        <option value="none">None</option>
    `
    if (lowLightVision) { visionTypes += `<option value="lowLiVis" selected>Vision en lumière faible</option>` }
    if (infravision) { visionTypes += `<option value="infraVis" selected>Vision infrarouge</option>` }
    if (darkvision) { visionTypes += `<option value="darkVis" selected>Vision nocturne</option>` }
    visionTypes += `<option value="niViDi">Dispositif de vision amplifiée</option>`

    let dialogue_content = `
        <form>
        <dt>
          <div class="form-group">
            <label>Source de lumière : </label>
            <select id="light-source" name="light-source">
              <option value="nochange">Pas de changement</option>
              <option value="none">Aucune</option>
              <option value="candle">Bougie</option>
              <option value="lantern">Lanterne</option>
              <option value="bullseye">Lanterne à capuchon</option>
              <option value="torch">Torche</option>
              <option value="flLight">Lampe torche</option>
            </select>
          </div>
          <dd>
          <div class="form-group">
            <label>Couleur de lumière : </label>
            <select id="colour-presets" name="colour-presets">
              <option value="picker">Personnalisé</option>
              <option value="candle">Coleur Bougie</option>
              <option value="fire">Couleur feu de torche</option>
              <option value="magnesium">Couleur magnésium</option>
              <option value="white">Blanc de lampe torche</option>
            </select>
          </div>
          </dd><dd>
          <div class="form-group">
            <label>Coleur personnalisée :</label>
            <input type="color" id="colour-choice" value="${currentColour}" style="width:50%;" align="right">
          </div>
          </dd></dt><dt>
          <div class="form-group">
            <label>Illumination : </label>
            <select id="illumination-type" name="illumination-type">
              ${illuminationTypes}
            </select>
          </div>
          </dt><dt>
          <div class="form-group">
            <label>Type de vision : </label>
            <select id="vision-type" name="vision-type">
              ${visionTypes}
            </select>
          </div>
          </dt>
        </form>
        `
    
    let dialogueButtons = {
        yes: {
            //icon: "<i class='fas fa-check'></i>",
            label: "accepter",
            callback: (html) => {
                changeVision(token, html, condition);
            }
        },
        no: {
            //icon: "<i class='fas fa-times'></i>",
            label: "annuler"
        }
    }

    // Main Dialogue    
    new Dialog({
        title: "Vision du jeton",
        content: dialogue_content,
        buttons: dialogueButtons,
        default: "accepter",
    }).render(true);
}

async function changeVision(token, html, condition) {
    const tokenD = token.document
    let sfx
    let lightSource = html.find('[name="light-source"]')[0].value
    let visionType = html.find('[name="vision-type"]')[0].value
    let illuminationType = html.find('[name="illumination-type"]')[0].value
    let visionRange = 0
    let enableSight = visionType === "noChange" ? token.sight.enabled : true
    let visionRangeCurr = tokenD.sight.range
    let visionAngle = tokenD.sight.angle
    let visionMode = tokenD.sight.visionMode
    let lightRadiusDim = tokenD.light.dim
    let lightRadiusBright = tokenD.light.bright
    let lightAngle = tokenD.light.angle
    let presetChoice = html.find('[id="colour-presets"]')[0].value;
    let colourChoice = tokenD.light.color ? "#ffffff" : tokenD.light.color
        if (presetChoice === "picker") { colourChoice = html.find('[id="colour-choice"]')[0].value; }
        else if (presetChoice === "candle") { colourChoice = "#fffcbb" }
        else if (presetChoice === "fire") { colourChoice = "#f8c377" }
        else if (presetChoice === "magnesium") { colourChoice = "#e52424" }
        else if (presetChoice === "white") { colourChoice = "#FFFFFF" }
    let lightColour = tokenD.light.color
    let detectionModes = [
        {
            id: "basicSight",
            enabled: false,
            range: 0
        },
        {
            id: "seeHeat",
            enabled: false,
            range: 0
        }
    ]
    let activeLight = false
        if (tokenD.light.bright >= 1 || tokenD.light.dim >= 1) { activeLight = true }

    if (lightSource === "none") {
        lightRadiusDim = 0
        lightRadiusBright = 0
        activeLight = false
    } else if (lightSource === "candle") {
        lightRadiusDim = 0
        lightRadiusBright = 2
        lightAngle = 360
        lightColour = colourChoice
        activeLight = true
    } else if (lightSource === "lantern" || lightSource === "torch") {
        lightRadiusDim = 0
        lightRadiusBright = 4
        lightAngle = 360
        lightColour = colourChoice
        activeLight = true
    } else if (lightSource === "bullseye") {
        lightRadiusDim = 0
        lightRadiusBright = 4
        lightAngle = 52.5
        lightColour = colourChoice
        activeLight = true
    } else if (lightSource === "flLight") {
        lightRadiusDim = 0
        lightRadiusBright = 10
        lightAngle = 52.5
        lightColour = colourChoice
        activeLight = true
    }

    if (illuminationType === "none") {
        visionRange = 1000
        visionAngle = 360
        detectionModes[0].range = 1000
        detectionModes[0].enabled = true
    } else if (illuminationType === "dim") {
        visionRange = 25
        visionAngle = 360
        detectionModes[0].range = 25
        detectionModes[0].enabled = true
    } else if (illuminationType === "dark") {
        visionRange = 10
        visionAngle = 360
        detectionModes[0].range = 10
        detectionModes[0].enabled = true
    } else if (illuminationType === "pitch") {
        visionRange = 0
        visionAngle = 360
        detectionModes[0].range = 0
        detectionModes[0].enabled = true
    }

    if (visionType === "none" || (visionType === "lowLiVis" && illuminationType === "pitch")) {
        visionMode = "basic"
        detectionModes[0].range = detectionModes[0].range >= 1 ? detectionModes[0].range : 1
        detectionModes[0].enabled = true
    } else if (visionType === "lowLiVis") {
        visionMode = "darkvision"
        visionRange = visionRange >= 25 ? visionRange : 25
        visionAngle = 360
        detectionModes[0].range = detectionModes[0].range >= 25 ? detectionModes[0].range : 25
        detectionModes[0].enabled = true
    } else if (visionType === "infraVis") {
        visionRange = 25
        visionRange = visionRange >= 0 ? visionRange : 0
        visionAngle = 360
        visionMode = "infraVision"
        detectionModes[0].range = 0
        detectionModes[0].enabled = false
        detectionModes[1].range = 25
        detectionModes[1].enabled = true
    } else if (visionType === "darkVis") {
        visionMode = "darkvision"
        visionRange = visionRange >= 10 ? visionRange : 10
        visionAngle = 360
        detectionModes[0].range = detectionModes[0].range >= 10 ? detectionModes[0].range : 10
        detectionModes[0].enabled = true
    } else if (visionType === "niViDi") {
        visionMode = "lightAmplification"
        visionRange = visionRange >= 25 ? visionRange : 25
        visionAngle = 360
        detectionModes[0].range = detectionModes[0].range >= 25 ? detectionModes[0].range : 25
        detectionModes[0].enabled = true
    }

    if (illuminationType === "nochange" && visionType === "nochange") {
        visionRange = tokenD.sight.range
    }

    let updates = {
        detectionModes: detectionModes,
        light: {
            angle: lightAngle,
            bright: lightRadiusBright,
            color: lightColour,
            dim: lightRadiusDim
        },
        sight: {
            angle: visionAngle,
            range: visionRange,
            visionMode: visionMode,
            enabled: enableSight
        }
    }
    await tokenD.update(updates)

    if (!condition) {
        if (activeLight === false) {
            let ae = await game.succ.getConditionFrom('torch', tokenD)
            if (ae) { await ae.setFlag('swim', 'deactivatedFromMacro', true) }//set flags to prevent duplicate message in init.js
            await game.succ.removeCondition('torch', tokenD);
        } else {
            await game.succ.addCondition('torch', tokenD, {forceOverlay: false, effectOptions: {swim: {activatedFromMacro: true}}});//pass additional data to prevent duplicate message in init.js
        }
    }
}

token_vision_script()