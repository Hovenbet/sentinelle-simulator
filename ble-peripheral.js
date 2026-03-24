/**
 * Serveur BLE GATT simulant une sentinelle environnementale DTN.
 * Expose les mêmes UUIDs que l'application mobile dtn-sentinel.
 *
 * Services et caractéristiques exposés :
 *   DTN_SERVICE  (6E400001) — service principal
 *     ├─ SENTINEL_INFO (6E400002) — read  : métadonnées JSON de la sentinelle
 *     ├─ ENV_DATA      (6E400003) — notify + read : paquets EnvPacket live
 *     ├─ PENDING_DATA  (6E400004) — read  : paquets DTN d'utilisateurs précédents
 *     └─ ACK           (6E400005) — write : accusé de réception des paquets
 */

'use strict';

const bleno = require('@abandonware/bleno');
const { generatePacket, generatePendingPackets, SENTINEL_ID, SENTINEL_NAME, PUB_KEY } =
  require('./data-generator');

// UUIDs sans tirets (format attendu par bleno)
const SERVICE_UUID       = '6E400001B5A3F393E0A9E50E24DCCA9E';
const SENTINEL_INFO_UUID = '6E400002B5A3F393E0A9E50E24DCCA9E';
const ENV_DATA_UUID      = '6E400003B5A3F393E0A9E50E24DCCA9E';
const PENDING_DATA_UUID  = '6E400004B5A3F393E0A9E50E24DCCA9E';
const ACK_UUID           = '6E400005B5A3F393E0A9E50E24DCCA9E';

/** Intervalle d'émission de données live (ms) — identique à BLE_MOCK_EMIT_INTERVAL_MS */
const EMIT_INTERVAL_MS = 3_000;

// ---------------------------------------------------------------------------
// Caractéristique SENTINEL_INFO — read
// Retourne les métadonnées de la sentinelle encodées en UTF-8 JSON.
// ---------------------------------------------------------------------------
const sentinelInfoChar = new bleno.Characteristic({
  uuid: SENTINEL_INFO_UUID,
  properties: ['read'],
  /**
   * @param {number} offset
   * @param {function} callback
   */
  onReadRequest(offset, callback) {
    const info = JSON.stringify({ sentinelId: SENTINEL_ID, name: SENTINEL_NAME, pubKey: PUB_KEY });
    const data = Buffer.from(info, 'utf8');
    callback(bleno.Characteristic.RESULT_SUCCESS, data.slice(offset));
  },
});

// ---------------------------------------------------------------------------
// Caractéristique ENV_DATA — notify + read
// Émet un EnvPacket JSON toutes les EMIT_INTERVAL_MS ms quand un client souscrit.
// ---------------------------------------------------------------------------
class EnvDataCharacteristic extends bleno.Characteristic {
  constructor() {
    super({ uuid: ENV_DATA_UUID, properties: ['notify', 'read'] });
    this._notifyCallback = null;
    this._timer          = null;
    /** Cache du paquet en cours de lecture (Long Read ATT multi-offset) */
    this._readCache      = null;
  }

  /**
   * Lecture ponctuelle ou Long Read (multi-offset).
   * Pour les Long Reads (offset > 0), le même paquet est servi à chaque chunk.
   * Un nouveau paquet est généré uniquement quand offset === 0.
   */
  onReadRequest(offset, callback) {
    if (offset === 0 || this._readCache === null) {
      const packet     = generatePacket();
      this._readCache  = Buffer.from(JSON.stringify(packet), 'utf8');
      console.log(
        `[BLE] Read ENV_DATA — T=${packet.sensors.temperature}°C  ` +
        `H=${packet.sensors.humidity}%  P=${packet.sensors.pressure}hPa  ` +
        `(${this._readCache.length} bytes)`
      );
    }
    callback(bleno.Characteristic.RESULT_SUCCESS, this._readCache.slice(offset));
  }

