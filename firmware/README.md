# Firmware — nodo de monitoreo ambiental (ESP32-C3)

Proyecto PlatformIO en `esp32-c3-nodo-ambiental/`. Arduino framework,
`WiFiClientSecure` + `PubSubClient` para MQTT sobre mTLS, `ArduinoJson` para
los payloads y `DHT sensor library` para el sensor.

La placa conectada resultó ser un **ESP32-C3** (verificado con `esptool`),
no un ESP32-S3 como se había planteado inicialmente — funcionalmente es
equivalente para este caso de uso (WiFi + MQTT + un sensor por GPIO).

## Hardware confirmado

- Sensor: **DHT22/AM2302** pelado (4 patas, sin plaquita), pull-up de
  **10kΩ** entre VCC y DATA. DATA en **GPIO10**, VCC a 3V3, GND a GND.
- LED indicador de alerta: externo, con resistencia de **300Ω** en serie
  entre el cátodo y GND. Ánodo en **GPIO3**.
- Se evitaron GPIO 2/8/9 (definen el modo de arranque del ESP32-C3) y
  GPIO 20/21 (puerto serie usado para programar/depurar).

Ambos verificados subiendo sketches de prueba con PlatformIO directo desde
la máquina (no desde Docker: Docker Desktop en Mac no tiene acceso al
puerto USB serie, así que la carga del firmware se hace siempre desde el
host, no en contenedor).

## Configuración (`include/secrets.h`, gitignoreado)

```bash
cp esp32-c3-nodo-ambiental/include/secrets.h.example esp32-c3-nodo-ambiental/include/secrets.h
```

Completar:
- `WIFI_SSID` / `WIFI_PASSWORD`
- `MQTT_HOST`: IP del equipo donde corre `docker compose` (el broker publica
  el puerto 8883 al host)
- `CA_CERT` / `CLIENT_CERT` / `CLIENT_KEY`: contenido de `ca.crt`,
  `nodo01.crt` y `nodo01.key` generados con
  `mosquitto/certs/generate-certs.sh`

## Compilar y subir

```bash
cd esp32-c3-nodo-ambiental
pio run                                        # compilar
pio run -t upload --upload-port /dev/cu.usbserial-XXXX  # flashear (host, no Docker)
pio device monitor -b 115200 --port /dev/cu.usbserial-XXXX
```

## Qué hace

- Publica cada 30s en `lujan/deposito/{NODO_CODIGO}/telemetria`:
  `{"temperatura": .., "humedad": .., "ts": "..."}` (hora sincronizada por NTP).
- Se suscribe a `lujan/deposito/{NODO_CODIGO}/config` y actualiza el umbral
  de alerta en caliente cuando el panel lo cambia.
- Prende el LED cuando la temperatura supera el umbral vigente.
- Publica `online`/`offline` (LWT) en `lujan/deposito/{NODO_CODIGO}/estado`.
