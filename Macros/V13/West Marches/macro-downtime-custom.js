// ============================================================
// Temps libre (Downtime) — Terres Vestiges / Ferremont
// Version : 0.11
// Foundry VTT v14 · système SWADE
// Macro autonome : n'appelle plus l'API du module Fantasy Companion.
// ============================================================

const VERSION = '0.11';

// Monnaie de la campagne
const MONNAIE = { nom: 'Silver Coin', symbole: '$' };
const argent = (v) => `${v} ${MONNAIE.symbole}`;
const { DialogV2 } = foundry.applications.api;

// ---------- Réglages (validés par le MJ) ----------
const REGLES = {
  REPOS_JET_EN_PLUS: true,               // Se reposer : jet de guérison sans attendre les 5 jours, en plus du jet automatique
  REPOS_SANS_BLESSURE_CONVICTION: false, // règle FC : repos sans Blessure = Se ressourcer
  TRAVAIL_PROUESSE_DOUBLE: true,         // règle FC : gains doublés sur Prouesse
  ARCANES_MALUS_LANCEMENT: -2,           // règle FC : pouvoir étudié lancé à −2
  STYLE_DE_VIE_SUR_GUERISON: true,       // le modificateur de style de vie s'applique aussi à la guérison automatique
  APPLIQUER_REPORTS_SUR_FICHE: true,     // Fatigue/Blessures « au début de la prochaine aventure » appliquées sur la fiche
};

// Styles de vie (additional stat « lifestyle ») : Standard = 0, −1 / +1 par cran, plafonné à +4
const STYLES_DE_VIE = ['À la rue', 'Pauvre', 'Standard', 'Confortable', 'Aisée', 'Luxueux', 'Super luxueux'];
const IDX_STANDARD = STYLES_DE_VIE.indexOf('Standard');
const modStyle = (idx) => Math.min(4, idx - IDX_STANDARD);
const fmtMod = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

// Socialiser : majoration du coût selon le style de vie (cumulative, base = Standard)
// À la rue +50 %, Pauvre +25 %, Standard 0, Confortable +10 %, Aisée +20 %, Luxueux +120 %, Super luxueux +220 %
const MAJORATION_SOCIALISER = [50, 25, 0, 10, 20, 120, 220];
const arrondi5 = (v) => Math.round(v / 5) * 5;
const coutSocialiser = (rangIdx, styleIdx) =>
  arrondi5(RANGS[rangIdx].socialiser * (1 + MAJORATION_SOCIALISER[styleIdx] / 100));

const RANGS = [
  { label: 'Novice',     socialiser: 50,  travail: 100 },
  { label: 'Aguerri',    socialiser: 100, travail: 200 },
  { label: 'Vétéran',    socialiser: 200, travail: 300 },
  { label: 'Héroïque',   socialiser: 400, travail: 400 },
  { label: 'Légendaire', socialiser: 800, travail: 500 },
];

const ACTIVITES = [
  { id: 'socialiser', label: 'Socialiser' },
  { id: 'ressourcer', label: 'Se ressourcer' },
  { id: 'reposer',    label: 'Se reposer' },
  { id: 'travailler', label: 'Travailler' },
  { id: 'arcanes',    label: 'Recherche — Arcanes' },
  { id: 'infos',      label: 'Recherche — Informations' },
  { id: 'entrainer',  label: "S'entraîner" },
];

const ATTRIBUTS = [
  ['agility', 'Agilité'], ['smarts', 'Intellect'], ['spirit', 'Âme'],
  ['strength', 'Force'], ['vigor', 'Vigueur'],
];

