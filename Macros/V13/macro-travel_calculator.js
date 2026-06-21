/*******************************************
 * Travel Calculator Macro
 * version v.3.1.0
 * Made and maintained by SalieriC#8263
 * Future plan: Include random encounters as
 * per the core rules pg.144.
 ******************************************/

const TRAVEL_DEFAULTS_ARRAY = [
    {
        "id": "foot",
        "name": "A Pieds",
        "speedPerHour": 3,
        "image": "modules/foot.webp",
    },
    {
        "id": "horse",
        "name": "A Cheval",
        "speedPerHour": 3.75,
        "image": "modules/horse.webp",
    },
    {
        "id": "earlyCar",
        "name": "Ancienne Voiture",
        "speedPerHour": 25,
        "image": "modules/earlyCar.webp",
    },
    {
        "id": "modernCar",
        "name": "Voiture Moderne",
        "speedPerHour": 50,
        "image": "modules/modernCar.webp",
    },
    {
        "id": "sailingShip",
        "name": "Bateau à voiles",
        "speedPerHour": 3.75,
        "image": "modules/sailingShip.webp",
    },
    {
        "id": "steamShip",
        "name": "Bateau à vapeur",
        "speedPerHour": 5,
        "image": "modules/steamShip.webp",
    },
    {
        "id": "modernShip",
        "name": "Bateau moderne",
        "speedPerHour": 25,
        "image": "modules/modernShip.webp",
    },
    {
        "id": "highSpeedFerry",
        "name": "Ferry à haute vélocité",
        "speedPerHour": 50,
        "image": "modules/highSpeedFerry.webp",
    },
    {
        "id": "steamTrain",
        "name": "Train à vapeur",
        "speedPerHour": 7.5,
        "image": "modules/steamTrain.webp",
    },
    {
        "id": "modernPassengerTrain",
        "name": "Train de passagers moderne",
        "speedPerHour": 50,
        "image": "modules/modernPassengerTrain.webp",
    },
    {
        "id": "propPlane",
        "name": "Avion à hélices",
        "speedPerHour": 125,
        "image": "modules/propPlane.webp",
    },
    {
        "id": "commercialJet",
        "name": "Avion de ligne moderne",
        "speedPerHour": 500,
        "image": "modules/commercialJet.webp",
    }
]


async function travel_calculator() {
    const defaultOptionsArray = TRAVEL_DEFAULTS_ARRAY
    const totalOptionsArray = [...defaultOptionsArray]

    let options = ""
    for (let each of totalOptionsArray) {
        options += `<option value=${each.id}>${game.i18n.localize(each.name)}</option>`
    }

    let dialogueContent = `
    <div>
      <label for="distance"><b>Distance à parcourir : </b></label>
      <input type="text" id="distance" name="distance" required pattern="[0-9]+" autofocus />
    </div>
    <div>
      <label for="unit"><b>Unité : </b></label>
      <input type="radio" id="km" name="unit" value="km" checked>
      <label for="km">Kilomètres</label>
      <input type="radio" id="miles" name="unit" value="miles">
      <label for="miles">Miles</label>
    </div>`

    dialogueContent += `<div>
      <label for="method"><b>Methode de Voyage : </b></label>
      <select id="method" name="method">${options}</select>
    </div>
    <div>
        <label for="stealthMode"><b>Mode Discret : </b></label>
        <input type="checkbox" id="stealthMode" name="stealthMode">
        <p>(En mode furtif, aucun son ne sera émis et les joueurs ne verront aucune image apparaître.)</p>
    </div>`

    dialogueContent += `</div>`;

    new Dialog({
        title: "Calcul du Voyage",
        content: dialogueContent,
        buttons: {
            one: {
                label: "<em class='fas fa-check'></em> Accepter",
                callback: (html) => {
                    const distance = html.find('[name="distance"]').val();
                    const unit = html.find('[name="unit"]:checked').val();
                    const method = html.find('[name="method"]').val();
                    let generateEncounters = false;

                    if (!distance || distance <= 0) {
                        return ui.notifications.error("Distance de déplacement non valide. Veuillez saisir un nombre supérieur à zéro.");
                    }

                    let stealthMode = html.find('#stealthMode')[0].checked;
                    calculate_results(distance, unit, method, false, stealthMode, totalOptionsArray);
                },
            },
            two: {
                label: "<em class='fas fa-times'></em> Annuler",
            },
        },
        default: 'one',
        render: (html) => {
            $("#swim-dialogue").css("height", "auto");
        },
    }, {
        id: "swim-dialogue"
    }).render(true);
}

async function calculate_results(distance, unit, method, generateEncounters, stealthMode, totalOptionsArray) {
    //Have to calculate in retarded units unfortunately:
    const originalDistance = distance
    if (unit === 'km') {
        distance = distance * 0.621371192237334;
    }

    let speedPerHour = totalOptionsArray.find(o => o.id === method).speedPerHour

    // Calculate the result based on distance and speedPerHour
    const speedPerDay = speedPerHour * 8
    let result = distance / speedPerDay;
    let resultRaw = distance / speedPerHour
    //Convert result to days and hours:
    let days = Math.floor(result);
    const travelDays = days
    let hours = Math.floor((result - days) * 8);
    let resultText = days + ` jour(s)` + ", " + hours + ` heure(s)`

    // Convert resultRaw to days and hours
    days = Math.floor(resultRaw / 24);
    hours = Math.floor(resultRaw % 24);

    let resultTextRaw = days + ` jour(s)` + ", " + hours + ` heure(s)`;

    show_results(originalDistance, unit, method, resultText, resultTextRaw, generateEncounters, travelDays, stealthMode, totalOptionsArray)
}

async function wait(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

async function show_results(distance, unit, method, resultText, resultTextRaw, generateEncounters, travelDays, stealthMode, totalOptionsArray) {
    const ip = await new foundry.applications.apps.ImagePopout({
        src: totalOptionsArray.find(o => o.id === method).image,
        title: totalOptionsArray.find(o => o.id === method).name
        })
    
    if (!stealthMode) {
        ip.render(true);
    }

    //Give a little bit of time to show the dialogue above the image for the GM:
    await wait('250')

    new Dialog({
        title: "Calcul de Voyage",
        content: `<p><b>Distance de voyage : </b>` + distance +  unit + `</p><p><b>Moyen de déplacement : </b>` + game.i18n.localize(totalOptionsArray.find(o => o.id === method).name) + `</p><p><b>Temps requis (8 hrs par jour, aprox.) : </b>` + resultText + `</p><b>Temps Requis (non-stop, aprox.) : </b>` + resultTextRaw + `</p><p>En général, le jeu part du principe que les personnages voyagent 8 heures par jour dans des conditions moyennes. Des conditions meilleures ou pires peuvent entraîner une arrivée plus tôt ou plus tard. De plus, pour de nombreux véhicules, il semble plus raisonnable d'utiliser la valeur sans arrêt.</p>
        </div>`,
        buttons: {
            one: {
                label: "<em class='fas fa-check'></em> Accepter",
            }
        },
        default: "one",
    }).render(true);
}

travel_calculator();