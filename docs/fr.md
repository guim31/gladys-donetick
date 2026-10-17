# Donetick

Retrouvez les corvées de votre [Donetick](https://donetick.com) dans Gladys :
ce qu'il reste à faire aujourd'hui, ce qui est en retard, qui fait quoi. Un
appui sur le tableau de bord marque une tâche comme faite, une scène relance
celui qui est en retard, une autre réagit quand les poubelles sont sorties.

> **Vos retours sont les bienvenus.** Cette intégration a été testée contre un
> vrai serveur Donetick (image Docker `donetick/donetick`, octobre 2026), pas
> encore au quotidien. Si quelque chose ne fonctionne pas comme décrit,
> dites-le sur le [forum Gladys](https://community.gladysassistant.com) ou dans
> les [issues](https://github.com/guim31/gladys-donetick/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un **Donetick auto-hébergé**, joignable depuis Gladys (l'image Docker écoute
  sur le port 2021).
- Un **jeton d'accès** d'un utilisateur Donetick. Dans Donetick : **Settings**
  → **Access tokens** → **Generate new token**, donnez-lui un nom (`Gladys`) et
  copiez le jeton, qui commence par `dt_` : Donetick ne l'affiche qu'une fois.

L'intégration voit les tâches que voit cet utilisateur (tout le cercle, sauf
les tâches privées des autres membres) et marque les tâches comme faites **en
son nom**. Choisissez un utilisateur administrateur ou gestionnaire du cercle
si l'action de scène ou le widget doivent valider des tâches assignées à
quelqu'un d'autre.

## Installation

1. Dans Gladys, **Intégrations** → installez **Donetick**.
2. Dans l'écran **Configuration**, renseignez :
   - **Adresse** : l'adresse de Donetick, par exemple
     `http://192.168.1.20:2021`, ou `https://corvees.example.org` derrière un
     proxy inverse (un préfixe de chemin comme `/donetick` est conservé) ;
   - **Jeton d'accès** : le jeton `dt_…`.
3. Options :
   - **Un appareil par membre** (activé par défaut) : en plus de l'appareil du
     foyer, un appareil par membre du cercle, pour les tâches qui lui sont
     assignées ;
   - **Accepter les certificats auto-signés** : pour une adresse en `https://`
     avec un certificat auto-signé, sur votre propre serveur seulement ;
   - **Intervalle de rafraîchissement** : de 1 à 10 minutes (2 par défaut).
     Les échéances et minuit sont toujours suivis à l'heure, quel que soit
     l'intervalle ;
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités à l'ajout d'un appareil (français par défaut), et les
     textes envoyés aux scènes.
4. Enregistrez, puis **Tester la connexion** : l'intégration lit Donetick et
   donne le nombre de tâches actives et de membres.
5. Dans l'onglet **Découverte**, ajoutez les appareils voulus.

## Appareils

**Donetick** (le foyer) et, avec l'option, **Donetick _membre_** pour chaque
membre du cercle. Chacun a quatre fonctionnalités :

| Fonctionnalité               | Ce qu'elle indique                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `Tâches à faire aujourd'hui` | les tâches actives dues avant minuit, celles en retard comprises : ce qu'il reste à faire ce soir  |
| `Tâches en retard`           | les tâches actives dont l'échéance est passée                                                      |
| `Tâches faites aujourd'hui`  | les réalisations enregistrées aujourd'hui (une tâche passée ne compte pas)                         |
| `Prochaine tâche`            | le nom de la tâche à l'échéance la plus proche, les retards d'abord ; `Aucune` quand il n'y a rien |

Sur un appareil de membre, les compteurs ne prennent que les tâches qui lui
sont **assignées**, et `Tâches faites aujourd'hui` celles qu'**il** a faites.
Les tâches sans échéance n'entrent dans aucun compteur. « Aujourd'hui » est la
journée dans le fuseau horaire de Gladys.

## Tableau de bord

Le widget **Tâches du jour** montre deux tuiles (à faire, en retard), la liste
des tâches du jour, en retard d'abord, avec leur heure et la personne
assignée, et un bouton pour chacune des quatre plus urgentes : un appui marque
la tâche comme faite. Choisissez un appareil de membre dans les réglages du
widget pour ne voir que ses tâches ; laissez vide pour tout le foyer. Quand il
ne reste rien, le widget le dit et donne la prochaine tâche.

Les compteurs peuvent aussi aller sur le tableau de bord comme toute
fonctionnalité d'appareil.

## Scènes

### Déclencheurs

- **Tâche Donetick en retard** : une tâche a dépassé son échéance sans être
  faite, une fois par échéance (une tâche toujours en retard le lendemain ne
  déclenche pas de nouveau ; son occurrence suivante, si). Filtres : le membre
  assigné (un appareil de membre), le nom de la tâche. Informations transmises
  aux actions : la tâche, son numéro, la personne assignée, l'échéance.
- **Tâche Donetick faite** : une tâche a été marquée comme faite, dans Donetick
  ou depuis Gladys. Filtres : qui l'a faite (un appareil de membre), le nom de
  la tâche. Informations : la tâche, son numéro, qui l'a faite, et si elle a
  été faite à temps, et si elle a été marquée faite depuis Gladys (une scène
  qui marque des tâches comme faites peut ainsi ignorer les siennes, sans
  jamais boucler).

Ce qui est déjà en retard ou fait au premier démarrage de l'intégration est
connu, pas nouveau : rien ne se déclenche pour cela. Un redémarrage n'annonce
pas deux fois une tâche, et une tâche passée en retard pendant que
l'intégration était arrêtée est annoncée à son redémarrage.

### Actions

- **Marquer une tâche Donetick comme faite** : marque une tâche comme faite
  maintenant, au nom de l'utilisateur du jeton d'accès. Indiquez le **nom** de
  la tâche tel qu'écrit dans Donetick (majuscules et accents ignorés) ou son
  **numéro** (`#12`, le numéro dans l'adresse de la page de la tâche dans
  Donetick). Le champ accepte les variables de scène. Résultats pour les étapes
  suivantes : la tâche, son numéro, si elle attend une validation, sa prochaine
  échéance. Une tâche qui exige une validation est envoyée pour validation,
  comme dans Donetick.

### Idées de scènes

- À 20 h, si `Tâches à faire aujourd'hui` d'un membre est supérieur à 0, lui
  envoyer un message.
- Un tag NFC ou un bouton près des poubelles lance **Marquer une tâche
  Donetick comme faite** avec `Sortir les poubelles`.
- **Tâche Donetick en retard** avec le filtre de membre : prévenir ce membre
  sur Telegram, avec la tâche dans le message.
- **Tâche Donetick faite** sur `Arroser les plantes` : couper le robinet du
  jardin.

## Dépannage

- **« Donetick ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys (`http://<adresse>:2021` ouvre Donetick dans un
  navigateur).
- **« Jeton d'API refusé »** : le jeton a été supprimé ou mal recopié. Créez-en
  un nouveau dans Donetick (Settings → Access tokens).
- **« Aucune API Donetick à cette adresse »** : l'adresse répond, mais pas avec
  l'API de Donetick : vérifiez le port, ou le préfixe de chemin derrière un
  proxy inverse.
- **« L'adresse redirige »** : saisissez l'adresse en `https://`.
- **« L'utilisateur du jeton n'est pas assigné à cette tâche »** : Donetick ne
  laisse valider une tâche qu'aux personnes assignées (ou à un administrateur
  ou gestionnaire du cercle). Utilisez le jeton d'un administrateur, ou
  assignez la tâche à l'utilisateur du jeton.