  /** Début des notifications : démarre l'émission périodique */
  onSubscribe(_maxValueSize, updateValueCallback) {
    console.log('[BLE] Client souscrit aux données enviro');
    this._notifyCallback = updateValueCallback;
    this._timer = setInterval(() => {
      const packet = generatePacket();
      const data   = Buffer.from(JSON.stringify(packet), 'utf8');
      console.log(
        `[BLE] Notification — T=${packet.sensors.temperature}°C  ` +
        `H=${packet.sensors.humidity}%  P=${packet.sensors.pressure}hPa`
      );
      if (this._notifyCallback) {
        this._notifyCallback(data);
      }
    }, EMIT_INTERVAL_MS);
  }

  /** Fin des notifications : arrête le timer */
  onUnsubscribe() {
    console.log('[BLE] Client désouscrit');
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._notifyCallback = null;
  }
}

// ---------------------------------------------------------------------------
// Caractéristique PENDING_DATA — read
// Retourne un tableau JSON d'EnvPackets simulant le buffer DTN d'un user précédent.
// ---------------------------------------------------------------------------
const pendingDataChar = new bleno.Characteristic({
  uuid: PENDING_DATA_UUID,
  properties: ['read'],
  onReadRequest(offset, callback) {
    const packets = generatePendingPackets();
    const data    = Buffer.from(JSON.stringify(packets), 'utf8');
    console.log(`[BLE] downloadPendingData — envoi de ${packets.length} paquets DTN`);
    callback(bleno.Characteristic.RESULT_SUCCESS, data.slice(offset));
  },
});

// ---------------------------------------------------------------------------
// Caractéristique ACK — write
// Reçoit un tableau JSON d'IDs de paquets confirmés par le téléphone.
// ---------------------------------------------------------------------------
const ackChar = new bleno.Characteristic({
  uuid: ACK_UUID,
  properties: ['write'],
  onWriteRequest(data, _offset, _withoutResponse, callback) {
    try {
      const ids = JSON.parse(data.toString('utf8'));
      console.log(`[BLE] ACK reçu — ${ids.length} paquets confirmés :`, ids);
    } catch (e) {
      console.warn('[BLE] ACK invalide :', e.message);
    }
    callback(bleno.Characteristic.RESULT_SUCCESS);
  },
});

// ---------------------------------------------------------------------------
// Service principal DTN
// ---------------------------------------------------------------------------
const envDataChar = new EnvDataCharacteristic();

const dtnService = new bleno.PrimaryService({
  uuid:            SERVICE_UUID,
  characteristics: [sentinelInfoChar, envDataChar, pendingDataChar, ackChar],
});

/**
 * Démarre le serveur BLE GATT.
 * Écoute les changements d'état Bluetooth et lance l'advertising dès que prêt.
 */
function startPeripheral() {
  bleno.on('stateChange', (state) => {
    console.log('[BLE] État Bluetooth :', state);
    if (state === 'poweredOn') {
      bleno.startAdvertising(SENTINEL_NAME, [SERVICE_UUID], (err) => {
        if (err) {
          console.error('[BLE] Erreur advertising :', err);
        } else {
          console.log(`[BLE] Advertising démarré — nom : "${SENTINEL_NAME}"`);
        }
      });
    } else {
      bleno.stopAdvertising();
    }
  });

  bleno.on('advertisingStart', (error) => {
    if (error) {
      console.error('[BLE] advertisingStart error :', error);
      return;
    }
    bleno.setServices([dtnService], (err) => {
      if (err) {
        console.error('[BLE] setServices error :', err);
      } else {
        console.log('[BLE] Services GATT configurés — prêt pour les connexions');
      }
    });
  });

  bleno.on('accept', (clientAddress) => {
    console.log('[BLE] Connexion acceptée depuis :', clientAddress);
  });

  bleno.on('disconnect', (clientAddress) => {
    console.log('[BLE] Déconnexion :', clientAddress);
  });
}

module.exports = { startPeripheral };
