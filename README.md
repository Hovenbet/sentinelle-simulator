# Sentinelle Simulator

## Table des matières

- [But](#but)
- [Architecture](#architecture)
- [Hiérarchie du code](#hiérarchie-du-code)
- [Installation](#installation)
- [Lancement recommandé](#lancement-recommandé)
- [Scripts](#scripts)
- [Important](#important)
- [Utilisation avec l'app](#utilisation-avec-lapp)
- [Logs attendus](#logs-attendus)
- [Portabilité](#portabilité)

Simulateur BLE local pour tester `dtn-sentinel`.

## But

Ce dossier sert à simuler une vraie sentinelle BLE :

- il affiche un QR code d'appairage
- il expose les caractéristiques GATT attendues par l'app
- il envoie un paquet `pending`
- il pousse ensuite des paquets live

## Architecture

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

- `index.js` : lance le simulateur
- `ble-peripheral.js` : implémente le périphérique BLE
- `data-generator.js` : définit les paquets envoyés
- `sentinelle-simulator.py` : alternative Python
- `package.json` : commandes de lancement

## Installation

```bash
cd /Users/pierrehanna/IotPaulSab/sentinelle-simulator
npm install
```

## Lancement recommandé

```bash
npm run start:node
```

C'est le chemin utilisé pour les tests Android du projet.

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
- donc la variante Python n'est pas compatible Windows telle quelle

## Utilisation avec l'app

1. lancer le simulateur :

```bash
npm run start:node
```

2. lancer Metro dans `dtn-sentinel`
3. ouvrir le dev build Android
4. appairer par QR
5. signer le contrat

## Logs attendus

- advertising démarré
- services GATT configurés
- lecture de `PENDING_DATA`
- ACK reçu
- souscription aux données enviro
- notifications live

## Portabilité

- macOS : recommandé
- Windows : non prêt simplement
- Linux : non validé