// Référentiel VF officiel des Compétences SWADE (même table que l'export statblock)
const SKILL_TRANSLATION_FR = {
  athletics: 'Athlétisme', fighting: 'Combat', driving: 'Conduite',
  'common knowledge': 'Culture générale', stealth: 'Discrétion', academics: 'Éducation',
  electronics: 'Électronique', riding: 'Équitation', focus: 'Focus', faith: 'Foi',
  hacking: 'Informatique', intimidation: 'Intimidation', gambling: 'Jeu', language: 'Langue',
  spellcasting: 'Magie', boating: 'Navigation', occult: 'Occultisme', notice: 'Perception',
  performance: 'Performance', persuasion: 'Persuasion', piloting: 'Pilotage', taunt: 'Provocation',
  psionics: 'Psioniques', research: 'Recherche', repair: 'Réparation',
  'weird science': 'Science étrange', science: 'Sciences', healing: 'Soins',
  battle: 'Stratégie', thievery: 'Subterfuge', survival: 'Survie', shooting: 'Tir',
};

const RESULTATS = {
  critique: 'Échec critique', echec: 'Échec', succes: 'Succès', prouesse: 'Prouesse',
};

// ---------- Contrôles ----------
if (!actor) {
  ui.notifications.warn('Sélectionne un personnage (token ou personnage assigné).');
  return;
}
if (!actor.isOwner) {
  ui.notifications.warn(`Tu n'as pas les droits sur ${actor.name}.`);
  return;
}

// ---------- Utilitaires ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const speaker = ChatMessage.getSpeaker({ actor });

// Lignes du journal : effet favorable, défavorable ou simple précision
const L = {
  plus: (t) => ({ t, k: 'plus' }),
  moins: (t) => ({ t, k: 'moins' }),
  info: (t) => ({ t, k: 'info' }),
};

// Traduit le nom d'une Compétence ; une spécialité entre parenthèses est conservée
function nomCompetence(item) {
  const nom = String(item?.name ?? '').trim();
  const m = nom.match(/^([^(]+?)\s*(\(.*\))?$/);
  const base = (m?.[1] ?? nom).toLowerCase();
  const fr = SKILL_TRANSLATION_FR[base]
    ?? SKILL_TRANSLATION_FR[String(item?.system?.swid ?? '').replace(/-/g, ' ')];
  return fr ? `${fr}${m?.[2] ? ` ${m[2]}` : ''}` : nom;
}

const competences = actor.items
  .filter((i) => i.type === 'skill')
  .sort((a, b) => nomCompetence(a).localeCompare(nomCompetence(b), 'fr'));

function libelleTrait(ref) {
  const [type, key] = String(ref).split(':');
  if (type === 'skill') return actor.items.get(key) ? nomCompetence(actor.items.get(key)) : '?';
  if (type === 'attr') return ATTRIBUTS.find(([k]) => k === key)?.[1] ?? key;
  return 'Jet sans compétence';
}

function optionsTraits() {
  const comp = competences
    .map((s) => `<option value="skill:${s.id}">${esc(nomCompetence(s))} (d${s.system?.die?.sides ?? '?'})</option>`)
    .join('');
  const attr = ATTRIBUTS.map(([k, l]) => `<option value="attr:${k}">${l}</option>`).join('');
  return `<optgroup label="Compétences">${comp}</optgroup><optgroup label="Attributs">${attr}</optgroup>`;
}

function devinerRang() {
  const adv = actor.system?.advances;
  let n = null;
  if (adv?.mode !== 'legacy') {
    const list = adv?.list;
    n = list?.size ?? (Array.isArray(list) ? list.length : null);
  }
  if (n == null) n = num(adv?.value);
  return Math.min(4, Math.floor(n / 4));
}

function aUneArcane() {
  return actor.items.some((i) => i.type === 'power')
    || actor.items.some((i) => i.type === 'edge' && i.system?.isArcaneBackground);
}

function competenceRecherche() {
  return competences.find((s) => s.system?.swid === 'research')
    ?? competences.find((s) => /^(research|recherche)$/i.test(s.name.trim()));
}

// Jet natif SWADE (Jetons, dé Joker, malus de Blessure/Fatigue conservés)
async function lancer(ref, mods, titre) {
  const [type, key] = String(ref).split(':');
  const opts = { additionalMods: mods, flavour: titre, title: titre };
  try {
    if (type === 'skill') return await actor.rollSkill(key, opts);
    if (type === 'attr') return await actor.rollAttribute(key, opts);
    if (type === 'unskilled' && actor.makeUnskilledAttempt) return await actor.makeUnskilledAttempt(opts);
  } catch (e) {
    console.error('Temps libre | erreur de jet', e);
  }
  return null;
}

function deviner(roll) {
  if (!roll) return 'echec';
  if (roll.isCritfail) return 'critique';
  const s = Number(roll.successes);
  if (Number.isFinite(s)) return s >= 2 ? 'prouesse' : s === 1 ? 'succes' : s < 0 ? 'critique' : 'echec';
  const t = Number(roll.total);
  if (!Number.isFinite(t)) return 'echec';
  return t >= 8 ? 'prouesse' : t >= 4 ? 'succes' : 'echec';
}

// Confirmation du résultat, pour tenir compte des relances faites dans le chat
async function confirmer(titre, roll) {
  const g = deviner(roll);
  const opts = Object.entries(RESULTATS)
    .map(([k, l]) => `<option value="${k}" ${k === g ? 'selected' : ''}>${l}</option>`)
    .join('');
  const r = await DialogV2.wait({
    window: { title: `Résultat — ${titre}` },
    position: { width: 320 },
    content: `<p>Résultat retenu, après d'éventuelles relances :</p><select name="res">${opts}</select>`,
    buttons: [{ action: 'ok', label: 'Valider', default: true, callback: (e, b) => b.form.elements.res.value }],
    rejectClose: false,
  });
  return r ?? g;
}

async function choisirNombre(titre, texte, max, defaut) {
  const opts = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}" ${i === defaut ? 'selected' : ''}>${i}</option>`).join('');
  const r = await DialogV2.wait({
    window: { title: titre },
    position: { width: 320 },
    content: `<p>${texte}</p><select name="n">${opts}</select>`,
    buttons: [{ action: 'ok', label: 'Valider', default: true, callback: (e, b) => Number(b.form.elements.n.value) }],
    rejectClose: false,
  });
  return r ?? defaut;
}

