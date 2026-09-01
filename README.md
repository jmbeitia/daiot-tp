# TP DAIoT — Nodo de monitoreo ambiental (ESP32-C3)

## Contexto

Este trabajo práctico agrega una capa de **percepción y transporte IoT** a
[Tienda de Frutas Luján](../flow_control), un sistema de gestión de pedidos
por WhatsApp que no contaba con esa capa. Se trata de un componente nuevo,
desarrollado íntegramente en local y de forma independiente del sistema en
producción, que reutiliza el mismo stack tecnológico (Express + TypeScript,
Prisma sobre PostgreSQL y Angular) para que quede disponible ante una
eventual integración futura — aunque eso no es parte del alcance de este TP.

El caso de uso: un nodo de monitoreo ambiental para el depósito donde se
acopia la mercadería antes del reparto, o para una cámara frigorífica.

## Arquitectura

```
┌─────────────────┐   WiFi + MQTT/TLS    ┌──────────────────┐
│  ESP32-C3        │ ───────────────────▶ │  Mosquitto        │
│  + sensor T/H     │ ◀─────────────────── │  (Docker, mTLS)    │
└─────────────────┘   config/umbral       └────────┬─────────┘
                                                     │ MQTT/TLS
                                                     ▼
                                           ┌──────────────────┐
                                           │  API (Express+TS) │
                                           │  cliente MQTT +    │
                                           │  Prisma            │
                                           └────────┬─────────┘
                                                     │ SQL
                                                     ▼
                                           ┌──────────────────┐
                                           │  PostgreSQL        │
                                           └────────┬─────────┘
                                                     │ REST/JWT
                                                     ▼
                                           ┌──────────────────┐
                                           │  Panel (Angular)   │
                                           └──────────────────┘
```

## Tópicos MQTT

Jerarquía `lujan/deposito/{codigo_nodo}/...`:

| Tópico | Dirección | Payload |
|---|---|---|
| `lujan/deposito/{codigo}/telemetria` | nodo → backend, cada 30s | `{ "temperatura": 4.2, "humedad": 68.5, "ts": "2026-08-26T18:00:00Z" }` |
| `lujan/deposito/{codigo}/config` | backend → nodo, retained | `{ "umbral_alerta": 8.0 }` |
| `lujan/deposito/{codigo}/estado` | nodo → backend (LWT) | `online` / `offline` |

## Seguridad de transporte

Mosquitto corre únicamente con el listener TLS (8883), sin puerto en texto
plano. La autenticación es **mTLS**: además de cifrar el canal, el broker
exige certificado de cliente válido (firmado por una CA propia) tanto al
backend como al nodo ESP32-C3. Los certificados y claves privadas generados
**no se versionan** (`mosquitto/certs/` está en `.gitignore`); solo se
versiona el script que los genera. El firmware embebe su certificado de
cliente y la CA en un header gitignoreado (`secrets.h`), con un
`secrets.h.example` como plantilla.

## Modelo de datos (agregado a `api/prisma/schema.prisma`)

- `NodoIot`: identidad del nodo (código, ubicación, umbral de alerta actual,
  último visto).
- `LecturaAmbiental`: serie temporal de temperatura/humedad por nodo.
- `ConfiguracionNodo`: historial de cambios de umbral.

## Estructura del repo

```
daiot_tp/
├── api/            # Express + TypeScript + Prisma (heredado + módulo iot/)
├── web/panel/      # Angular (heredado + feature iot/)
├── mosquitto/      # config + script de generación de certs TLS
├── firmware/       # ESP32-C3 (PlatformIO)
├── print_server/, docs/       # heredado de tiendadefrutaslujan
└── docker-compose.yml
```

## Cómo levantar el entorno

```bash
cp api/.env.example api/.env   # completar JWT_SECRET, etc.
./mosquitto/certs/generate-certs.sh
docker compose up -d
docker compose exec api npx prisma db seed   # una sola vez
```

`docker compose up` ya aplica las migraciones de Prisma automáticamente al
levantar `api`. Backend en `localhost:3000`, panel en `localhost:4200`,
broker MQTT en `localhost:8883` (TLS/mTLS). Postgres es una instancia local
nueva (no la de producción) y se puebla con el seed del proyecto (usuario
admin + catálogo) para que el panel heredado no se vea vacío.

Probado de punta a punta: publicar en `lujan/deposito/nodo01/telemetria` con
`mosquitto_pub` (certs de `nodo01`) genera una fila en `LecturaAmbiental`, y
`PUT /api/iot/nodos/nodo01/umbral` persiste el cambio y publica el comando
retained en `lujan/deposito/nodo01/config`.

## Estado

En desarrollo — ver commits para el detalle de cada pieza. Hardware
verificado con la placa real (ver `firmware/README.md`): sensor DHT22 en
GPIO10 y LED indicador en GPIO3, ambos confirmados subiendo sketches de
prueba con PlatformIO desde el host. Falta la puesta en marcha final del
nodo completo (WiFi + MQTT reales) contra el broker en Docker.
