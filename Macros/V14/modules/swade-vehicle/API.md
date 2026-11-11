# API de swade-vehicle

Version de l'API : **1** (`api.version`). Module : `swade-vehicle` 0.4.1 et suivantes (`getShield` : 0.4.2 ; `getPower`, `energyBased` : 0.4.3 ; `setWounds`, `hasJoker`, `wrecked` : 0.4.4).

```js
const api = game.modules.get("swade-vehicle")?.api;
// ou, pour une macro chargée au démarrage :
Hooks.once("swade-vehicle.ready", (api) => { /* … */ });
```

## Conventions

- Chaque fonction accepte **un acteur véhicule, un jeton (Token ou TokenDocument) ou un UUID**. Si la référence n'est pas un véhicule, la fonction renvoie `null`, `0` ou `[]` selon son type de retour.
- Les valeurs « actuelles » incluent les effets actifs (Dégradations critiques) tels que le système les calcule.
- Les fonctions de lecture n'écrivent rien. Les fonctions de la section **Actions** écrivent sur le véhicule : elles exigent le MJ ou un propriétaire du véhicule.
- Les noms d'armes sont renvoyés sans le suffixe « (Classe V) » ; la Classe est toujours calculée, jamais lue dans le nom.

## Identification et équipage

| Fonction | Renvoie |
|---|---|
| `isVehicle(ref)` | `true` si `ref` désigne un acteur de type `vehicle` |
| `getVehicle(ref)` | l'acteur véhicule, ou `null` |
| `getPostes(ref)` | tableau de postes (voir ci-dessous) |
| `getCrew(ref)` | `[{ uuid, role, actor, weapons }]` d'après `system.crew.members` (rôles natifs `operator`, `gunner`, `other`) |
| `getPilot(ref)` | l'acteur occupant le premier poste Pilote ; à défaut, le premier membre natif de rôle `operator` ; sinon `null` |
| `getManeuverSkill(ref)` | `{ key, label }` (ex. `{ key: "Piloting", label: "Pilotage" }`), ou `null` si non définie |

Un poste renvoyé par `getPostes` :

```js
{
  id, label,
  type,          // "pilote" | "artilleur" | "autre"
  role,          // rôle natif correspondant : "operator" | "gunner" | "other"
  skill,         // compétence du poste (celle du véhicule pour un pilote), ou null
  occupantUuid, occupant,   // UUID et acteur (null si vacant ou introuvable)
  weapons, mods,            // objets du véhicule rattachés au poste
  supports,      // [{ id, label, count, die, mod, skill, actor, actorUuid }] — actor : Actor ou null
                 //   skill : compétence saisie, ou celle du poste par défaut
  support,       // premier soutien (compatibilité) ou null
  supportBonus   // bonus cumulé des soutiens en attente (somme, plafonnée à +4 ; peut être négatif)
}
```

## Caractéristiques actuelles

| Fonction | Renvoie |
|---|---|
| `getCurrentHandling(ref)` | Maniabilité actuelle (base + Dégradations critiques) |
| `getWoundPenalty(ref)` | malus de Blessures du véhicule : −1 par Blessure non ignorée, −3 au plus |
| `getManeuverModifiers(ref)` | `[{ label, value }]` à passer à un jet de manœuvre (Maniabilité, Blessures ; les valeurs nulles sont omises) |
| `getTopSpeed(ref)` | `{ value, unit }` (Vitesse actuelle, Dégradations comprises) |
| `getToughness(ref)` | `{ total, armor }` |
| `getWounds(ref)` | `{ value, max, ignored, wrecked }` ; `value` peut valoir max + 1 (véhicule détruit) |
| `hasJoker(ref)` | `true` si le véhicule a tiré un Joker dans un combat en cours (+2 pour son pilote) |
| `getEnergy(ref)` | `{ enabled, value, max }` |
| `getStatus(ref)` | copie de `system.status` (`isOutOfControl`, `isWrecked`, `isDistracted`, `isVulnerable`) |
| `getShield(ref)` | `{ key, value, max }` du bouclier (stat additionnelle `shield`), ou `null` si le véhicule n'en a pas ; max = moitié des Blessures de base d'après la Taille |
| `getPower(ref)` | gestion de l'énergie : `{ state, label, mods, systems }` ; `mods` = `{ handling, soak, weaponDamage, weaponWounds }` à appliquer (Maniabilité déjà incluse dans `getCurrentHandling`) |
| `getCriticals(ref)` | `{ handling, speed, destroyed }` : nombre de Dégradations de guidage et de propulsion, identifiants des armes détruites |

