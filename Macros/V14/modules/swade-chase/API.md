# API de swade-chase

Version de l'API : **1** (`api.version`). Module : `swade-chase` 0.4.7.

```js
const api = game.modules.get("swade-chase")?.api;
// ou
Hooks.once("swade-chase.ready", (api) => { /* … */ });
```

| Fonction | Effet / renvoie |
|---|---|
| `open()` | ouvre le panneau de poursuite |
| `start(combat = game.combat)` | démarre la poursuite (MJ) et ouvre le panneau chez tous |
| `end(combat = game.combat)` | termine la poursuite (le combat continue) |
| `readTrack(scene)` | cartes de poursuite de la scène, ordonnées : `{ id, suit, value, x, y, w, h, cx, cy, index }` |
| `view(combat)` | `{ chase, track, round, units }` ; `units` : `Map` combatantId → `{ combatant, unit, loc, actionCard, side }` |
| `actions(combatantId, combat)` | actions possibles de l'unité (voir `rules/maneuvers.js`) |
| `rules` | règles pures : `cards`, `complication`, `maneuvers`, `track` |

## Données

- `combat.flags["swade-chase"].chase` : `{ active, type, interval, cityStreets, rooftops }`
- `combat.flags["swade-chase"].units[combatantId]` : `{ mode, status, npcCrew, marks, complicationRound, offTrackAck, turn, boardedBy, mountTokenId, complication }` ; `complication` = `{ round, suit, state, suggested, result }` ; `turn` = `{ round, planned, free, standard, exclusive }`
- `ChatMessage.flags["swade-chase"].complication` : état d'une Complication.

Toutes les écritures passent par le MJ actif (socket du module).
