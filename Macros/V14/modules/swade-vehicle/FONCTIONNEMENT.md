# SWADE Vehicle — fonctionnement

Ce document décrit ce que fait le module, du point de vue de la table de jeu. Pour l'installation et le développement, voir `README.md` ; pour l'interface de programmation, voir `API.md`.

SWADE Vehicle propose une **fiche alternative pour les acteurs de type Véhicule** du système SWADE (Foundry VTT v14, SWADE 6.x). Elle est en français (terminologie VF) et se choisit dans *Configurer la fiche* → « Fiche véhicule SWADE Vehicle ». Les données restent celles du véhicule SWADE ; le module ajoute ses propres informations dans les flags `swade-vehicle`.

---

## 1. Principe : la conception et l'usage

La fiche sépare deux moments.

- **Conception** : on définit le véhicule une fois. On y règle la fiche technique, les postes, les soutiens, les armes, les mods, la cargaison et l'énergie.
- **Passerelle** : on joue avec, en combat ou en poursuite. On y trouve les postes occupés et leurs jets, l'état du véhicule, les Blessures, le bouclier, l'énergie et le journal.

Le **cadenas** de l'en-tête verrouille la fiche pour éviter les modifications accidentelles. Le menu **Ajustements** permet de *forcer* les valeurs calculées (Classe, Échelle, Blessures max) quand la règle automatique ne convient pas.

---

## 2. Fiche technique et valeurs calculées

Ce qu'on peut calculer est calculé, et chaque valeur calculée peut être forcée.

| Valeur | Calcul |
|---|---|
| **Échelle** | D'après la Taille du véhicule. |
| **Blessures max** | D'après la Taille. |
| **Classe du véhicule** | D'après la Résistance de base (Armure comprise), avec la méthode *Calculating Class*. Elle n'est jamais lue dans le nom. |
| **Classe d'une arme** | D'après les dégâts moyens et la PA. Les bonus fixes de dégâts sont ignorés. |

La Classe s'affiche à côté du nom du véhicule et de celui de chaque arme. Le type de véhicule et la Taille se modifient dans la fiche technique.

