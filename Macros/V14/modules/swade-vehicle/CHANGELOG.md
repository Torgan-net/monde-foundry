# Journal des versions

## 0.6.5

- Passerelle : le texte d'aide après le nom des soutiens est retiré (il reste en info-bulle sur le nom).
- Soutien avec acteur : plus de compétence imposée par le poste (Pilotage, Tir). Sans réglage, la compétence proposée est la première de la liste de l'acteur.

## 0.6.4

- Soutien avec acteur : au moment du jet, une fenêtre demande la compétence utilisée parmi celles de l'acteur (Astrogation, Électronique, Tir…). La compétence réglée dans la Conception n'est plus qu'un choix par défaut.
- Test : un Extra lié à l'acteur est référencé tel quel, un Joker non lié reçoit une instance.

## 0.6.3

- Correction : un Extra (prototype de jeton non lié) déposé sur un poste ou un soutien référençait le modèle. Le module crée désormais une instance propre au véhicule (dossier « Équipages des véhicules »). Un acteur lié reste référencé tel quel.
- Les instances qui ne servent plus sont supprimées (occupant retiré ou remplacé, soutien ou poste supprimé, véhicule supprimé).
- L'import de l'équipage natif applique la même règle.

## 0.6.2

- Soutien avec acteur : la compétence se choisit dans la liste des compétences de l'acteur (avec leur dé). « Compétence du poste » reste le choix par défaut, et la liste signale si l'acteur ne l'a pas.
- La Passerelle et la carte du chat affichent le nom de la compétence de l'acteur.

## 0.6.1 — soutiens multiples

- Plusieurs soutiens par poste (onglet Conception : « + Ajouter un soutien »), chacun avec nom, effectif, dé, modificateur et compétence.
- Un acteur peut être déposé sur un soutien (Extra ou Joker). Son jet passe par la fenêtre normale (système ou SWADE Tools), où l'on choisit jet de groupe ou non ; une carte du chat permet ensuite d'indiquer le résultat (Prouesse, Réussite, Échec, Échec critique).
- Sans acteur, le soutien lance le jet de groupe du module, comme avant (dé du soutien + dé Joker).
- Les bonus des soutiens se cumulent sur le prochain jet du poste, plafonnés à +4.
- Les anciens véhicules (soutien unique) sont convertis à la lecture, sans perte.
- Un soutien avec acteur compte au moins pour 1 dans l'équipage.
- Nouveau document fonctionnel `FONCTIONNEMENT.md`.

## 0.6.0 — refactorisation

Aucune évolution fonctionnelle visible : le comportement de la 0.5.3 est conservé, vérifié par les tests.

- Découpage du fichier unique `main.js` (2 900 lignes) en modules thématiques : `rules/`, `services/`, `integrations/`, `sheets/`, `api.js`, `settings.js`.
- Règles de jeu extraites en fonctions pures (Classes, Taille, Heavy Metal, énergie, tables, bouclier, soutien, Blessures) et utilisées par les services.
- Tests : 49 tests Node (`npm test`) et un lot d'intégration Quench.
- Outils : `npm run check`, recalcul des imports (`tests/tools/fix-imports.py`).
- Correction : le malus de Blessures valait « −0 » sans Blessure (détecté par les tests).
- Documentation : README (structure, développement, écritures), CHANGELOG.

## 0.5.3 et antérieures

Développement initial : fiche, postes, jets, Heavy Metal, bouclier, gestion de l'énergie, Dégradations critiques et Perte de contrôle, journal, Joker, soutien, carte de dégâts, intégration SWADE Tools, API.