async function lancerDe(formule, flavor) {
  const r = await new Roll(formule).evaluate();
  await r.toMessage({ speaker, flavor });
  return r.total;
}

// ---------- Modifications de fiche ----------
async function modifierFatigue(delta, notes) {
  const max = num(actor.system?.fatigue?.max, 2);
  const v = num(actor.system?.fatigue?.value);
  const nv = Math.max(0, Math.min(max, v + delta));
  await actor.update({ 'system.fatigue.value': nv });
  if (v + delta > max) notes.push('⚠ Fatigue au-delà du maximum : le personnage est Incapacité.');
}

async function modifierBlessures(delta, notes) {
  const max = num(actor.system?.wounds?.max, 3);
  const v = num(actor.system?.wounds?.value);
  const nv = Math.max(0, Math.min(max, v + delta));
  await actor.update({ 'system.wounds.value': nv });
  if (v + delta > max) notes.push('⚠ Blessures au-delà du maximum : le personnage est Incapacité.');
  return nv;
}

async function modifierArgent(delta) {
  const v = num(actor.system?.details?.currency);
  await actor.update({ 'system.details.currency': v + delta });
}

async function ajouterConviction() {
  const v = num(actor.system?.details?.conviction?.value);
  await actor.update({ 'system.details.conviction.value': v + 1 });
}

// Guérison naturelle : Succès = −1 Blessure, Prouesse = −2, Échec critique = +1
async function guerison(titre, mods, notes) {
  const w = num(actor.system?.wounds?.value);
  if (w <= 0) return { res: null, lignes: [L.info('Aucune Blessure à soigner.')] };
  const roll = await lancer('attr:vigor', mods, titre);
  const res = await confirmer(titre, roll);
  const delta = { prouesse: -2, succes: -1, echec: 0, critique: 1 }[res];
  const nv = await modifierBlessures(delta, notes);
  const soignees = w - nv;
  let ligne;
  if (soignees > 0) ligne = L.plus(`${soignees} Blessure(s) soignée(s) (${w} → ${nv})`);
  else if (nv > w) ligne = L.moins(`+1 Blessure (${w} → ${nv})`);
  else ligne = L.info(`Aucune Blessure soignée (${w})`);
  return { res, lignes: [ligne] };
}

