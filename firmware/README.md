# Firmware — nodo de monitoreo ambiental (ESP32-S3)

Proyecto PlatformIO en `esp32-s3-nodo-ambiental/`. Arduino framework,
`WiFiClientSecure` + `PubSubClient` para MQTT sobre mTLS, `ArduinoJson` para
los payloads y `DHT sensor library` para el sensor (placeholder hasta
confirmar el sensor exacto que llegue).

## Pendiente de definir con el hardware en mano

- Sensor exacto (DHT22 vs SHT31 u otro) y su pin de datos.
- Pin del LED/indicador local de alerta.
- Placa exacta (se asume `esp32-s3-devkitc-1` como punto de partida).

Todo eso está marcado con `TODO` en `src/main.cpp`.

## Configuración (`include/secrets.h`, gitignoreado)

```bash
cp esp32-s3-nodo-ambiental/include/secrets.h.example esp32-s3-nodo-ambiental/include/secrets.h
```

Completar:
- `WIFI_SSID` / `WIFI_PASSWORD`
- `MQTT_HOST`: IP del equipo donde corre `docker compose` (el broker publica
  el puerto 8883 al host)
- `CA_CERT` / `CLIENT_CERT` / `CLIENT_KEY`: contenido de `ca.crt`,
  `nodo01.crt` y `nodo01.key` generados con
  `mosquitto/certs/generate-certs.sh`

## Qué hace

- Publica cada 30s en `lujan/deposito/{NODO_CODIGO}/telemetria`:
  `{"temperatura": .., "humedad": .., "ts": "..."}` (hora sincronizada por NTP).
- Se suscribe a `lujan/deposito/{NODO_CODIGO}/config` y actualiza el umbral
  de alerta en caliente cuando el panel lo cambia.
- Prende un LED local cuando la temperatura supera el umbral vigente.
- Publica `online`/`offline` (LWT) en `lujan/deposito/{NODO_CODIGO}/estado`.
