/**
 * Générateur de données capteurs fictives pour le simulateur de sentinelle.
 * Reproduit le format EnvPacket attendu par l'app mobile, avec un payload
 * volontairement compact pour rester fiable sur le lien BLE du dev build.
 * La signature SHA-256 est calculée de manière identique à SignatureService.ts :
 *   SHA-256(sentinelId + String(timestamp) + JSON.stringify(sensors))
 */

'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const SENTINEL_ID   = process.env.SENTINEL_ID   || 'sim-sentinel-001';
const SENTINEL_NAME = process.env.SENTINEL_NAME || 'DTN-Sentinel-Sim';
const PUB_KEY       = 'sim-pubkey-' + SENTINEL_ID;

/**
 * Retourne un nombre aléatoire entre min et max avec dec décimales.
 */
function rnd(min, max, dec) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dec));
}

/**
 * Calcule SHA-256(sentinelId + String(timestamp) + JSON.stringify(sensors)).
 * Doit correspondre exactement à SignatureService.signPacket() de l'app mobile.
 * @param {object} partial - Objet partiel EnvPacket
 * @returns {string} Signature hexadécimale SHA-256
 */
function signPacket(partial) {
  const payload =
    partial.sentinelId +
    String(partial.timestamp) +
    JSON.stringify(partial.sensors);
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Génère un EnvPacket avec des valeurs aléatoires réalistes et une signature valide.
 * @param {string} [sentinelId] - ID de la sentinelle (défaut : SENTINEL_ID)
 * @param {number} [timestamp]  - Timestamp Unix ms (défaut : Date.now())
 * @returns {object} EnvPacket complet
 */
function generatePacket(sentinelId = SENTINEL_ID, timestamp = Date.now()) {
  // On limite volontairement le payload à l'environnement (T/H/P) :
  // les paquets complets dépassaient la taille utile du lien BLE et n'étaient
  // pas décodés de manière fiable côté Android dans le dev build.
  const sensors = {
    temperature: rnd(15, 30, 1),
    humidity:    rnd(40, 80, 1),
    pressure:    rnd(1000, 1030, 1),
  };

  const partial = {
    sentinelId,
    source: 'BLE',
    timestamp,
    receivedAt: timestamp,
    sensors,
  };

  const signature = signPacket(partial);

  return {
    id:             uuidv4(),
    sentinelId,
    source:         'BLE',
    timestamp,
    receivedAt:     timestamp,
    sensors,
    signature,
    synced:         false,
    isPreviousUser: false,
  };
}

/**
 * Génère 1 paquet ancien simulant le buffer DTN d'un utilisateur précédent.
 * On garde un tableau JSON pour rester compatible avec l'app, mais on limite
 * volontairement sa taille pour rester sous une taille BLE fiable.
 * @param {string} [sentinelId] - ID de la sentinelle
 * @returns {object[]} Tableau d'EnvPackets marqués isPreviousUser: true
 */
function generatePendingPackets(sentinelId = SENTINEL_ID) {
  const count = 1;
  const packets = [];
  for (let i = 0; i < count; i++) {
    const pastTimestamp = Date.now() - (i + 1) * 60_000; // 1–3 minutes dans le passé
    const packet = generatePacket(`PREV-USER-${sentinelId}`, pastTimestamp);
    packet.isPreviousUser = true;
    packets.push(packet);
  }
  return packets;
}

module.exports = { generatePacket, generatePendingPackets, SENTINEL_ID, SENTINEL_NAME, PUB_KEY };
