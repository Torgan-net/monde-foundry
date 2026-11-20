# API de swade-tweaks

Version de l'API : **1** (`api.version`). Module : `swade-tweaks` 1.1.0 et suivantes.

```js
const api = game.modules.get("swade-tweaks")?.api;
// ou
Hooks.once("swade-tweaks.ready", (api) => { /* … */ });
```

## Lecture

| Fonction | Renvoie |
|---|---|
| `getLeader(group)` | le combattant meneur d'un groupe (`system.leader`), ou `null` |
| `groupOf(combatant)` | le groupe d'un combattant, ou `null` |
| `canSetActive(combatant)` | `true` si l'utilisateur est MJ, le combat lancé et le combattant pas déjà actif (1.2.0) |

## Actions

Seul le MJ actif écrit ; sur un autre client, ces fonctions ne font rien.

| Fonction | Effet |
|---|---|
| `syncGroup(group)` | met le nom (« Groupe de X » / « Groupe d'X ») et l'image du groupe en accord avec son meneur ; un nom saisi à la main est conservé |
| `syncAllGroups()` | `syncGroup` sur tous les groupes de tous les combats |
| `setActiveCombatant(combatant)` | place le curseur sur ce combattant, ou sur son meneur s'il n'a pas de tour propre ; MJ uniquement ; renvoie `true` si le curseur a bougé (1.2.0) |

## Règles pures (`api.rules`)

| Fonction | Renvoie |
|---|---|
| `groupLabel(nom)` | `"Groupe de Brann"`, `"Groupe d'Elharn"` ; pas d'élision devant h ; `null` si nom vide |
| `isAutoName(nom)` | `true` pour un libellé automatique (défaut SWADE ou généré) |
| `computeGroupUpdates(groupe, meneur, iconeParDefaut)` | `{ name?, img? }` à écrire ; `meneur` = `{ name, images: [...] }` ou `null` |
| `computeTurnChange(idsOrdonnes, tourActuel, idCible, idRepli?)` | `{ turn, direction }` à appliquer, ou `null` si rien à changer (1.2.0) |
| `computePaletteShift({ rect, viewport, rightLimit?, margin?, topMargin? })` | `{ dx, dy }` en px écran pour garder le panneau des états à l'écran (1.3.0) |

## Écritures

Les écritures du module passent l'option d'update `"swade-tweaks.write": true` ; ses propres hooks les ignorent.

## Réglages d'affichage (1.3.0)

Réglages **client** (chaque joueur choisit), cochés par défaut. Chaque correction CSS pose une classe sur `<body>`.

| Clé | Classe sur `<body>` | Condition |
|---|---|---|
| `fixMldHeight` | `swade-tweaks--mld-height` | Monk's Little Details actif |
| `fixMldNames` | `swade-tweaks--mld-names` | Monk's Little Details actif |
| `fixMldHighlight` | `swade-tweaks--mld-highlight` | Monk's Little Details actif |
| `fixStatusColors` | `swade-tweaks--status-colors` | — |
| `fixTrackerOpacity` | `swade-tweaks--tracker-opacity` | — |
| `fixPaletteClamp` | (aucune : recalage en JS) | — |

Le recalage n'écrit que la propriété CSS `translate` du panneau des états ; aucune donnée de monde n'est modifiée.
