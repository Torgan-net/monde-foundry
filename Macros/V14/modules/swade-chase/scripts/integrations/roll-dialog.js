/**
 * Fenêtre de jet de SWADE : présélection de l'option « actions multiples ».
 * Fenêtre constatée par dump : classe RollDialog, radios name="map" (0 / −2 / −4).
 * Si le champ n'est pas trouvé, le joueur est prévenu.
 */
const MULTI = { 2: -2, 3: -4 };

/**
 * Cherche le champ « actions multiples » dans la fenêtre de jet.
 * Constaté (SWADE 6, RollDialog) : trois boutons radio name="map", valeurs "0", "-2", "-4".
 * Repli : un select dont les valeurs contiennent "-2" et "-4".
 * @returns {{set:(n:number)=>boolean}|null}
 */
export function findMultiActionField(root) {
  const inputs = [...(root?.querySelectorAll?.("input") ?? [])];
  const radios = inputs.filter((el) => el.type === "radio" && el.name === "map");
  if (radios.length) {
    return {
      set(n) {
        const target = radios.find((r) => String(r.value) === String(MULTI[n] ?? 0));
        if (!target) return false;
        for (const r of radios) r.checked = r === target;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    };
  }
  const selects = [...(root?.querySelectorAll?.("select") ?? [])];
  const sel = selects.find((el) => {
    const v = [...(el.options ?? [])].map((o) => String(o.value));
    return v.includes("-2") && v.includes("-4");
  });
  if (!sel) return null;
  return {
    set(n) {
      sel.value = String(MULTI[n] ?? 0);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  };
}

/** Fenêtre de jet ? (exclut le répertoire des tables aléatoires, RollTableDirectory, etc.) */
export function isRollDialog(name) {
  return /roll/i.test(name ?? "") && /dialog/i.test(name ?? "") && !/table|directory/i.test(name ?? "");
}

/** Valeur au format de la ligne « Ajout » de la fenêtre de jet : "+2", "-2". */
export function formatModValue(v) {
  const n = Number(v) || 0;
  return n > 0 ? `+${n}` : String(n);
}

const nextFrame = (delay) => new Promise((r) => setTimeout(r, delay));

/**
 * Ajoute des modificateurs dans la fenêtre de jet SWADE (aussi utilisée par SWADE Tools), via sa ligne
 * « Ajout » (constatée : input.new-modifier-label, input.new-modifier-value, button.add-modifier).
 * La fenêtre se redessine après chaque ajout : on relit l'élément à chaque fois (getRoot).
 * @returns {Promise<boolean>} false si la ligne « Ajout » est introuvable
 */
export async function injectModifiers(getRoot, mods, { delay = 60 } = {}) {
  for (const m of mods ?? []) {
    const root = getRoot();
    const label = root?.querySelector(".new-modifier-label");
    const value = root?.querySelector(".new-modifier-value");
    const add = root?.querySelector(".add-modifier");
    if (!label || !value || !add) return false;
    label.value = m.label;
    value.value = formatModValue(m.value);
    label.dispatchEvent?.(new Event("input", { bubbles: true }));
    value.dispatchEvent?.(new Event("input", { bubbles: true }));
    add.click();
    await nextFrame(delay);
  }
  return true;
}

let pending = null;

/**
 * Arme la prochaine fenêtre de jet ouverte par ce client (délai max) : l'option « actions multiples »
 * y est réglée et les modificateurs de poursuite y sont ajoutés (utile pour SWADE Tools, dont l'API
 * n'accepte pas de modificateurs).
 * @param {{multiAction?:number, mods?:{label:string,value:number}[]}} o
 */
export function armRollDialog({ multiAction = 1, mods = [] } = {}, { timeout = 120000 } = {}) {
  disarm();
  if (!(multiAction > 1) && !mods.length) return;
  const handler = (app, html) => {
    const name = app?.constructor?.name ?? "";
    if (!isRollDialog(name)) return;
    disarm();   // avant tout : les ajouts redessinent la fenêtre et relanceraient ce hook
    const rootOf = () => (app.element instanceof HTMLElement ? app.element : (html instanceof HTMLElement ? html : html?.[0]));
    (async () => {
      if (multiAction > 1) {
        const field = findMultiActionField(rootOf());
        if (!field?.set(multiAction)) {
          ui.notifications.warn(`Pensez à régler « actions multiples » sur ${multiAction} (${MULTI[multiAction]}) dans la fenêtre de jet.`);
        }
      }
      if (mods.length && !(await injectModifiers(rootOf, mods))) {
        ui.notifications.warn("Ajoutez les modificateurs de poursuite à la main dans la fenêtre de jet (voir le message privé).");
        console.warn("swade-chase | ligne « Ajout » introuvable dans", name);
      }
    })();
  };
  const ids = ["renderRollDialog", "renderApplicationV2", "renderApplication"].map((h) => [h, Hooks.on(h, handler)]);
  const timer = setTimeout(disarm, timeout);
  timer.unref?.();   // Node (tests) : ne retient pas le processus
  pending = { ids, timer };
}

/** Compatibilité : seulement l'option « actions multiples ». */
export function armMultiAction(n, options) {
  return armRollDialog({ multiAction: n }, options);
}

export function disarm() {
  if (!pending) return;
  for (const [h, id] of pending.ids) Hooks.off(h, id);
  clearTimeout(pending.timer);
  pending = null;
}