// Encaissement avec des Jetons de la prochaine aventure (on garde le meilleur résultat)
async function encaisser(nb) {
  let meilleur = 0;
  let jetons = 0;
  while (meilleur < nb) {
    const ok = await DialogV2.confirm({
      window: { title: 'Encaissement' },
      content: `<p>${nb} Blessure(s) à subir${jetons ? ` ; meilleur encaissement jusqu'ici : ${meilleur}` : ''}.</p>
                <p>Dépenser un Jeton de la prochaine aventure pour tenter d'encaisser ?</p>`,
      rejectClose: false,
    });
    if (!ok) break;
    jetons++;
    const roll = await lancer('attr:vigor', [], 'Encaissement (temps libre)');
    const devine = Math.max(0, Math.min(nb, num(roll?.successes)));
    const n = await choisirNombre('Encaissement', 'Blessures encaissées par ce jet (succès + prouesses) :', nb, devine);
    meilleur = Math.max(meilleur, n);
  }
  return { restantes: nb - meilleur, jetons };
}

// ---------- Dialogue principal ----------
const rangDefaut = devinerRang();
const styleFiche = actor.system?.additionalStats?.lifestyle?.value;
let styleDefaut = STYLES_DE_VIE.findIndex((x) => x.toLowerCase() === String(styleFiche ?? '').trim().toLowerCase());
if (styleDefaut === -1) styleDefaut = IDX_STANDARD;
const arcane = aUneArcane();
const fonds = num(actor.system?.details?.currency);
const entrainementPrecedent = actor.getFlag('world', 'tlEntrainement');

const details = {
  reposer: `<label>Bonus de Soutien <input type="number" name="repos_soutien" value="0" min="0" max="4" style="width:4em"></label>`,
  travailler: `<select name="travail_trait">${optionsTraits()}</select>
               <label><input type="checkbox" name="travail_danger"> Activité dangereuse</label>`,
  arcanes: `<input type="text" name="arcanes_cible" placeholder="Pouvoir ou Aspect visé">`,
  infos: `<input type="text" name="infos_sujet" placeholder="Sujet de la recherche">`,
  entrainer: `<select name="entrainer_trait">${optionsTraits()}</select>
              ${entrainementPrecedent ? `<p class="hint">Remplace l'entraînement actuel : ${esc(entrainementPrecedent)}.</p>` : ''}`,
};

const lignesActivites = ACTIVITES.map((a) => {
  const desactive = a.id === 'arcanes' && !arcane;
  return `<div class="tl-act">
    <label><input type="radio" name="activite" value="${a.id}" data-act="${a.id}" ${desactive ? 'disabled' : ''}>
      ${a.label}${desactive ? ' <em>(aucune Arcane)</em>' : ''}</label>
    ${a.id === 'socialiser' ? '<div class="tl-det" data-cout-social style="font-size:12px;"></div>' : ''}
    ${details[a.id] ? `<div class="tl-det" data-details="${a.id}" style="display:none">${details[a.id]}</div>` : ''}
  </div>`;
}).join('');

const contenu = `
<style>
  .tl-act { margin: 2px 0; }
  .tl-det { margin: 2px 0 6px 1.6em; display: flex; flex-direction: column; gap: 3px; }
</style>
<div class="form-group"><label>Rang</label>
  <select name="rang">${RANGS.map((r, i) => `<option value="${i}" ${i === rangDefaut ? 'selected' : ''}>${r.label}</option>`).join('')}</select>
</div>
<div class="form-group"><label>Style de vie</label>
  <select name="style">${STYLES_DE_VIE.map((x, i) => `<option value="${i}" ${i === styleDefaut ? 'selected' : ''}>${x} (${fmtMod(modStyle(i))})</option>`).join('')}</select>
</div>
${styleFiche === undefined ? '<p class="hint">Pas de style de vie sur la fiche : Standard par défaut.</p>' : ''}
<p>Fonds : ${argent(fonds)} (${MONNAIE.nom})</p>
<h4>Activité</h4>
${lignesActivites}`;