Quand un **effet actif** modifie un champ (par exemple de l'Armure ajoutée par un objet), le module l'indique sous le champ concerné. On voit ainsi d'où vient une valeur.

Les fonctions optionnelles s'activent dans la Conception : **Cargaison**, **Mods** et **Énergie**.

---

## 3. Postes et équipage

### Définition (Conception)

Un poste a :

- un **type** : Pilote, Artilleur ou Autre ;
- un **libellé** ;
- une **compétence**. Pour le pilote, c'est la compétence de manœuvre du véhicule ; pour un artilleur, c'est Tir ; pour un poste Autre, elle est libre ;
- des **armes** et des **mods** rattachés ;
- des **soutiens** (voir § 4).

Deux boutons aident à créer les postes. « Importer l'équipage » crée les postes à partir de l'équipage SWADE. « Ajouter un poste » en crée un vide. Le champ **Équipage requis** sert au contrôle d'effectif.

### Occupants

On place un occupant en **glissant un acteur** sur un poste. Le portrait du jeton s'affiche ; un double-clic ouvre la fiche de l'acteur et « retirer » libère le poste. Chaque poste peut être replié, et « tout replier » replie tous les postes.

### Acteur lié ou non : modèle ou instance

Le module regarde la case **« Lié à l'acteur »** du prototype de jeton de l'acteur déposé, sur un poste comme sur un soutien.

- **Lié** (en général un Joker) : le véhicule référence l'acteur lui-même. Ses états, Blessures et Jetons sont les mêmes partout, sur toutes les scènes.
- **Non lié** (en général un Extra) : l'acteur n'est qu'un **modèle**, et le module ne l'utilise pas. Il crée une **instance propre au véhicule**, par exemple « Kathol Republic Marine (Far Star) », rangée dans le dossier « Équipages des véhicules ». Les états et les Blessures de cette instance ne concernent que ce véhicule. Déposer deux fois le même modèle crée deux instances numérotées. L'instance est liée : si l'on pose son jeton sur une scène, il partage ses états.
- **Acteur de jeton** (déjà une instance d'une scène) : référencé tel quel.
- **Acteur de compendium** : importé dans le monde (instance si non lié).
- **Instance d'un autre véhicule** : une nouvelle instance est créée pour ce véhicule, à partir du même modèle.

Quand une instance ne sert plus au véhicule (occupant retiré ou remplacé, soutien ou poste supprimé, véhicule supprimé), le module la supprime. Le modèle n'est jamais modifié ni supprimé. L'import de l'équipage natif applique la même règle.

Un manque d'équipage (effectif à bord inférieur à l'équipage requis) est signalé. Les soutiens comptent dans l'effectif.

### Jets d'un poste (Passerelle)

Chaque poste propose ses jets, avec le nom de l'occupant :

- **Pilote** : jet de manœuvre, avec la Maniabilité, le malus de Blessures du véhicule et les effets de l'énergie.
- **Artilleur** : tir avec chaque arme rattachée, actions de l'arme, dégâts normaux et dégâts Heavy Metal.
- **Autre** : jet de la compétence du poste.
- **Mods** : leurs actions de jet (par exemple une compétence apportée par un mod).

Les jets passent par le pipeline natif de SWADE : fenêtre de jet, relance avec un Jeton et gestion des munitions selon le réglage du système. Si le réglage *Lanceur de dés* vaut « SWADE Tools », ils passent par SWADE Tools (voir § 11).

Le bonus de soutien en attente du poste s'ajoute automatiquement au jet suivant de l'occupant, puis il est consommé.

### Passagers

La liste des passagers indique qui est à bord sans tenir de poste.

---

## 4. Soutiens

Un poste peut avoir **plusieurs soutiens** : par exemple des servants de tourelle, des pourvoyeurs ou un mécano. Chaque soutien donne un bonus au **prochain jet de l'occupant du poste**.

### Définition (Conception, sous chaque poste)

« + Ajouter un soutien » crée une ligne qui comporte :

| Champ | Rôle |
|---|---|
| **Nom** | Libellé affiché, par exemple « Servants ». |
| **Effectif** | Nombre de personnes. Il compte dans l'équipage. |
| **Dé (sans acteur)** | Dé du jet de groupe du module, de d4 à d12 (d6 par défaut). |
| **Modificateur** | Ajouté au jet. |
| **Compétence** | Compétence **proposée par défaut** au jet de l'acteur du soutien (elle peut être changée à chaque jet). Quand un acteur est déposé, c'est une liste de **ses propres compétences** (avec leur dé), triée par nom. Tant que rien n'est choisi, c'est **la première compétence de la liste** : aucune compétence de poste (Pilotage, Tir…) n'est imposée. Sans acteur, le champ n'est pas utilisé par le jet de groupe. |
| **Acteur** | Facultatif. On glisse un acteur sur la ligne ; « retirer » l'enlève. Un Extra non lié devient une instance propre au véhicule (voir § 3). |

« Supprimer » efface le soutien et son bonus éventuellement en attente.

### Jet d'un soutien (Passerelle)

Chaque soutien a son bouton.

**Soutien sans acteur — « Jet de groupe »**
Le module lance le dé du soutien et un dé Joker (d6), qui explosent tous les deux. Il garde le meilleur, ajoute le modificateur et compare à 4 :

| Résultat | Bonus au prochain jet du poste |
|---|---|
| Réussite (4+) | +1 |
| Prouesse (8+) | +2 |
| Échec critique (deux 1) | −2 |

Le MJ peut relancer avec un Jeton depuis la carte du chat. La relance garde le meilleur résultat ; un échec critique ne se relance pas. Un soutien sans effectif ne peut pas lancer.

**Soutien avec acteur — « Jet de soutien »**
C'est généralement un Extra, parfois un Joker. Une petite fenêtre demande d'abord **quelle compétence soutient le poste** : la liste des compétences de l'acteur, avec la compétence par défaut présélectionnée. On peut ainsi soutenir le pilote en Pilotage, mais aussi en Astrogation, en Électronique, en Tir… Fermer la fenêtre annule le jet. L'acteur lance ensuite cette compétence par la **fenêtre de jet normale** : celle du système, ou celle de SWADE Tools si elle est choisie. **C'est dans cette fenêtre qu'on décide s'il s'agit d'un jet de groupe ou non**, pas dans le module. Le modificateur du soutien y est prérempli.

Une carte du chat apparaît ensuite. Après le jet et une éventuelle relance, le MJ ou l'auteur du jet y indique le résultat : Prouesse (+2), Réussite (+1), Échec (0) ou Échec critique (−2). Le choix est fait une seule fois et reste visible sur la carte. Le module ne lit pas lui-même le résultat du jet, parce que la fenêtre peut l'avoir transformé (jet de groupe, relance, SWADE Tools).

Si l'acteur du soutien est introuvable (supprimé, par exemple), le module avertit et lance le jet de groupe avec le dé du soutien.

### Cumul

Les bonus des différents soutiens d'un poste **s'additionnent**, avec un plafond de **+4**. Les échecs critiques se déduisent. La Passerelle affiche le total en attente (« soutien +3 au prochain jet »). Le prochain jet de l'occupant consomme l'ensemble des bonus.

### Anciens véhicules

Un véhicule créé avant la version 0.6.1 avait un soutien unique par poste. Il est lu comme une liste d'un seul soutien. Rien n'est perdu, et la conversion devient définitive à la première modification.

---

## 5. Blessures, épave et état

- **Blessures** : les pastilles se cliquent. Le malus de Blessures (−1 par Blessure, au plus −3) s'applique aux jets de manœuvre.
- **Épave** : au-delà du maximum de Blessures, le véhicule est marqué Épave. La valeur est plafonnée à max + 1, et le journal et le chat le signalent.
- **États** : Distrait et Vulnérable, entre autres. Sur un véhicule, **Distrait et Vulnérable s'appliquent à tous les membres d'équipage**. Les états du véhicule sont visibles sur la fiche et dans la liste des acteurs.

---

## 6. Dégâts

### Carte de dégâts

Les dégâts passent par une carte du chat qui guide les étapes :

1. **Encaisser** : la protection est utilisée *avant* l'application, et le bouclier sert d'abord.
2. **Appliquer** : les Blessures restantes sont appliquées au véhicule.
3. **Manœuvre** : en Heavy Metal, un jet de manœuvre est demandé. S'il échoue, on passe à la **Perte de contrôle**.

En mode natif, la carte propose d'encaisser puis de valider.

### Perte de contrôle et Dégradations critiques

Les deux tables sont des **tables aléatoires du monde ou d'un compendium**, réglées dans les paramètres par UUID. Le module tire la table, lit la valeur du 2d6 et applique l'effet correspondant :

- **Perte de contrôle** : selon le résultat, le véhicule est Distrait, il est Vulnérable ou il subit des Blessures et une Dégradation critique. Sur 12, la Dégradation est relancée tant qu'elle donne un résultat Équipage.
- **Dégradation critique** : elle touche le guidage (Maniabilité, au plus −4), la propulsion (Vitesse, au moins 60 %), une arme détruite (le châssis quand il n'y a plus d'arme) ou l'équipage (Secoué en collision, par exemple).

Les dégradations cumulées sont tenues à jour sous forme d'effets actifs. Le bouton **Réparer** les retire.

---

## 7. Heavy Metal

Heavy Metal remplace la résolution classique des dégâts pour les combats entre véhicules de grande échelle.

- **Par combat** : dans le suivi de combat, le MJ coche « Heavy Metal pour ce combat ». La case reste cochée, et les joueurs voient un badge. Tous les dégâts de véhicule de ce combat sont résolus en Heavy Metal.
- **Ponctuellement** : un bouton permet une résolution Heavy Metal hors combat.

La résolution compare la **Classe de l'arme** à la **Classe de la cible**, toutes deux calculées automatiquement, et applique le type d'ogive (WARHEADS). Une fois en Heavy Metal, il n'y a pas de cas mixte. Les cartes de SWADE Tools reçoivent aussi un bouton Heavy Metal.

---

## 8. Bouclier

Le bouclier est une réserve dont le maximum dépend de la Taille. Trois actions sont possibles :

- **Encaisser** des Blessures déjà subies avec le bouclier ;
- **Recharge d'urgence**, par un jet d'Électronique ;
- **Recharge complète**, qui demande 10 minutes hors combat.

---

## 9. Énergie

Cette fonction est optionnelle et s'active dans la Conception.

- Un compteur d'énergie, avec deux boutons : **Dépenser** et **Recharger**.
- **Détourner l'énergie** : on renforce un système (armes, propulsion, boucliers…) en prenant sur d'autres. Les effets s'appliquent aux jets et aux dégâts : Maniabilité, encaissement, dégâts et Blessures des armes. **Rétablir** ramène la répartition normale.

---

## 10. Joker, journal, cargaison, mods

- **Joker** : quand un véhicule tire un Joker à l'initiative, les Jokers à bord des véhicules alliés reçoivent un Jeton, une seule fois par round.
- **Journal** : les Blessures, dégradations, pertes de contrôle et réparations sont enregistrées avec la date. Le journal peut être vidé.
- **Cargaison** : capacité, contenu et unités (fonction optionnelle).
- **Mods** : emplacements utilisés et coûts. Certains mods offrent une action de jet.

---

## 11. SWADE Tools (facultatif)

Si SWADE Tools est installé et que le réglage *Lanceur de dés* vaut « SWADE Tools » :

- les tirs et les actions d'armes ouvrent sa fenêtre de tir au nom de l'occupant du poste ;
- les jets de compétence passent par sa fenêtre si ses jets simplifiés sont actifs ;
- les modificateurs du véhicule et le bonus de soutien sont préremplis.

Les dégâts Heavy Metal et les actions des mods restent gérés par le module et le système SWADE.

---

## 12. Paramètres du module

| Paramètre | Rôle |
|---|---|
| Lanceur de dés | Système SWADE ou SWADE Tools. |
| Table de Perte de contrôle | UUID de la table tirée. |
| Table des Dégradations critiques | UUID de la table tirée. |

## 13. API

Les autres modules et les macros (par exemple une macro de Clash) accèdent aux données et aux jets par `game.modules.get("swade-vehicle").api`. Le hook `swade-vehicle.ready` est émis quand l'API est prête. Le détail est dans `API.md`.
