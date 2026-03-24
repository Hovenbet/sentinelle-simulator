#!/usr/bin/env python3
"""
DTN Sentinel Simulator — version Python (macOS / Linux)

Simule une sentinelle BLE DTN pour l'application dtn-sentinel.
Expose les mêmes UUIDs GATT que ble.constants.ts.

Usage :
    pip3 install bless qrcode
    python3 sentinelle-simulator.py

Variables d'environnement :
    SENTINEL_ID   — identifiant (défaut : sim-sentinel-001)
    SENTINEL_NAME — nom BLE affiché (défaut : DTN-Sentinel-Sim)
"""

import asyncio
import hashlib
import json
import os
import random
import time
import uuid as uuid_module

try:
    from bless import (
        BlessServer,
        BlessGATTCharacteristic,
        GATTCharacteristicProperties,
        GATTAttributePermissions,
    )
except ImportError:
    print("\n[ERREUR] Dépendances manquantes. Exécutez :")
    print("    pip3 install bless qrcode\n")
    raise SystemExit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SENTINEL_ID   = os.environ.get("SENTINEL_ID",   "sim-sentinel-001")
SENTINEL_NAME = os.environ.get("SENTINEL_NAME", "DTN-Sentinel-Sim")
PUB_KEY       = f"sim-pubkey-{SENTINEL_ID}"
EMIT_INTERVAL = 3.0  # secondes entre chaque notification

# UUIDs — identiques à dtn-sentinel/src/constants/ble.constants.ts
SERVICE_UUID       = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
SENTINEL_INFO_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
ENV_DATA_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
PENDING_DATA_UUID  = "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
ACK_UUID           = "6e400005-b5a3-f393-e0a9-e50e24dcca9e"

# ---------------------------------------------------------------------------
# Génération de données
# ---------------------------------------------------------------------------

def _rnd(mn: float, mx: float, dec: int) -> float:
    return round(random.uniform(mn, mx), dec)


