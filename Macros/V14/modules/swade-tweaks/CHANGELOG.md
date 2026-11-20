# Changelog

## 1.3.0

### Ajouté
- Corrections d'affichage des icônes d'état, chacune activable **par joueur** (réglages client, cochés par défaut) :
  - **Avec Monk's Little Details** (réglages masqués si le module est inactif) :
    - HUD des états : cadre à la hauteur du contenu (les dernières lignes ne débordent plus sous le cadre) ;
    - HUD des états : noms lisibles (pleine opacité, sombres en thème clair) ;
    - HUD des états : icônes nettes, état actif en case orange et nom en gras, sans filtre sépia.
  - **Dans tous les cas** :
    - icônes d'état aux couleurs d'origine en thème clair, HUD et suivi de combat (le crâne blanc de Foundry reste inversé) ;
    - suivi de combat : icônes d'état opaques (plus de voile à 30 %) ;
    - HUD des états toujours dans l'écran : décalé s'il dépasse en bas, à droite (barre latérale comprise), à gauche ou en haut.
- Cocher ou décocher un réglage prend effet immédiatement, sans recharger.
- Règles pures `rules/hud-clamp.js` et `rules/hud-fixes.js`, service `services/hud-fixes.js`, tests Node et lot Quench « SWADE Tweaks : affichage ».
- API : `rules.computePaletteShift`.

## 1.2.1

### Corrigé
- L'entrée « Définir comme combattant actif » n'apparaissait pas : les hooks de menu supposés ne sont pas appelés par le suivi de SWADE. Les méthodes de menu de la classe du suivi (`CONFIG.ui.combat`) sont maintenant enveloppées au hook `setup` ; les hooks restent en secours, sans doublon.

## 1.2.0

### Ajouté
- Suivi de combat, clic droit sur un combattant ou un en-tête de groupe : « Définir comme combattant actif » (MJ, combat lancé). Sur un groupe, le curseur va au meneur.
- API : `canSetActive`, `setActiveCombatant`, `rules.computeTurnChange`.
- Tests Node et lot Quench « SWADE Tweaks : curseur ».

## 1.1.0

### Refactorisation
- Découpage : `scripts/rules/` (règles pures), `scripts/services/` (accès Foundry), `scripts/main.js` (hooks), `scripts/api.js`.
- Tests Node (`npm test`) : règles, services avec faux objets Foundry, test de fumée de `main.js`. Tests Quench d'intégration.
- API publique `game.modules.get("swade-tweaks").api`, annoncée par le hook `swade-tweaks.ready` (voir API.md).
- CSS déplacé dans `styles/swade-tweaks.css`, variables préfixées `--swade-tweaks-*`.

### Changements de comportement
- Les tokens vidéo (webm, mp4) sont écartés : le groupe prend alors l'image suivante (token, puis portrait), sinon l'icône SWADE.
- Le MJ actif est déterminé par `game.users.activeGM?.isSelf`.
- Les écritures du module sont marquées et ignorées par ses propres hooks.
- Version affichée en console au démarrage.

### Retiré
- Variable globale de test `swadeTweaksSync` : utiliser `api.syncGroup`.

## 1.0.0
- Nom « Groupe de/d' + meneur » et image du meneur sur les groupes du Combat Tracker.
- Icône de groupe ronde, bordure, halo et badge.
