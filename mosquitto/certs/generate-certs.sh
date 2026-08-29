#!/usr/bin/env bash
# Genera una CA propia y certificados de servidor/cliente para el broker
# Mosquitto del TP (mTLS). Nada de lo generado acá se versiona en git:
# se regenera con este script cada vez que se necesite.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CERT_DIR"

DAYS_CA=3650
DAYS_LEAF=825

generar_cert() {
  local nombre="$1"
  local cn="$2"
  openssl genrsa -out "${nombre}.key" 2048
  openssl req -new -key "${nombre}.key" -subj "/O=DAIoT TP/CN=${cn}" -out "${nombre}.csr"
  openssl x509 -req -in "${nombre}.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -days "$DAYS_LEAF" -sha256 -out "${nombre}.crt"
  rm "${nombre}.csr"
}

echo "==> Generando CA propia"
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS_CA" \
  -subj "/O=DAIoT TP/CN=daiot-tp-ca" -out ca.crt

echo "==> Certificado del servidor (CN=mosquitto, debe matchear el hostname del contenedor)"
generar_cert server mosquitto

echo "==> Certificado del cliente backend"
generar_cert backend daiot-tp-backend

echo "==> Certificado del cliente nodo01 (ESP32-S3)"
generar_cert nodo01 nodo01

chmod 600 ./*.key
echo "==> Listo. Certificados en $CERT_DIR (gitignored)."