const choix = await DialogV2.wait({
  window: { title: `Temps libre — ${actor.name} (v${VERSION})` },
  position: { width: 420 },
  content: contenu,
  buttons: [
    { action: 'ok', label: 'Lancer le temps libre', default: true, callback: (e, b) => Object.fromEntries(new FormData(b.form).entries()) },
    { action: 'annuler', label: 'Annuler' },
  ],
  render: (ev, arg) => {
    const root = arg instanceof HTMLElement ? arg : (arg?.element ?? arg);
    const cases = [...root.querySelectorAll('input[data-act]')];
    // Coût de Socialiser recalculé en direct ; activité interdite si les fonds ne suffisent pas
    const majCout = () => {
      const span = root.querySelector('[data-cout-social]');
      const radio = root.querySelector('input[data-act="socialiser"]');
      const r = num(root.querySelector('[name="rang"]')?.value, rangDefaut);
      const st = num(root.querySelector('[name="style"]')?.value, styleDefaut);
      const c = coutSocialiser(r, st);
      const maj = MAJORATION_SOCIALISER[st];
      const possible = c <= fonds;
      if (radio) {
        radio.disabled = !possible;
        if (!possible && radio.checked) {
          radio.checked = false;
          root.querySelectorAll('[data-details]').forEach((d) => { d.style.display = 'none'; });
        }
      }
      if (span) {
        span.style.color = possible ? '' : '#b71c1c';
        span.textContent = `Coût : ${argent(c)} (${RANGS[r].label}${maj ? `, style de vie +${maj} %` : ''})`
          + (possible ? '' : ` — fonds insuffisants (${argent(fonds)})`);
      }
    };
    root.querySelector('[name="rang"]')?.addEventListener('change', majCout);
    root.querySelector('[name="style"]')?.addEventListener('change', majCout);
    majCout();
    const actualiser = () => {
      for (const c of cases) {
        const d = root.querySelector(`[data-details="${c.dataset.act}"]`);
        if (d) d.style.display = c.checked ? '' : 'none';
      }
    };
    cases.forEach((c) => c.addEventListener('change', actualiser));
    actualiser();
  },
  rejectClose: false,
});

if (!choix || typeof choix !== 'object') return;

// ---------- Préparation ----------
const activite = ACTIVITES.find((a) => a.id === choix.activite)?.id;
if (!activite) {
  ui.notifications.warn('Choisis une activité.');
  return;
}
const choisies = [activite];
const rangIdx = Math.max(0, Math.min(RANGS.length - 1, num(choix.rang, rangDefaut)));
const rang = RANGS[rangIdx];
const styleIdx = Math.max(0, Math.min(STYLES_DE_VIE.length - 1, num(choix.style, styleDefaut)));
const style = STYLES_DE_VIE[styleIdx];
const bonusStyle = modStyle(styleIdx);
const modVie = () => (bonusStyle ? [{ label: `Style de vie (${style})`, value: bonusStyle }] : []);
const modsActivite = (extra = []) => [...modVie(), ...extra];
const modsAuto = () => (REGLES.STYLE_DE_VIE_SUR_GUERISON ? modVie() : []);

const coutSocial = coutSocialiser(rangIdx, styleIdx);
// Validation des dépenses : fonds relus sur la fiche, activité interdite s'ils ne suffisent pas
if (activite === 'socialiser') {
  const dispo = num(actor.system?.details?.currency);
  if (coutSocial > dispo) {
    ui.notifications.error(`Socialiser impossible : ${argent(coutSocial)} nécessaires, ${argent(dispo)} disponibles.`);
    return;
  }
  const ok = await DialogV2.confirm({
    window: { title: 'Confirmer la dépense' },
    content: `<p>Socialiser coûte <strong>${argent(coutSocial)}</strong>.</p>
              <p>Fonds : ${argent(dispo)} → <strong>${argent(dispo - coutSocial)}</strong></p>`,
    rejectClose: false,
  });
  if (!ok) {
    ui.notifications.info('Temps libre annulé, aucune dépense effectuée.');
    return;
  }
}

