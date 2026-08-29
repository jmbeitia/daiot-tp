# Broker MQTT (Mosquitto)

Broker propio del TP, en Docker, con mTLS obligatorio (sin listener en texto
plano ni acceso anónimo).

## Generar certificados (primera vez, o para rotarlos)

```bash
./certs/generate-certs.sh
```

Genera una CA autofirmada y certificados firmados por ella para el servidor
(`server.*`, CN=`mosquitto`), el backend (`backend.*`) y el nodo ESP32-S3
(`nodo01.*`). Todo queda en `certs/` y **no se versiona** — se regenera con
el script cuando haga falta.

- El backend usa `backend.crt`/`backend.key` + `ca.crt` (ver `api/.env.example`).
- El firmware del ESP32-S3 embebe `nodo01.crt`/`nodo01.key` + `ca.crt` en
  `firmware/.../secrets.h` (gitignoreado también).
