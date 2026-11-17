# Changelog

## 0.4.10 — 17/11/2026

- Relecture des messages pour les véhicules :
  - annonce et bloc de Complication : nom du pilote (swade-vehicle), « sans modificateur » au lieu de « à 0 », conséquence d'un Échec critique précisée selon le mode (Perte de contrôle, dé pair / impair, table 1d6 monté) ;
  - Échec critique et jet de contrôle : « pilote » (avion, vaisseau), « barreur » (bateau) ou « conducteur » (autre véhicule) ;
  - véhicule touché : « subit des dégâts au moins égaux à sa Résistance » (et non « est dégâts… ») ; Bousculé par le MJ et monture touchée reformulés ;
  - Se dérober et Stabiliser : texte propre au véhicule (véhicule et passagers), au cavalier ou au personnage à pied ;
  - « participant » au lieu de « personnage » dans les messages de droits.

## 0.4.9 — 17/11/2026

- Droit Observateur : un joueur voit dans le panneau les participants (personnages ou véhicules) qu'il observe, en lecture seule — mention « lecture seule » dans la liste, bandeau, aucun bouton d'action, de jet, de nombre d'actions ni de fin de tour. Les écritures restent réservées au propriétaire et au MJ.

## 0.4.8 — 17/11/2026

- Réouverture du panneau par le MJ (onglet Réglages, « Panneau des joueurs ») : chez tous les joueurs ou chez un joueur précis ; rouvert seulement là où il était fermé, sans tenir compte du réglage d'ouverture automatique.
- Déplacement automatique : le jeton ne se pose plus sur un autre jeton ; il est décalé d'une case, de préférence perpendiculairement à la piste pour rester sur la même carte (taille du jeton prise en compte).
- Dépassement de la dernière carte de la piste : le MJ peut mettre fin à la poursuite ; sinon, message lui demandant d'ajouter des cartes.

## 0.4.7 — 16/11/2026

- Abandon de la règle de table « une manœuvre en action par tour » (option retirée) : on suit le livre, les manœuvres peuvent faire partie d'actions multiples ; seules restent les limites propres à chaque manœuvre (Changer de position une fois par tour, Se dérober une fois par round, Fuir exclusive…).

## 0.4.6 — 16/11/2026

- Règle de table « une manœuvre en action par tour » (option de la poursuite, activée par défaut) : au plus une manœuvre du chapitre Manœuvres en action (Changer de position, Lever le pied, Éperonner, Se dérober, Fuir, Repousser, Aborder, Stabiliser), plus une en action gratuite. Attaquer, Soutien, Épreuve et Pouvoir sont des actions standard, toujours répétables.

## 0.4.5 — 16/11/2026

- Bouton « Fin du tour » toujours disponible pendant le tour du participant : avertissement s'il reste des actions, l'action gratuite ou une Complication non résolue, puis passage au participant suivant.

## 0.4.4 — 16/11/2026

- SWADE Tools : ses boutons (relance avec un Jeton, relance gratuite, ajouts) apparaissent aussi sur les jets natifs lancés par le module — jets de véhicule via swade-vehicle, jets sans compétence — en marquant le message (`flags.swade-tools.rolltype`), comme dans swade-vehicle et swade-clash.
- Jets simplifiés de SWADE Tools actifs : sa propre fenêtre s'ouvre avec le champ « Modificateur » prérempli (total, détail en infobulle).
- Pied du panneau : lanceur de jets actif.

## 0.4.3 — 16/11/2026

- Bousculer : un même assaillant ne Bouscule une cible qu'une fois par tour (Repousser et dégâts) ; un second Bousculé est annoncé sans déplacement (l'Échec critique d'une Prouesse s'applique toujours).
- Tests ajoutés : un seul déplacement volontaire par tour (Changer de position gratuit ou en action, Lever le pied), actions répétables avec les actions multiples (Repousser, Attaquer…).

## 0.4.2 — 16/11/2026

- Lever le pied compte comme une action (sans jet) : il consomme une des actions prévues, n'est plus possible quand elles sont épuisées, et n'est compté qu'une fois le recul choisi.

