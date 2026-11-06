/*******************************************
 * Dramatic Task Planner macro
 * version 1.0.1
 * (c): SalieriC, original idea and code base: brunocalado.
 ******************************************/

async function dramatic_task_planner_script(img) {
    let chatimage = 'icons/commodities/tech/detonator-timer.webp';
    const targetsArray = Array.from(game.user.targets)

    if (img) {
        chatimage = img
    }
    const challengeTrackerInstalled = game.modules.get('challenge-tracker')?.active
    let players = 1
    if (targetsArray.length > 0) {
        players = targetsArray.length
    }
    let template = `
    <style type="text/css">
    .tg  {border-collapse:collapse;border-spacing:0;}
    .tg td{border-color:black;border-style:solid;border-width:0px;font-family:Arial, sans-serif;font-size:14px;
        overflow:hidden;padding:10px 5px;word-break:normal;}
    .tg th{border-color:black;border-style:solid;border-width:0px;font-family:Arial, sans-serif;font-size:14px;
        font-weight:normal;overflow:hidden;padding:10px 5px;word-break:normal;}
    .tg .tg-xwyw{border-color:#000000;text-align:center;vertical-align:middle}
    .tg .tg-0lax{border-color:#000000;text-align:center;vertical-align:middle}
    </style>

    <table class="tg">
    <tbody>
        <tr>
            <td class="tg-xwyw">
                    <b>Joueur</b>
                    <p>
                    <input id="playersAmount" type="number" min="1" max="100" value="${players}">  
                    </p>
            </td>
            <td class="tg-0lax">
                <b>Difficulté</b>
                <p>
                <select id="difficulty" name="difficulty">
                    <option value="challenging" selected="selected">Délicat</option>
                    <option value="difficult">Difficile</option>
                    <option value="complex">Complexe</option>
                </select>  
                </p>
            </td>
        </tr>

        <tr>
            <td class="tg-xwyw" colspan="2">
                <h3>Sur mesure</h3>
                <p>Sur mesure</p>
            </td>
        </tr>

        <tr>
            <td class="tg-xwyw">
                    <b>Jetons</b>
                    <p>
                        <input id="customTokens" type="number" min="1" max="100" value="0">    
                    </p>
            </td>
            <td class="tg-0lax">
                <b>Tours</b>
                <p>
                    <input id="customTurns" type="number" min="1" max="100" value="0">    
                </p>
            </td>
        </tr>

        <tr>
            <td class="tg-xwyw" colspan="2">
                <h3><b>Options</b></h3>
            </td>
        </tr>
    `
    if (challengeTrackerInstalled) {
        template += `
        <tr>
            <td class="tg-xwyw">
                <b>Challenge Tracker (CT)</b>
            </td>
            <td class="tg-xwyw">
                <input id="challengeTracker" type="checkbox" checked>
            </td>    
        </tr>
        <tr>
            <td class="tg-xwyw">
                <b>Fenêtré</b>
            </td>
            <td class="tg-xwyw">
                <input id="challengeTrackerWindowed" type="checkbox" checked>
            </td>    
        </tr>
        <tr>
            <td class="tg-xwyw">
                <b>Montrer les tours</b>
            </td>
            <td class="tg-xwyw">
                <input id="challengeTrackerRounds" type="checkbox" checked>
            </td>    
        </tr>
        <tr>
        `
    }

    template += `
            <td class="tg-xwyw">
                <b>Scène par Joueur</b>
            </td>
            <td class="tg-xwyw">
                <input id="taskPerPlayer" type="checkbox">
            </td>    
        </tr>
        
    </tbody>
    </div>
    </table>
    `

    new Dialog({
        title: "Scène Dramatique",
        content: await TextEditor.enrichHTML(template),
        buttons: {
            ok: {
                label: "Accepter",
                callback: async (html) => {
                    dramaticTask(html);
                },
            },
            cancel: {
                label: "Annuler",
            }
        },
        default: "Accepter"
    }, {}).render(true);

    async function dramaticTask(html) {
        const players = Number(html.find("#playersAmount")[0].value);
        const difficulty = html.find("#difficulty")[0].value;
        const customTokens = html.find("#customTokens")[0].value;
        const customTurns = html.find("#customTurns")[0].value;
        const challengeTracker = challengeTrackerInstalled ? html.find("#challengeTracker")[0].checked : false;
        const challengeTrackerWindowed = challengeTrackerInstalled ? html.find("#challengeTrackerWindowed")[0].checked : false;
        const challengeTrackerRounds = challengeTrackerInstalled ? html.find("#challengeTrackerRounds")[0].checked : false;
        const taskPerPlayer = challengeTrackerInstalled ? html.find("#taskPerPlayer")[0].checked : false;
        let useNames = false
        if (targetsArray.length === players && taskPerPlayer) {
            useNames = true
        }

        let message = ``;
        message = `<h2><img style="vertical-align:middle" src=${chatimage} width="28" height="28"> </h2>`;

        if (taskPerPlayer) {
            for (let i = 0; i < players; i++) {
                let nameOfPlayer = false
                if (targetsArray.length > 0) {
                    nameOfPlayer = targetsArray[i].name
                }
                if (customTokens != 0 && customTurns != 0) {
                    message += customDramaticTask(customTokens, customTurns, challengeTracker, challengeTrackerWindowed, challengeTrackerRounds, useNames, nameOfPlayer);
                } else {
                    message += calculateTaskTokens(1, difficulty, challengeTracker, challengeTrackerWindowed, challengeTrackerRounds, useNames, nameOfPlayer);
                }
            }
        } else {
            if (customTokens != 0 && customTurns != 0) {
                message += customDramaticTask(customTokens, customTurns, challengeTracker, challengeTrackerWindowed, challengeTrackerRounds, useNames);
            } else {
                message += calculateTaskTokens(players, difficulty, challengeTracker, challengeTrackerWindowed, challengeTrackerRounds, useNames);
            }
        }

        // send message
        let chatData = {
            content: await TextEditor.enrichHTML(message + '</div>'),
            whisper: ChatMessage.getWhisperRecipients("GM")
        };
        ChatMessage.create(chatData, {});
    }

    function calculateTaskTokens(players, difficulty, challengeTracker = false, challengeTrackerWindowed = false, challengeTrackerRounds = false, useNames = false, nameOfPlayer = false) {
        let tasksTokens = 0;
        let tasksTurns = 0;
        let difficultyName = '';
        let message = ``;
        if (difficulty == 'challenging') {
            tasksTokens = players * 4;
            tasksTurns = 3;
            difficultyName = "Challenging"
        } else if (difficulty == 'difficult') {
            tasksTokens = players * 6;
            tasksTurns = 4;
            difficultyName = "Difficult"
        } else if (difficulty == 'complex') {
            tasksTokens = players * 8;
            tasksTurns = 5;
            difficultyName = "Complex"
        }
        let playersCountWord = "Players"
        if (players === 1) {
            playersCountWord = "Player"
        }
        let playerName = `<b>${players}</b> ${playersCountWord}`
        if (useNames) {
            playerName = `<b>${nameOfPlayer}</b>`
        }
        
        message += `<p>This is <b>${difficultyName}</b> pour ${playerName}.</p><ul><li>Jetons de tâches : <b style="color:red;">${tasksTokens}</b></li><li>Rounds : <b style="color:red;">${tasksTurns}</b></p></ul>`
        
        if (challengeTracker) {
            let title = "Scène Dramatique"
            if (useNames) {
                title += ` pour ${nameOfPlayer}`
            }
            ChallengeTracker.open({
                outerTotal: tasksTokens,
                innerTotal: challengeTrackerRounds ? tasksTurns : 0,
                title: title,
                windowed: challengeTrackerWindowed,
                size:600
            })
        }

        return message;
    }

    function customDramaticTask(tokens, turns, challengeTracker = false, challengeTrackerWindowed = false, challengeTrackerRounds = false, useNames = false, nameOfPlayer = false) {
        let message = ``
        if (useNames) {
            message = ` Scène Dramatique pour <b>${nameOfPlayer}</b>:`
        }
        message += `<ul><li>Jetons de tâches : <b style="color:red;">${tokens}</b></li><li>Rounds : <b style="color:red;">${turns}</b></p></ul>`
        
        if (challengeTracker) {
            let title = "Scène Dramatique"
            if (useNames) {
                title += ` pour ${nameOfPlayer}`
            }
            ChallengeTracker.open({
                outerTotal: tokens,
                innerTotal: challengeTrackerRounds ? turns : 0,
                title: title,
                windowed: challengeTrackerWindowed
            })
        }

        return message;
    }
}

dramatic_task_planner_script(this.img)