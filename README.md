# Sentinelle Simulator

## Table des matières

- [Vue d'ensemble du projet](#vue-densemble-du-projet)
- [Architecture générale](#architecture-générale)
- [Sous-projets](#sous-projets)
- [Ce que fait le simulateur](#ce-que-fait-le-simulateur)
- [Architecture du simulateur](#architecture-du-simulateur)
- [Hiérarchie du code](#hiérarchie-du-code)
- [Installation](#installation)
- [Lancement recommandé](#lancement-recommandé)
- [Scripts](#scripts)
- [Important](#important)
- [Utilisation avec l'app](#utilisation-avec-lapp)
- [Logs attendus](#logs-attendus)
- [Portabilité](#portabilité)

Simulateur BLE local pour tester `dtn-sentinel`.

## Vue d'ensemble du projet

Le projet complet contient deux parties :

- `dtn-sentinel/` : l'application mobile Android
- `sentinelle-simulator/` : le simulateur local qui imite une vraie sentinelle Bluetooth

Le fonctionnement général est le suivant :

1. le simulateur affiche un QR code
2. l'application scanne ce QR code
3. le téléphone se connecte en `BLE` (Bluetooth Low Energy) au simulateur
4. le simulateur envoie un paquet `pending`, c'est-à-dire un ancien paquet stocké d'avance
5. il envoie ensuite des paquets `live`, c'est-à-dire des mesures en direct
6. l'application répond avec un `ACK`, c'est-à-dire une confirmation de réception

## Architecture générale

```text
┌──────────────────────┐        BLE         ┌────────────────────────┐
│ dtn-sentinel         │ <────────────────> │ sentinelle-simulator   │
│ App Android          │                    │ Sentinelle simulée     │
└──────────┬───────────┘                    └────────────┬───────────┘
           │                                             │
           │ QR code                                     │
           └─────────────────────────────────────────────┘

           │
           │ HTTP / Sync quand réseau disponible
           v
┌──────────────────────┐
│ Cloud API            │
│ serveur prévu        │
└──────────────────────┘
```

Ici :

- le simulateur remplace une vraie sentinelle
- le QR code permet à l'app de connaître son identité
- le BLE sert au transfert des données
- le cloud n'est pas géré par ce dossier, mais fait partie du projet global

## Sous-projets

```text
IotPaulSab/
├── dtn-sentinel/          # application mobile
└── sentinelle-simulator/  # simulateur BLE local
```

Ce README documente surtout `sentinelle-simulator`, mais il contient aussi les
informations générales utiles pour comprendre tout le projet.

## Ce que fait le simulateur

Ce dossier sert à simuler une vraie sentinelle BLE :

- il affiche un QR code d'appairage
- il expose les caractéristiques `GATT`, c'est-à-dire les points de lecture/écriture BLE attendus par l'app
- il envoie un paquet `pending`
- il pousse ensuite des paquets `live`

## Architecture du simulateur

```text
index.js
  │
  ├── construit le payload QR
  ├── affiche le QR dans le terminal
  └── startPeripheral()
         │
         v
   ble-peripheral.js
         │
         ├── SENTINEL_INFO   # identité sentinelle
         ├── ENV_DATA        # paquets live
         ├── PENDING_DATA    # paquet DTN précédent
         └── ACK             # confirmation reçue du téléphone
                │
                v
         data-generator.js   # contenu JSON des paquets
```

## Hiérarchie du code

```text
sentinelle-simulator/
├── README.md
├── index.js                  # point d'entrée Node, QR et démarrage
├── ble-peripheral.js         # service GATT simulé
├── data-generator.js         # génération des paquets et métadonnées
├── sentinelle-simulator.py   # variante Python
├── package.json              # scripts npm
└── requirements.txt          # dépendances Python
```

À quoi sert chaque fichier :

- `index.js` : démarre le simulateur et affiche le QR code
- `ble-peripheral.js` : crée le faux périphérique BLE
- `data-generator.js` : fabrique les données envoyées
- `sentinelle-simulator.py` : version Python du simulateur
- `package.json` : commandes pour lancer le projet

## Installation

```bash
cd /Users/pierrehanna/IotPaulSab/sentinelle-simulator
npm install
```

## Lancement recommandé

```bash
npm run start:node
```

C'est la méthode recommandée pour tester avec l'app Android.

## Scripts

```bash
npm run start:node
npm start
npm run setup
```

- `npm run start:node` : simulateur Node.js
- `npm start` : variante Python
- `npm run setup` : setup Python

## Important

- les paquets ont été compactés pour rester compatibles avec le flux BLE Android testé
- la variante Python utilise `.venv/bin/python3`

En clair :

- utilise `npm run start:node`
- n'utilise la version Python que si tu sais pourquoi tu en as besoin

## Utilisation avec l'app

1. lancer le simulateur :

```bash
npm run start:node
```

2. lancer Metro dans `dtn-sentinel`
3. ouvrir le dev build Android
4. appairer par QR
5. signer le contrat

En clair :

- le simulateur affiche un QR code
- l'app scanne ce QR code
- ensuite l'app se connecte au faux capteur BLE

## Logs attendus

- advertising démarré
- services GATT configurés
- lecture de `PENDING_DATA`
- ACK reçu
- souscription aux données enviro
- notifications live

## Portabilité

- macOS : recommandé
- Windows : oui avec le lancement recommandé en Node.js
- Linux : à valider selon la machine et le Bluetooth disponible

Pour le projet complet :

- l'app Android peut être développée sur plusieurs systèmes
- le simulateur local peut aussi être lancé sur Windows en suivant le chemin Node.js

### Utilisation sur Windows

Pour Windows, le chemin recommandé est d'utiliser la version Node.js du simulateur.

Commandes PowerShell :

```powershell
cd C:\chemin\vers\IotPaulSab\sentinelle-simulator
npm install
npm run start:node
```

Si tu veux lancer la version Python sur Windows, utilise les commandes Windows du venv :

```powershell
cd C:\chemin\vers\IotPaulSab\sentinelle-simulator
py -3 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python.exe sentinelle-simulator.py
```

À retenir :

- sur Windows, la méthode à utiliser en premier est `npm run start:node`
- la version Python peut aussi être lancée avec les commandes Windows ci-dessus