- **« Pas encore dans sa période de réalisation »** : la tâche a une fenêtre de
  réalisation dans Donetick et ne peut pas être faite si tôt.
- **Une tâche manque** : les tâches archivées et les tâches privées des autres
  membres ne sont pas visibles pour l'utilisateur du jeton.
- Logs : `LOG_LEVEL=debug` sur le conteneur montre chaque lecture.

## Limites

- Donetick est lu toutes les 1 à 10 minutes (et à chaque échéance et à
  minuit) : une tâche faite dans Donetick apparaît dans Gladys dans ce délai.
- L'intégration lit les tâches et les marque comme faites, rien de plus : elle
  ne crée, ne modifie, ne passe ni n'assigne aucune tâche.
- Testée avec le Donetick auto-hébergé d'octobre 2026. Le cloud donetick.com
  devrait accepter le même jeton sur l'adresse de son API, mais ce n'est pas
  testé.
- Gladys ne garde aucune donnée Donetick hormis `/data/donetick-state.json`
  (les tâches déjà annoncées aux scènes).
- Donetick a sa propre limite de requêtes (300 par minute par défaut) :
  l'intégration fait deux ou trois requêtes par lecture.
- Une tâche en attente de validation s'affiche _À valider_ dans le widget,
  sans bouton. Un bouton du widget refuse une tâche déjà faite entre-temps.
- Une tâche unique faite pendant que l'intégration est arrêtée est annoncée
  par son numéro (`#12`), son nom ayant quitté la liste de Donetick.
- Sans lien avec Donetick.