## 0.4.1 — 16/11/2026

- Mode de déplacement « Automatique » (par défaut) : véhicule → sous-type d'après sa compétence de manœuvre lue dans swade-vehicle (Pilotage : avion / vaisseau, Navigation : bateau, Équitation : chariot, sinon Conduite) ; personnage avec monture associée → Monté ; sinon → À pied. La compétence du jet et la table d'Échec critique suivent ce mode.
- Le MJ peut toujours forcer un mode (onglet Réglages), puis revenir en Automatique.
- La monture peut être associée à tout personnage (plus besoin de passer d'abord en Monté).
- Organisation retenue : seul le véhicule figure dans le suivi de combat, son pilote fait les jets.

## 0.4.0 — 16/11/2026

- Complication au début du tour du participant (et non plus à la distribution des cartes) : bloc « Complication » en haut du panneau (carte de poursuite, modificateur, conséquence, jet, Réussite / Échec) ; le jet s'ouvre automatiquement chez le joueur.
- Aucune action possible tant que la Complication n'est pas résolue.
- Chat : un message d'annonce (sans boutons) au début du tour, puis un message de résultat avec la conséquence appliquée.
- Jeton hors piste : l'enseigne de la carte de poursuite se choisit dans le bloc avant le jet.

## 0.3.7 — 16/11/2026

- SWADE Tools : ses jets ouvrent la fenêtre native de SWADE (RollDialog, constaté par dump) ; les modificateurs de poursuite y sont maintenant ajoutés automatiquement par la ligne « Ajout » (+2 action dédiée, bonus de vitesse, carte de poursuite, Fatigue de la monture…), et l'option « actions multiples » y est réglée. Rappel privé conservé en secours.

## 0.3.6 — 16/11/2026

- SWADE Tools : appel conforme à son API réelle (`game.swadetools.skill(actor, skillItemId)`, constatée sur la 4.1.4) ; ses boutons (relance avec un Jeton, relance gratuite, bonus) sont donc disponibles sur les jets du panneau.
- Lanceur des jets : nouveau choix « Automatique » (par défaut) — SWADE Tools s'il est actif, sinon jet natif.

## 0.3.5 — 16/11/2026

- Panneau : quand le tour passe à un autre participant (suivi de combat), le panneau bascule sur lui s'il est visible pour l'utilisateur, et revient sur l'onglet Déplacement. Une sélection manuelle reste en place tant que le tour ne change pas.

## 0.3.4 — 16/11/2026

- Monture d'un cavalier : en mode « Monté », le MJ associe un jeton de la scène comme monture (onglet Réglages) ; pastille « Monture » dans l'en-tête.
  - bonus de vitesse automatique d'après l'Allure de la monture ;
  - Échec critique monté (3-4) : la Fatigue est appliquée à la monture ;
  - Fatigue de la monture : malus ajouté aux jets de Manœuvre (Équitation) du cavalier ;
  - monture Secouée, Sonnée ou Blessée : le cavalier est Bousculé.

## 0.3.3 — 16/11/2026

- Éperonner : dégâts calculés et lancés pour chaque participant — Échelle de celui qui les provoque (Petit d6 … Gigantesque 5d6, d'après `system.stats.scale`, sinon la Taille), +d6 pour l'attaquant sur une Prouesse, +d6 / +2d6 si sa Résistance est supérieure / au moins double, +d6 / +2d6 selon sa Vitesse max (90–180 km/h / au-delà, véhicules). Détail affiché dans le chat ; dégâts à appliquer sur les fiches.
- Résistance des véhicules lue via swade-vehicle (`getToughness`) si présent.

## 0.3.2 — 16/11/2026

- Jets opposés (Repousser, Éperonner, Aborder) : choix de la cible si plusieurs adversaires partagent la carte, jet de l'attaquant, puis message de jet opposé avec bouton de jet pour le défenseur ; résultat comparé et proposé (Succès et total supérieur ; égalité au défenseur ; Prouesse à +4).
- Repousser : victoire → défenseur Bousculé (direction au choix de l'attaquant) ; Prouesse → + Échec critique de Manœuvre du défenseur (dé, Fatigue…) ; Échec critique de l'attaquant → il est Bousculé.
- Aborder : victoire → vaisseau abordé (défenseurs En attente, sauf Prouesse) ; le commandant abordé ne peut que Changer de position à −4 (Lever le pied et Fuir grisés) ; Succès → plus retenu, Prouesse → libéré et déplacé d'une carte.
- Éperonner : collision annoncée (le calcul des dégâts viendra ensuite).
- Lecture de l'état Secoué / Blessé confirmée par dump.

## 0.3.1 — 16/11/2026

- Bousculé déclenché par les dégâts : un participant Secoué, Sonné ou Blessé pendant la poursuite est Bousculé d'une carte ; le MJ choisit la direction pour l'attaquant (ou « ne pas Bousculer » si cet assaillant l'a déjà fait ce tour). Détection sur les Blessures, l'état Secoué / Sonné et les effets de statut ; un seul Bousculé pour un même coup.
- Véhicule endommagé (nouvelle Blessure) : Bousculé + message « Perte de contrôle ? » avec jet de Manœuvre du conducteur ; en cas d'Échec, table des Pertes de contrôle tirée et appliquée par swade-vehicle.
- Réglages MJ : boutons « Bousculer » et « Véhicule touché » (dégâts ≥ Résistance sans Blessure, non détectables).

## 0.3.0 — 16/11/2026

- Déplacement automatique des jetons le long de la piste (le jeton garde son décalage par rapport à sa carte) :
  - Changer de position : après le jet, choix du sens et du nombre de cartes (Succès : 1, Prouesse : jusqu'à 2 ; résultat lu proposé par défaut, relance avec un Jeton possible) ;
  - Lever le pied : recul de 1 ou 2 cartes ;
  - Bousculé sur Complication : le MJ (camp adverse) choisit la direction, le jeton est déplacé.
- Piste trop courte : le jeton s'arrête au bout et le MJ reçoit un message privé lui demandant d'ajouter des cartes.
- Fuir : après le jet, Succès / Échec ; en cas de Succès, le MJ confirme et l'unité passe hors poursuite.

## 0.2.9 — 16/11/2026

- L'action gratuite reste possible après les actions déclarées (elle peut suivre l'action principale) ; bandeau « il reste l'action gratuite » avec bouton « Participant suivant ».
- Tour terminé seulement quand les actions déclarées ET l'action gratuite sont faites (ou après une action exclusive) : tout est grisé et la fenêtre propose de passer au participant suivant.

## 0.2.8 — 16/11/2026

- Fin du tour : dès que les actions prévues sont jouées (ou une action exclusive), tout est grisé (gratuites, Lever le pied, Retenir compris), un bandeau l'indique et une fenêtre propose de passer au participant suivant ; bouton « Participant suivant » dans le panneau.
- Nombre d'actions prévues verrouillé dès la première action engagée (gratuite comprise) ; seul le MJ peut le corriger.

## 0.2.7 — 16/11/2026

- Allure : lecture de `system.pace.default` (Allure du mode de base, constaté par dump), puis `system.pace.ground`.

## 0.2.6 — 16/11/2026

- Bonus de vitesse automatique entre personnages à pied : comparaison des Allures (strictement supérieure : +1 ; au moins le double : +2).
- Pas de calcul entre grandeurs différentes (coureur contre véhicule) ni pour un cavalier (l'Allure est celle de la monture) : choix manuel.

## 0.2.5 — 16/11/2026

- Bonus de vitesse automatique pour un véhicule : Vitesse max comparée à celle du plus rapide des assaillants (strictement supérieure : +1 ; au moins le double : +2). Vitesse lue via swade-vehicle (`getTopSpeed`, Dégradations comprises), sinon dans le champ du système ; km/h et mph convertis.
- Le choix « Vitesse auto » est sélectionné par défaut ; une valeur manuelle reste possible. L'infobulle indique les deux Vitesses comparées.
- Si une Vitesse manque (assaillant à pied, champ vide…), pas de calcul : choix manuel comme avant.

## 0.2.4 — 16/11/2026

- En attente : lecture de `combatant.system.roundHeld` (constaté par dump) ; pastille « En attente » dans l'en-tête du panneau.
- Retenir son action : bouton « Passer En attente » (via `setRoundHeld` du système s'il existe, sinon `system.roundHeld` = round courant) ; grisé si le participant est déjà En attente.

## 0.2.3 — 16/11/2026

- Retenir son action : disponible seulement en début de round, avant toute autre action (gratuite comprise) ; grisé ensuite.

## 0.2.2 — 16/11/2026

- Actions multiples : prise en charge de la vraie fenêtre de jet SWADE (`RollDialog`, boutons radio `map` 0 / −2 / −4, constatés par dump).
- Détection de la fenêtre de jet : le répertoire des tables aléatoires (`RollTableDirectory`) n'est plus confondu avec elle.

## 0.2.1 — 16/11/2026

- Actions multiples : plus de modificateur injecté ; l'option « actions multiples » de la fenêtre de jet SWADE est réglée automatiquement (2 ou 3). Après « Déclarer », elle est réglée dans la prochaine fenêtre de jet ouverte depuis la fiche. Si le champ n'est pas reconnu, le joueur est prévenu.
- Complication : le jet s'ouvre automatiquement au début du tour du participant, chez son joueur connecté (sinon chez le MJ), une seule fois. Il ne compte pas dans l'action gratuite du tour.

## 0.2.0 — 16/11/2026

- Panneau réorganisé : en-tête compact (participant, cartes, statut) et onglets Déplacement, Adversaires, Défense, Autres, Réglages (MJ) ; beaucoup moins de défilement.
- Économie d'actions du tour : 1, 2 ou 3 actions prévues (malus d'actions multiples 0, −2, −4 ajouté aux jets faits en action), plus une action gratuite au plus. Une fois la gratuite utilisée, les autres variantes gratuites sont grisées ; une fois les actions prévues jouées, les variantes en action aussi.
- Actions exclusives (Fuir) : seulement si rien d'autre n'a été fait ce tour et sans actions multiples ; ensuite, tout est grisé.
- Bouton « Déclarer » pour Attaquer, Épreuve, Soutien et Pouvoir : compte l'action et rappelle le malus à reporter dans la fenêtre de jet.
- Bonus de vitesse déplacé dans la carte « Changer de position ».
- Réglages MJ : réinitialiser le tour d'un participant.
- Détection de la carte de poursuite : marge proportionnelle à la taille du jeton (un véhicule 2 × 2 ou 3 × 3 peut déborder de sa carte) ; carte retenue = la plus proche du centre du jeton.

## 0.1.1 — 16/11/2026

- Correction : erreur `reading 'style'` à la première ouverture du panneau (taille passée au rendu au lieu de `setPosition` sur une fenêtre pas encore rendue).

## 0.1.0 — 15/11/2026

Première version.

- Panneau de poursuite partagé (bouton « Poursuite » du suivi de combat) : chaque joueur voit ses participants, le MJ voit tout.
- Actions possibles regroupées (se déplacer, gêner un adversaire, se protéger, actions habituelles), avec cadence, effet, raison d'indisponibilité et explication de la règle (bouton « ? »).
- Garde-fous : Changer de position et Lever le pied une fois par tour, Se dérober une fois par round, Fuir à partir de 4 cartes d'écart, Repousser / Éperonner / Aborder seulement sur la même carte, équipage PNJ sans Soutien ni Épreuve.
- Lecture de la piste posée avec Complete Card Management : ordre des cartes, rattachement des jetons, écarts, Portée.
- Jeton hors piste : le MJ choisit entre hors poursuite, Soutien et Épreuve seulement, ou laisser.
- Complication au trèfle : message de chat avec l'enseigne de la carte de poursuite, le modificateur, la conséquence, le jet et le résultat ; Échec critique tiré et appliqué (Fatigue) ; Pertes de contrôle via swade-vehicle pour un véhicule.
- Jets natifs SWADE ou SWADE Tools (réglage).
