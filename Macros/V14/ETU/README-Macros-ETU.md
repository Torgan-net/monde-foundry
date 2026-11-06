# Macros ETU — Foundry VTT / SWADE

Suite de macros pour la campagne **ETU: Wellspring**, compatibles Foundry VTT V13/V14, système SWADE.

---

## 🔧 Prérequis — Additional Stats à créer

Avant d'utiliser ces macros, certaines **caractéristiques étendues** (Additional Stats) doivent être configurées manuellement dans les réglages du système SWADE (**Configurer les paramètres → Additional Stats**), aussi bien au niveau du monde qu'activées sur les fiches concernées.

| Clé (à saisir exactement) | Type | Où l'activer | Utilisée par |
|---|---|---|---|
| `scholarship` | Nombre | Fiche **Acteur** | Activités Extra-scolaires, Examens de Semestre |
| `etu-extracurricular` | Texte | Fiche **Acteur** | Activités Extra-scolaires |
| `battery` | Texte (valeurs : `Bon` / `Faible` / `Vide`) | Fiche **Item** (objet d'inventaire : téléphone, laptop...) | Batterie |

⚠️ Les clés doivent correspondre **exactement** (casse comprise) à ce que les macros attendent. Si une valeur ne se met pas à jour, vérifie en premier lieu que la clé configurée dans les Tweaks correspond bien à celle du tableau ci-dessus.

### Autres réglages système utilisés (détectés automatiquement, rien à faire)

- **Type de Richesse** (`Argent` vs `Richesse (dé)`) : détecté automatiquement via le réglage système SWADE. Les macros s'adaptent toutes seules au mode actif.
- **Compendiums d'Atouts** : la macro Examens importe les Atouts accordés depuis les compendiums d'Items chargés (en priorité un module dédié type *SWADE Core Rules*, sinon le pack fourni par le système). Aucune config nécessaire, mais un Atout introuvable dans aucun compendium chargé déclenchera un avertissement.

---

## 📜 Description des macros

### 1. `ETU-Activites-Extrascolaires.js`
Gère le choix de l'activité extra-scolaire du semestre (Athlète, Fraternité/Sororité, Job à temps partiel, Sessions de Jeux, etc.). Affiche une grille de cartes filtrée selon les prérequis du personnage, applique automatiquement les bonus/malus (Active Effects sur compétences, attributs, Bonus d'études, Richesse), gère l'argent ou la Richesse selon le système actif, et retire proprement les effets du semestre précédent. Prend en charge l'Atout **Polyvalent** (deux activités au lieu d'une).

### 2. `ETU-Allocation-Semestrielle.js`
Remet à niveau l'argent de poche (ou le dé de Richesse) en début de semestre, selon la catégorie de richesse du personnage (Pauvre/Classe moyenne/Riche/Extrêmement riche), détectée automatiquement via les Atouts/Handicaps mais modifiable avant validation. Fonctionne sur plusieurs personnages sélectionnés à la fois.

### 3. `ETU-Niveau-Signal.js`
Outil MJ pour appliquer le malus de signal cellulaire (0 à 4 barres) aux compétences Recherche/Piratage/Électronique d'un ou plusieurs personnages sélectionnés, via Active Effect. Retire proprement l'effet précédent à chaque changement de niveau.

### 4. `ETU-Batterie.js`
Gère le niveau de batterie (Bon/Faible/Vide) des objets électroniques de l'inventaire (téléphone, laptop...). Détecte automatiquement les objets concernés via l'Additional Stat `battery`, permet de consulter, décrémenter d'un cran, ou fixer directement le niveau.

### 5. `ETU-Examens-Semestre.js`
La plus complète : gère le passage des examens de mi-semestre/fin de semestre. Configuration du Rang académique, de la Filière (Scientifique/Littéraire/Autre) et de la Compétence de Filière (avec prise en charge Double Filière et General Studies). Déclenche le vrai jet natif SWADE, en lit automatiquement le résultat (total + détection d'échec critique), gère la relance au Jeton et les bonus après-jet. En cas de réussite, tire sur la table de Perks correspondante (avec Prouesses, Jackpot, Pluridisciplinaire) et applique les récompenses : Atouts importés depuis les compendiums, bonus chiffrés, rappels narratifs — tous en Active Effects favorisés (visibles en Accès rapide), avec description complète (texte narratif + détail technique).

---

## 🎨 Module de thème visuel

`etu-sheet-theme` (module Foundry, pas une macro) : reskin visuel de la fiche de personnage aux couleurs ETU (bleu marine/rouge), papier ligné façon cahier d'étudiant pour les panneaux de contenu. À installer dans `Data/modules/` et activer dans le monde.

---

## ⚠️ Limites connues

- Les macros supposent des **noms de compétences en anglais** (convention SWADE standard) même dans un monde en français.
- Certains effets narratifs (Relations/Connections, Conviction, restrictions contextuelles) ne sont **pas automatisables** mécaniquement et restent des rappels textuels dans le chat/les Active Effects.
- L'import d'Atouts (macro Examens) dépend des compendiums réellement chargés dans le monde — un Atout absent de tout compendium déclenche un avertissement plutôt qu'un échec silencieux.
