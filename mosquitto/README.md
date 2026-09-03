# Broker MQTT (Mosquitto)

Broker propio del TP, en Docker, con mTLS obligatorio (sin listener en texto
plano ni acceso anónimo).

## Generar certificados (primera vez, o para rotarlos)

```bash
./certs/generate-certs.sh
```

Genera una CA autofirmada y certificados firmados por ella para el servidor
(`server.*`, CN=`mosquitto`), el backend (`backend.*`) y el nodo ESP32-C3
(`nodo01.*`). Todo queda en `certs/` y **no se versiona** — se regenera con
el script cuando haga falta.

- El backend usa `backend.crt`/`backend.key` + `ca.crt` (ver `api/.env.example`).
- El firmware del ESP32-C3 embebe `nodo01.crt`/`nodo01.key` + `ca.crt` en
  `firmware/.../secrets.h` (gitignoreado también).

## Notas de compatibilidad con mbedTLS (ESP32)

Puesta en marcha con hardware real, dos ajustes que no hacen falta si todos
los clientes son de escritorio (Node, `mosquitto_pub`, etc.) pero sí para
que el ESP32 valide el certificado del broker:

1. **TLS 1.2 forzado.** El mbedTLS que trae el core Arduino del ESP32 no
   soporta TLS 1.3, y OpenSSL 3.x lo negocia por default. Se fija el tope
   vía `OPENSSL_CONF` (ver `config/openssl-tls12.cnf` + la variable de
   entorno en `docker-compose.yml`) — el `tls_version` de `mosquitto.conf`
   por sí solo sólo define el *mínimo*, no alcanza para capar el máximo.
2. **La IP del broker también como SAN de tipo `DNS`, no sólo `IP`.** El
   nodo se conecta por IP (no puede resolver el hostname `mosquitto`, que
   sólo existe dentro de la red de Docker), y el mbedTLS de este core no
   soporta bien la comparación contra SAN de tipo `IP Address` — sólo
   contra SAN `DNS` por texto. `generate-certs.sh` agrega la IP de la LAN
   como ambas cosas (`DNS:<ip>` e `IP:<ip>`) para cubrir los dos casos.

Todos los certificados también incluyen `keyUsage`/`extendedKeyUsage`
explícitos (`serverAuth`/`clientAuth`): mbedTLS es más estricto que OpenSSL
de escritorio y sin esas extensiones rechaza el certificado con un genérico
"X509 - Certificate verification failed" que no explica el motivo real.
