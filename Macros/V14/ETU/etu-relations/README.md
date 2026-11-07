# ETU-relations (v0.2.2)

Relations réciproques PJ ↔ PNJ pour SWADE (Foundry v14, SWADE 6.x).

## Installation
1. Désactiver puis supprimer l'ancien module `swade-relations` s'il est installé.
2. Copier le dossier `etu-relations` dans `Data/modules/`, relancer Foundry, activer **ETU-relations** dans le monde.
3. Au premier chargement par le MJ, les données de la v0.1 sont recopiées automatiquement.

## Fonctionnement
Chaque lien PJ ↔ PNJ porte deux niveaux de Réaction indépendants (Hostile → Serviable, Neutre par défaut, SWADE VF p. 33) :
- **PJ → PNJ**, stocké sur le PJ ;
- **PNJ → PJ**, stocké sur l'acteur PNJ de base (partagé par tous ses jetons).

Chaque fiche n'affiche que son propre côté du lien, sur une seule ligne : la personne en relation, un cœur rouge si la relation est amoureuse, la barre et le niveau.

**Fiche de PJ** (joueur propriétaire + MJ) : attitude du PJ envers chaque PNJ. Le joueur ajoute un PNJ (glisser-déposer ou nom libre), écrit sa note, retire un lien. Le MJ règle le niveau, coche *Relation amoureuse* et écrit sa note privée.

**Fiche de PNJ** (MJ uniquement) : attitude du PNJ envers chaque PJ qui l'a dans ses relations (liste automatique). Glisser un PJ sur l'onglet crée le lien.

## Données
- `flags.etu-relations.contacts.<id>` (PJ) : nom, uuid, image, niveau, amour, note joueur ;
- `flags.etu-relations.gmNotes.<id>` (PJ) : note MJ, commune aux deux côtés du lien ;
- `flags.etu-relations.attitudes.<idPJ>` (PNJ) : niveau, amour.

API : `game.modules.get("etu-relations").api` (`getContacts`, `getAttitude`, `linksForPj`, `linksForNpc`).

## Limites connues
- Un PNJ saisi en nom libre n'a pas de fiche : pas de réciprocité possible.
- Un lien PJ ↔ PJ reste à sens unique.
- La note MJ est stockée sur l'acteur du PJ : invisible dans l'interface, mais lisible en fouillant la console.
- Si l'onglet n'apparaît pas, la console affiche `etu-relations | Onglets introuvables…` à transmettre pour diagnostic.
