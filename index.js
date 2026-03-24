/**
 * DTN Sentinel Simulator — point d'entrée
 *
 * Lance un serveur BLE GATT qui simule une sentinelle environnementale,
 * puis affiche un QR code dans le terminal pour l'appairage avec l'app mobile.
 *
 * Usage :
 *   npm install
 *   npm start
 *
 * Variables d'environnement :
 *   SENTINEL_ID   — identifiant unique (défaut : sim-sentinel-001)
 *   SENTINEL_NAME — nom affiché (défaut : DTN-Sentinel-Sim)
 */

'use strict';

const os          = require('os');
const qrTerminal  = require('qrcode-terminal');
const { startPeripheral }                         = require('./ble-peripheral');
const { SENTINEL_ID, SENTINEL_NAME, PUB_KEY }     = require('./data-generator');

// ---------------------------------------------------------------------------
// Récupère la première adresse MAC non-loopback de la machine.
// Sur macOS, utilisée comme bleMAC dans le QR payload.
// ---------------------------------------------------------------------------
function getMacAddress() {
  const ifaces = os.networkInterfaces();
  for (const ifaceList of Object.values(ifaces)) {
    for (const iface of ifaceList) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac.toUpperCase();
      }
    }
  }
  return 'SIM:00:00:00:00:01';
}

// ---------------------------------------------------------------------------
// Payload encodé dans le QR code — doit respecter l'interface QRPayload
// définie dans dtn-sentinel/src/utils/qr.utils.ts
// ---------------------------------------------------------------------------
const qrPayload = JSON.stringify({
  sentinelId: SENTINEL_ID,
  bleMAC:     getMacAddress(),
  name:       SENTINEL_NAME,
  pubKey:     PUB_KEY,
  timestamp:  Date.now(),
});

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║       DTN Sentinel Simulator  v1.0           ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log(`  Sentinelle : ${SENTINEL_NAME}`);
console.log(`  ID         : ${SENTINEL_ID}`);
console.log(`  Pub key    : ${PUB_KEY}`);
console.log(`  MAC        : ${getMacAddress()}`);
console.log('');
console.log('  Scannez ce QR code depuis l\'application mobile :');
console.log('');

qrTerminal.generate(qrPayload, { small: true });

console.log('');
console.log('  Payload QR :');
console.log(' ', qrPayload);
console.log('');
console.log('  Démarrage BLE GATT peripheral...');
console.log('  (Ctrl+C pour arrêter)');
console.log('');

// ---------------------------------------------------------------------------
// Démarrage du serveur BLE
// ---------------------------------------------------------------------------
startPeripheral();

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n[SIM] Arrêt propre...');
  process.exit(0);
});