const sections = [];   // { titre, lignes[] }
const alertes = [];
let fatigueReportee = 0;
let blessuresReportees = 0;
let jetonsBonus = 0;
let jetonsDepenses = 0;

const depart = {
  pa: num(actor.system?.details?.currency),
  conviction: num(actor.system?.details?.conviction?.value),
  fatigue: num(actor.system?.fatigue?.value),
  blessures: num(actor.system?.wounds?.value),
};

// ---------- Activités optionnelles ----------
for (const id of choisies) {
  const s = { titre: ACTIVITES.find((a) => a.id === id).label, res: null, lignes: [] };
  const l = s.lignes;
  switch (id) {
    case 'socialiser': {
      await modifierArgent(-coutSocial);
      const maj = MAJORATION_SOCIALISER[styleIdx];
      l.push(L.moins(`−${argent(coutSocial)} (${rang.label}${maj ? `, style de vie ${style} +${maj} %` : ''})`));
      l.push(L.plus('Faveur locale à Ferremont, utilisable à tout moment'));
      l.push(L.info('Son importance dépend du Rang et du statut du personnage.'));
      break;
    }
    case 'ressourcer': {
      await ajouterConviction();
      l.push(L.plus('+1 Conviction'));
      break;
    }
    case 'reposer': {
      const soutien = num(choix.repos_soutien);
      const extra = soutien ? [{ label: 'Soutien', value: soutien }] : [];
      const g = await guerison('Se reposer — guérison', modsActivite(extra), alertes);
      s.res = g.res;
      l.push(...g.lignes);
      if (soutien) l.push(L.info(`Soutien : +${soutien}`));
      if (REGLES.REPOS_SANS_BLESSURE_CONVICTION && num(actor.system?.wounds?.value) === 0) {
        await ajouterConviction();
        l.push(L.plus('+1 Conviction (repos sans Blessure)'));
      }
      jetonsBonus += 1;
      l.push(L.plus('+1 Jeton pour la prochaine aventure'));
      break;
    }
    case 'travailler': {
      const ref = choix.travail_trait;
      const danger = Boolean(choix.travail_danger);
      const titre = `Travailler (${libelleTrait(ref)})`;
      const roll = await lancer(ref, modsActivite(), titre);
      const res = await confirmer(titre, roll);
      s.res = res;
      s.titre = `Travailler — ${libelleTrait(ref)}`;
      if (res === 'succes' || res === 'prouesse') {
        const double = res === 'prouesse' && REGLES.TRAVAIL_PROUESSE_DOUBLE;
        const montant = rang.travail * (double ? 2 : 1);
        await modifierArgent(montant);
        l.push(L.plus(`+${argent(montant)}${double ? ' (doublé par la Prouesse)' : ''}`));
      } else if (res === 'echec') {
        l.push(L.moins('Aucun gain'));
        l.push(L.info("Le personnage s'embarrasse d'une manière ou d'une autre."));
      } else {
        l.push(L.moins('Aucun gain'));
        await modifierFatigue(1, alertes);
        l.push(L.moins('+1 Fatigue (surmenage)'));
        if (danger) {
          const b = await lancerDe('1d4', 'Travailler — Blessures (activité dangereuse)');
          await modifierBlessures(b, alertes);
          l.push(L.moins(`+${b} Blessure(s)`));
        }
      }
      if (danger) l.push(L.info('Activité dangereuse.'));
      break;
    }
    case 'arcanes': {
      const cible = (choix.arcanes_cible || '').trim() || 'un Pouvoir ou un Aspect de son Arcane';
      l.push(L.plus(`${esc(cible)} disponible pendant une rencontre`));
      if (REGLES.ARCANES_MALUS_LANCEMENT) l.push(L.info(`Lancé avec un malus de ${REGLES.ARCANES_MALUS_LANCEMENT}.`));
      l.push(L.info('Seulement si le personnage en remplit les prérequis.'));
      break;
    }
    case 'infos': {
      const sujet = (choix.infos_sujet || '').trim() || 'sujet non précisé';
      const comp = competenceRecherche();
      const ref = comp ? `skill:${comp.id}` : 'unskilled:';
      const titre = 'Recherche — Informations';
      const roll = await lancer(ref, modsActivite(), titre);
      const res = await confirmer(titre, roll);
      s.res = res;
      l.push(L.info(`Sujet : ${esc(sujet)}${comp ? '' : ' — jet sans compétence'}.`));
      if (res === 'prouesse') l.push(L.plus('Information trouvée sans trop de peine'));
      if (res === 'succes') {
        l.push(L.plus('Information trouvée'));
        l.push(L.moins('+1 Fatigue (recherche éprouvante)'));
        fatigueReportee++;
      }
      if (res === 'echec') {
        l.push(L.moins('Information non trouvée'));
        l.push(L.moins('+1 Fatigue (recherche éprouvante)'));
        fatigueReportee++;
      }
      if (res === 'critique') {
        const b = await lancerDe('1d4', 'Recherche — catastrophe (Blessures)');
        const { restantes, jetons } = await encaisser(b);
        jetonsDepenses += jetons;
        blessuresReportees += restantes;
        l.push(L.moins('Information non trouvée'));
        l.push(L.moins(`Catastrophe : ${b} Blessure(s)`));
        if (jetons) {
          l.push(L.plus(`${b - restantes} Blessure(s) encaissée(s)`));
          l.push(L.moins(`−${jetons} Jeton(s) pour la prochaine aventure`));
        }
        if (restantes) l.push(L.info(`${restantes} Blessure(s) non soignée(s) au départ de la prochaine aventure.`));
      } else {
        const d = await lancerDe('1d10', 'Recherche — trouvaille fortuite ?');
        if (d >= 9) l.push(L.plus(`d10 = ${d} : information cryptique sans rapport avec la recherche (au MJ)`));
        else l.push(L.info(`d10 = ${d} : pas de trouvaille fortuite.`));
      }
      break;
    }
    case 'entrainer': {
      const label = libelleTrait(choix.entrainer_trait);
      await actor.setFlag('world', 'tlEntrainement', label);
      s.titre = `S'entraîner — ${esc(label)}`;
      l.push(L.plus(`Relance gratuite en ${esc(label)}`));
      l.push(L.info('Pendant une rencontre au choix ; se cumule avec les autres relances.'));
      if (entrainementPrecedent && entrainementPrecedent !== label) l.push(L.moins(`Perd l'entraînement en ${esc(entrainementPrecedent)}`));
      break;
    }
  }
  sections.push(s);
}

