async function getFiles(target, extensions = ``, source = `user`) {
    extensions = extensions instanceof Array ? extensions : [extensions];
    let filePicker = await foundry.applications.apps.FilePicker.implementation.browse(source, target);
    if (filePicker.files)
        return [...filePicker.files];
    return [];
};

function basename(str, sep) {
    return str.substr(str.lastIndexOf(sep) + 1);
}

function strip_extension(str) {
    return str.substr(0, str.lastIndexOf('.'));
}

async function importDeck(imagespath, deckname, backimage, nameback) {
    let cards = await getFiles(imagespath);
    let deck = game.cards.getName(deckname);
    let toCreate = [];
    let cardName;
    cards.forEach(c => {
        cardName = strip_extension(basename(c, '/'));
        toCreate.push({
            name: cardName,
            origin: deck.id,
            back: { img: backimage, name: nameback },
            faces: [{ img: c, name: cardName }],
            face: 0
        });
    });
    deck.createEmbeddedDocuments("Card", toCreate);
    ui.notifications.info("Deck import completed!");
}

await foundry.applications.api.DialogV2.wait({
    window: { title: "Import new deck from images" },
    content: `
        <form>
            <div style="display: flex; width: 100%; margin-bottom: 10px">
                <label for="imagespath" style="white-space: nowrap; margin-right: 10px; padding-top:4px">Deck Image Path:</label>
                <input type="text" id="imagespath" name="imagespath" />
                <button type="button" class="imagespath-picker-button"><i class="fas fa-file-import fa-fw"></i></button>
            </div>
            <div style="display: flex; width: 100%; margin-bottom: 10px">
                <label for="deckname" style="white-space: nowrap; margin-right: 10px; padding-top:4px">Deck Name (ex Test deck):</label>
                <input type="text" id="deckname" name="deckname" />
            </div>
            <div style="display: flex; width: 100%; margin-bottom: 10px">
                <label for="backimage" style="white-space: nowrap; margin-right: 10px; padding-top:4px">Back Image:</label>
                <input type="text" id="backimage" name="backimage" />
                <button type="button" class="backimage-picker-button"><i class="fas fa-file-import fa-fw"></i></button>
            </div>
            <div style="display: flex; width: 100%; margin-bottom: 10px">
                <label for="nameback" style="white-space: nowrap; margin-right: 10px; padding-top:4px">Deck Back Name (ex Back decks image):</label>
                <input type="text" id="nameback" name="nameback" />
            </div>
        </form>
    `,
    buttons: [
        {
            action: "import",
            label: "Import",
            icon: "fas fa-check",
            default: true,
            callback: (event, button) => {
                const imagespath = button.form.elements.imagespath.value;
                const deckname = button.form.elements.deckname.value;
                const backimage = button.form.elements.backimage.value;
                const nameback = button.form.elements.nameback.value;

                if (!imagespath) {
                    ui.notifications.info("You did not provide a valid image path.");
                    return;
                }
                if (!deckname || !game.cards.getName(deckname)) {
                    ui.notifications.info("You did not provide a valid deck name, make sure it exists.");
                    return;
                }
                if (!backimage) {
                    ui.notifications.info("You did not provide a valid back image path.");
                    return;
                }
                if (!nameback) {
                    ui.notifications.info("You did not provide a valid name for the back image.");
                    return;
                }

                importDeck(imagespath, deckname, backimage, nameback);
            }
        },
        {
            action: "cancel",
            label: "Cancel",
            icon: "fas fa-times"
        }
    ],
    rejectClose: false,
    render: (event, dialog) => {
        dialog.element.querySelector(".imagespath-picker-button").addEventListener("click", () => {
            new foundry.applications.apps.FilePicker.implementation({
                type: "folder",
                callback: (path) => {
                    dialog.element.querySelector("#imagespath").value = path;
                }
            }).render(true);
        });

        dialog.element.querySelector(".backimage-picker-button").addEventListener("click", () => {
            new foundry.applications.apps.FilePicker.implementation({
                type: "file",
                callback: (path) => {
                    dialog.element.querySelector("#backimage").value = path;
                }
            }).render(true);
        });
    }
});