## Classes et armement

| Fonction | Renvoie |
|---|---|
| `getClasse(ref)` | Classe du véhicule (forcée, sinon calculée d'après la Résistance totale), ex. `"IV"` |
| `getWeapons(ref, { includeDestroyed = false })` | armes véhiculaires (voir ci-dessous) ; les armes détruites sont exclues par défaut |
| `getWeaponClasse(item)` | Classe d'une arme (forcée, sinon calculée), ou `null` si ce n'est pas une arme lourde |
| `computeVehicleClasse(actor)` / `computeWeaponClasse(item)` | calcul brut, sans tenir compte d'une Classe forcée |

Une arme renvoyée par `getWeapons` :

```js
{
  item, id, name,
  classe,        // "I" à "VII", ou null
  classeValue,   // moyenne des dés + PA, arrondie au supérieur (bonus fixes ignorés)
  isHeavy,       // Arme lourde
  fixed,         // arme fixe (case de l'onglet Conception)
  energyBased,   // arme à énergie (concernée par la gestion de l'énergie)
  warhead,       // ogive : "", "ap", "emp", "he", "nuclear", "phase", "plasma"
  destroyed,
  postes,        // [{ id, label }] des postes auxquels l'arme est rattachée
  operator       // acteur qui la sert : occupant d'un de ces postes, sinon membre natif affecté, sinon null
}
```

## Heavy Metal

| Fonction | Renvoie |
|---|---|
| `isHeavyMetal(ref)` | `true` si le véhicule est engagé dans un combat marqué Heavy Metal |
| `getHeavyMetalCombat(ref)` | ce combat, ou `null` |
| `resolveHeavyMetal({ weaponClass, targetClass, raise, warhead, targetArmor, d3 })` | `{ noEffect, wounds, maneuver, extraCritical, electronicsOut, steps, weaponClass, targetClass }` |
| `WARHEADS` | clés et libellés des ogives |

`resolveHeavyMetal` est un calcul pur : il ne lance rien (sauf le d3 si `d3` n'est pas fourni) et n'écrit rien.

## Actions

| Fonction | Effet |
|---|---|
| `rollManeuver(ref, { mods = [] })` | jet de manœuvre du pilote via le `rollSkill` natif, avec `getManeuverModifiers` plus `mods` |
| `applyOutOfControl(ref)` | tire sur la table de Perte de contrôle et applique ses effets ; renvoie le total du 2d6 |
| `applyCritical(ref, { collision, rerollCrew })` | tire une Dégradation critique et applique ses effets ; renvoie le total du 2d6 |
| `setWounds(ref, valeur, motif)` | fixe les Blessures ; au-delà du maximum, le véhicule devient une Épave (message dans le chat) |
| `appendJournal(ref, texte | [textes])` | ajoute des entrées au journal du véhicule |

## Exemple

```js
const api = game.modules.get("swade-vehicle").api;
const ship = canvas.tokens.controlled[0];
console.log(api.getPilot(ship)?.name, api.getCurrentHandling(ship), api.getClasse(ship));
for (const w of api.getWeapons(ship)) console.log(w.name, w.classe, w.fixed ? "fixe" : "", w.operator?.name);
await api.rollManeuver(ship, { mods: [{ label: "Terrain difficile", value: -2 }] });
```