// ---------- Activité automatique ----------
if (REGLES.REPOS_JET_EN_PLUS || !choisies.includes('reposer')) {
  const g = await guerison('Guérison naturelle', modsAuto(), alertes);
  sections.push({ titre: 'Guérison naturelle', res: g.res, lignes: g.lignes });
}

// ---------- Effets reportés ----------
if (REGLES.APPLIQUER_REPORTS_SUR_FICHE) {
  if (fatigueReportee) await modifierFatigue(fatigueReportee, alertes);
  if (blessuresReportees) await modifierBlessures(blessuresReportees, alertes);
}

// ---------- Bilan ----------
const fin = {
  pa: num(actor.system?.details?.currency),
  conviction: num(actor.system?.details?.conviction?.value),
  fatigue: num(actor.system?.fatigue?.value),
  blessures: num(actor.system?.wounds?.value),
};
const signe = (v) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);
const bilan = []; // { t, bon }
if (fin.pa !== depart.pa) bilan.push({ t: `${signe(fin.pa - depart.pa)} ${MONNAIE.symbole}`, bon: fin.pa > depart.pa });
if (fin.conviction !== depart.conviction) bilan.push({ t: `${signe(fin.conviction - depart.conviction)} Conviction`, bon: fin.conviction > depart.conviction });
if (fin.blessures !== depart.blessures) bilan.push({ t: `${signe(fin.blessures - depart.blessures)} Blessure(s)`, bon: fin.blessures < depart.blessures });
if (fin.fatigue !== depart.fatigue) bilan.push({ t: `${signe(fin.fatigue - depart.fatigue)} Fatigue`, bon: fin.fatigue < depart.fatigue });
const jetonsNet = jetonsBonus - jetonsDepenses;
if (jetonsNet) bilan.push({ t: `${signe(jetonsNet)} Jeton(s) à la prochaine aventure`, bon: jetonsNet > 0 });

