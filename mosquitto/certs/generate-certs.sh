#!/usr/bin/env bash
# Genera una CA propia y certificados de servidor/cliente para el broker
# Mosquitto del TP (mTLS). Nada de lo generado acá se versiona en git:
# se regenera con este script cada vez que se necesite.
#
# Incluye keyUsage/extendedKeyUsage explicitos en todos los certificados:
# mbedTLS (el stack TLS del ESP32) es mucho mas estricto que OpenSSL de
# escritorio y rechaza certificados sin esas extensiones con un generico
# "X509 - Certificate verification failed" que no explica el motivo real.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CERT_DIR"

DAYS_CA=3650
DAYS_LEAF=825

# IP de la LAN del host (para que dispositivos como el ESP32, que se
# conectan por IP y no por el nombre "mosquitto" de la red de Docker,
# puedan validar el certificado del servidor).
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"

generar_cert() {
  local nombre="$1"
  local cn="$2"
  local ext="$3"
  openssl genrsa -out "${nombre}.key" 2048
  openssl req -new -key "${nombre}.key" -subj "/O=DAIoT TP/CN=${cn}" -out "${nombre}.csr"
  openssl x509 -req -in "${nombre}.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -days "$DAYS_LEAF" -sha256 -out "${nombre}.crt" -extfile <(printf "%s" "$ext")
  rm "${nombre}.csr"
}

echo "==> Generando CA propia"
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS_CA" \
  -subj "/O=DAIoT TP/CN=daiot-tp-ca" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -out ca.crt

echo "==> Certificado del servidor (CN=mosquitto + SAN para acceso por LAN: $LAN_IP)"
generar_cert server mosquitto "$(cat <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:mosquitto,DNS:localhost,DNS:${LAN_IP},IP:127.0.0.1,IP:${LAN_IP}
EOF
)"

echo "==> Certificado del cliente backend"
generar_cert backend daiot-tp-backend "$(cat <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF
)"

echo "==> Certificado del cliente nodo01 (ESP32-C3)"
generar_cert nodo01 nodo01 "$(cat <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF
)"

chmod 600 ./*.key
echo "==> Listo. Certificados en $CERT_DIR (gitignored)."
