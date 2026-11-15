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

## Actions

Seul le MJ actif écrit ; sur un autre client, ces fonctions ne font rien.

| Fonction | Effet |
|---|---|
| `syncGroup(group)` | met le nom (« Groupe de X » / « Groupe d'X ») et l'image du groupe en accord avec son meneur ; un nom saisi à la main est conservé |
| `syncAllGroups()` | `syncGroup` sur tous les groupes de tous les combats |

## Règles pures (`api.rules`)

| Fonction | Renvoie |
|---|---|
| `groupLabel(nom)` | `"Groupe de Brann"`, `"Groupe d'Elharn"` ; pas d'élision devant h ; `null` si nom vide |
| `isAutoName(nom)` | `true` pour un libellé automatique (défaut SWADE ou généré) |
| `computeGroupUpdates(groupe, meneur, iconeParDefaut)` | `{ name?, img? }` à écrire ; `meneur` = `{ name, images: [...] }` ou `null` |

## Écritures

Les écritures du module passent l'option d'update `"swade-tweaks.write": true` ; ses propres hooks les ignorent.