// ---------- Résumé au chat ----------
const COUL = { prouesse: '#1b5e20', succes: '#2e7d32', echec: '#c25e00', critique: '#b71c1c' };
const VERT = '#1b5e20';
const ROUGE = '#b71c1c';
const NEUTRE = '#7a1f1f';

const badge = (res) => (res
  ? `<span style="float:right;margin-left:6px;background:${COUL[res]};color:#fff;border-radius:3px;padding:0 6px;font-size:11px;line-height:16px;font-weight:bold;text-transform:uppercase;">${RESULTATS[res]}</span>`
  : '');

const ligneHtml = ({ t, k }) => {
  if (k === 'plus') return `<div style="color:${VERT};font-weight:bold;">▲ ${t}</div>`;
  if (k === 'moins') return `<div style="color:${ROUGE};font-weight:bold;">▼ ${t}</div>`;
  return `<div style="color:#555;font-size:12px;font-style:italic;">${t}</div>`;
};

const bloc = (s) => `
  <div style="margin:5px 0;padding:4px 6px;border:1px solid rgba(0,0,0,0.15);border-left:4px solid ${COUL[s.res] ?? NEUTRE};border-radius:3px;background:rgba(0,0,0,0.04);">
    <div style="overflow:hidden;font-weight:bold;margin-bottom:2px;">${badge(s.res)}${s.titre}</div>
    ${s.lignes.map(ligneHtml).join('')}
  </div>`;

const pastille = ({ t, bon }) => `<span style="display:inline-block;margin:2px 3px 0 0;padding:1px 7px;border-radius:10px;background:${bon ? VERT : ROUGE};color:#fff;font-size:12px;font-weight:bold;">${t}</span>`;

let html = `<div style="border-bottom:2px solid ${NEUTRE};margin-bottom:4px;">
    <div style="font-size:15px;font-weight:bold;">Temps libre — ${esc(actor.name)}</div>
    <div style="font-size:12px;color:#555;">Style de vie ${style} (${fmtMod(bonusStyle)})</div>
  </div>`;

html += `<div style="margin:4px 0 6px;">
    <div style="font-size:12px;font-weight:bold;color:#555;text-transform:uppercase;">Bilan</div>
    ${bilan.length ? bilan.map(pastille).join('') : '<span style="font-size:12px;color:#555;">Aucun changement sur la fiche.</span>'}
    <div style="font-size:12px;color:#555;margin-top:3px;">État : Blessures ${fin.blessures}/${num(actor.system?.wounds?.max, 3)} · Fatigue ${fin.fatigue}/${num(actor.system?.fatigue?.max, 2)} · ${argent(fin.pa)}</div>
  </div>`;

html += sections.map(bloc).join('');

if (alertes.length) {
  html += `<div style="margin:5px 0;padding:4px 6px;border:1px solid ${ROUGE};border-radius:3px;background:rgba(183,28,28,0.08);color:${ROUGE};font-weight:bold;">
    ${alertes.map((a) => `<div>${a}</div>`).join('')}
  </div>`;
}

await ChatMessage.create({ speaker, content: html });