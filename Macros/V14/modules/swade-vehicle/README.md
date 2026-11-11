# SWADE Vehicle – Fiche véhicule

Module Foundry VTT **v14** pour le système **SWADE 6.x** : fiche alternative des acteurs véhicule (postes, équipage, jets, Heavy Metal, bouclier, énergie, Dégradations critiques, journal).

Description fonctionnelle complète : voir [FONCTIONNEMENT.md](FONCTIONNEMENT.md).

## Installation

1. Arrêter Foundry (le serveur, pas seulement le monde).
2. Remplacer le dossier `Data/modules/swade-vehicle` par celui de l'archive.
3. Relancer Foundry, puis Ctrl+F5 dans le navigateur.
4. Vérifier que `game.modules.get("swade-vehicle").version` et le pied de la fiche affichent la même version.

## Structure

```
scripts/
  main.js            point d'entrée : assemble le module, sans logique propre
  constants.js       identifiant, version, rôles, états, tables par défaut
  settings.js        réglages du module
  api.js             API publique (voir API.md)
  rules/             règles de jeu pures, sans Foundry (testées en Node)
    classes.js         Classes d'arme et de véhicule (CSF)
    size.js            Échelle et Blessures selon la Taille
    heavy-metal.js     résolution Heavy Metal
    energy.js          gestion de l'énergie
    tables.js          Perte de contrôle et Dégradations critiques
    shield.js          bouclier
    support.js         jet de groupe du soutien
    wounds.js          malus et plafond des Blessures
    numbers.js         conversion d'entiers
  services/          accès aux documents Foundry et automatismes
    vehicle.js         lecture : postes, équipage, pilote, armes
    foundry-utils.js   utilitaires Foundry (UUID, effets, images…)
    rolls.js           jets (pipeline SWADE natif)
    criticals.js       tables, Dégradations, réparations
    wounds.js          Blessures et épave
    shield.js  energy.js  crew.js  journal.js  joker.js  support.js
    heavy-metal.js     combat Heavy Metal et dialogue
    damage-card.js     carte de dégâts du chat
    scale-patch.js     Échelle imposée après le calcul du système
  integrations/
    swade-tools.js     lanceur SWADE Tools, bouton Heavy Metal sur ses cartes
  sheets/
    vehicle-sheet.js   classe de la fiche (ApplicationV2)
    context.js         données du gabarit
    actions-rolls.js   actions de jets
    actions-gm.js      actions MJ / propriétaire
    actions-ui.js      onglets, postes, fenêtres annexes
  quench-batches.js  tests d'intégration (si Quench est actif)
templates/  styles/
tests/
  unit/              tests Node (node:test), sans dépendance
  helpers/           faux environnement Foundry
  tools/             vérifications avant livraison
```

Règle : une règle de jeu est une fonction pure de `rules/`. Les `services/` lisent les documents, appellent les règles et écrivent.

## Développement

Prérequis : Node 18 ou plus (et Python 3 pour la vérification des imports). Aucune dépendance à installer.

```sh
npm test          # tests unitaires (règles, services avec faux Foundry, chargement du module, contexte de la fiche)
npm run check     # syntaxe, gabarits Handlebars, versions concordantes, imports cohérents
python3 -I tests/tools/fix-imports.py .   # recalcule les imports nommés après un déplacement de code
```

Workflow pour toute évolution ou correction :

1. **Écrire ou modifier le test** qui décrit le résultat attendu (règle du livre, cas signalé, bug reproduit).
2. Lancer `npm test` : **le nouveau test doit échouer**.
3. Modifier le code au minimum pour le faire passer.
4. Relancer **toute** la suite : aucune régression.
5. `npm run check`, incrémenter la version (`module.json` et `constants.js`), mettre à jour `CHANGELOG.md` et `API.md`.
6. Tester en jeu sur des données dupliquées ; lancer les tests Quench (`quench.runBatches("swade-vehicle.**")`).

## Ce que le module écrit

Sur l'acteur véhicule :

- `flags.swade-vehicle.*` : postes, occupants, Classe forcée, options, journal (200 entrées), Dégradations, énergie, bonus de soutien, repli des postes.
- `system.crew.members` : synchronisé avec les postes ; les membres ajoutés hors du module sont conservés.
- `system.status.*`, `system.wounds.value` (jusqu'à max + 1 : épave).
- Caractéristiques de l'onglet Conception, une valeur à la fois : `name`, `system.classification`, `size`, `scale`, `handling`, `topspeed.*`, `toughness.*`, `wounds.max`, `cost`, `driver.skill`, `crew.required.max`, `crew.optional.*`, `cargo.max`, `mods.max`, `energy.*`.
- `system.additionalStats.shield` (charges), si la stat existe.
- Effets actifs propres au module : « Dégradations critiques » et « Gestion de l'énergie ».

Acteurs créés : une instance par Extra non lié déposé sur le véhicule (dossier « Équipages des véhicules », `flags.swade-vehicle.instanceOf` = modèle, `instanceFor` = véhicule). Elle est supprimée quand le véhicule ne la référence plus ou est supprimé. Les modèles ne sont jamais modifiés.

Sur les membres d'équipage : états Distrait, Vulnérable et Secoué (marqués par le véhicule d'origine, seuls ceux-ci sont retirés) et Jetons (Joker à l'initiative).

Les champs de la fiche n'ont pas d'attribut `name` : la soumission de formulaire n'écrit jamais rien.