def _to_js_numbers(obj):
    """
    Convertit les floats entiers en int pour correspondre à JSON.stringify de JavaScript.
    Ex : 60.0 (Python) → 60 (JS) afin que SHA-256 produise la même signature.
    """
    if isinstance(obj, float) and obj.is_integer():
        return int(obj)
    if isinstance(obj, dict):
        return {k: _to_js_numbers(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_js_numbers(v) for v in obj]
    return obj


def _sign_packet(partial: dict) -> str:
    """
    SHA-256(sentinelId + str(timestamp) + JSON.stringify(sensors))
    Identique à SignatureService.signPacket() de l'app mobile.
    """
    sensors_js = _to_js_numbers(partial["sensors"])
    payload = (
        partial["sentinelId"]
        + str(partial["timestamp"])
        + json.dumps(sensors_js, separators=(",", ":"), ensure_ascii=False)
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def generate_packet(sentinel_id: str = SENTINEL_ID, ts: int | None = None) -> dict:
    """Génère un EnvPacket compact compatible avec le transport BLE mobile."""
    ts = ts if ts is not None else int(time.time() * 1000)
    # Payload volontairement compact : les paquets complets dépassaient la taille
    # utile du lien BLE et n'étaient pas décodés de manière fiable côté Android.
    sensors = {
        "temperature": _rnd(15, 30, 1),
        "humidity":    _rnd(40, 80, 1),
        "pressure":    _rnd(1000, 1030, 1),
    }
    partial = {
        "sentinelId": sentinel_id,
        "source":     "BLE",
        "timestamp":  ts,
        "receivedAt": ts,
        "sensors":    sensors,
    }
    return {
        "id":             str(uuid_module.uuid4()),
        "sentinelId":     sentinel_id,
        "source":         "BLE",
        "timestamp":      ts,
        "receivedAt":     ts,
        "sensors":        sensors,
        "signature":      _sign_packet(partial),
        "synced":         False,
        "isPreviousUser": False,
    }


def generate_pending_packets() -> list:
    """1 paquet ancien simulant le buffer DTN d'un utilisateur précédent."""
    count = 1
    now   = int(time.time() * 1000)
    packets = []
    for i in range(count):
        ts = now - (i + 1) * 60_000
        p  = generate_packet(f"PREV-USER-{SENTINEL_ID}", ts)
        p["isPreviousUser"] = True
        packets.append(p)
    return packets

# ---------------------------------------------------------------------------
# Handlers BLE (lecture / écriture des caractéristiques)
# ---------------------------------------------------------------------------

def _read_handler(characteristic: BlessGATTCharacteristic, **_) -> bytearray:
    uid = str(characteristic.uuid).lower()

    if uid == SENTINEL_INFO_UUID:
        info = json.dumps({"sentinelId": SENTINEL_ID, "name": SENTINEL_NAME, "pubKey": PUB_KEY})
        return bytearray(info.encode("utf-8"))

    if uid == ENV_DATA_UUID:
        packet = generate_packet()
        return bytearray(json.dumps(packet).encode("utf-8"))

    if uid == PENDING_DATA_UUID:
        packets = generate_pending_packets()
        print(f"[BLE] downloadPendingData — {len(packets)} paquets DTN envoyés")
        return bytearray(json.dumps(packets).encode("utf-8"))

    return bytearray()


def _write_handler(characteristic: BlessGATTCharacteristic, value: bytearray, **_) -> None:
    uid = str(characteristic.uuid).lower()
    if uid == ACK_UUID:
        try:
            ids = json.loads(bytes(value).decode("utf-8"))
            print(f"[BLE] ACK reçu — {len(ids)} paquets confirmés : {ids}")
        except Exception as e:
            print(f"[BLE] ACK invalide : {e}")

# ---------------------------------------------------------------------------
# Affichage QR code terminal
# ---------------------------------------------------------------------------

def _get_mac() -> str:
    """Retourne une adresse MAC lisible (heuristique multi-plateforme)."""
    try:
        raw = uuid_module.uuid1().bytes
        return ":".join(f"{b:02X}" for b in raw[10:16])
    except Exception:
        return "SIM:00:00:00:00:01"


def _display_qr(payload: str) -> None:
    print("\n  Scannez ce QR code avec l'application mobile :\n")
    try:
        import qrcode as qrlib  # type: ignore
        qr = qrlib.QRCode(border=1)
        qr.add_data(payload)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
    except ImportError:
        print("  (pip3 install qrcode pour afficher le QR code)")
    print(f"\n  Payload JSON : {payload}\n")

# ---------------------------------------------------------------------------
# Boucle principale
# ---------------------------------------------------------------------------

async def main() -> None:
    mac = _get_mac()

    qr_payload = json.dumps({
        "sentinelId": SENTINEL_ID,
        "bleMAC":     mac,
        "name":       SENTINEL_NAME,
        "pubKey":     PUB_KEY,
        "timestamp":  int(time.time() * 1000),
    })

    print()
    print("╔══════════════════════════════════════════════╗")
    print("║       DTN Sentinel Simulator  v1.0 (Python)  ║")
    print("╚══════════════════════════════════════════════╝")
    print(f"\n  Sentinelle : {SENTINEL_NAME}")
    print(f"  ID         : {SENTINEL_ID}")
    print(f"  Pub key    : {PUB_KEY}")
    print(f"  MAC        : {mac}")
    _display_qr(qr_payload)
    print("  Démarrage BLE GATT peripheral...")
    print("  (Ctrl+C pour arrêter)\n")

    loop = asyncio.get_event_loop()
    server = BlessServer(name=SENTINEL_NAME, loop=loop)
    server.read_request_func  = _read_handler
    server.write_request_func = _write_handler

    # Déclaration du service
    await server.add_new_service(SERVICE_UUID)

    # SENTINEL_INFO — read
    await server.add_new_characteristic(
        SERVICE_UUID, SENTINEL_INFO_UUID,
        GATTCharacteristicProperties.read,
        None,
        GATTAttributePermissions.readable,
    )

    # ENV_DATA — notify + read
    await server.add_new_characteristic(
        SERVICE_UUID, ENV_DATA_UUID,
        GATTCharacteristicProperties.notify | GATTCharacteristicProperties.read,
        None,
        GATTAttributePermissions.readable,
    )

    # PENDING_DATA — read
    await server.add_new_characteristic(
        SERVICE_UUID, PENDING_DATA_UUID,
        GATTCharacteristicProperties.read,
        None,
        GATTAttributePermissions.readable,
    )

    # ACK — write
    await server.add_new_characteristic(
        SERVICE_UUID, ACK_UUID,
        GATTCharacteristicProperties.write,
        None,
        GATTAttributePermissions.writeable,
    )

    await server.start()
    print("[BLE] Advertising démarré — en attente de connexions...\n")

    # Boucle de notifications ENV_DATA (toutes les EMIT_INTERVAL secondes)
    try:
        while True:
            await asyncio.sleep(EMIT_INTERVAL)
            packet = generate_packet()
            data   = bytearray(json.dumps(packet).encode("utf-8"))

            # Met à jour la valeur et envoie la notification
            char = server.get_characteristic(ENV_DATA_UUID)
            if char is not None:
                char.value = data
                server.update_value(SERVICE_UUID, ENV_DATA_UUID)

            s = packet["sensors"]
            print(
                f"[BLE] Notif — "
                f"T={s['temperature']}°C  "
                f"H={s['humidity']}%  "
                f"P={s['pressure']}hPa  "
                f"Lux={s['colorLight']['lux']}"
            )

    except KeyboardInterrupt:
        pass

    await server.stop()
    print("\n[SIM] Arrêt propre.")


if __name__ == "__main__":
    asyncio.run(main())
