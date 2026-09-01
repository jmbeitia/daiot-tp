#include <ArduinoJson.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "secrets.h"

// TODO: confirmar con el hardware real (placa + sensor en mano).
#define DHT_PIN 4
#define DHT_TYPE DHT22
#define LED_ALERTA_PIN 2

const unsigned long INTERVALO_PUBLICACION_MS = 30000;

WiFiClientSecure wifiClientSecure;
PubSubClient mqttClient(wifiClientSecure);
DHT dht(DHT_PIN, DHT_TYPE);

float umbralAlerta = 10.0;
unsigned long ultimaPublicacion = 0;

String topicTelemetria;
String topicConfig;
String topicEstado;

void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Conectando a WiFi %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi conectado, IP: %s\n", WiFi.localIP().toString().c_str());
}

void sincronizarHora() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora por NTP");
  time_t ahora = time(nullptr);
  while (ahora < 8 * 3600 * 2) {
    delay(500);
    Serial.print(".");
    ahora = time(nullptr);
  }
  Serial.println();
}

String tsIso8601() {
  time_t ahora = time(nullptr);
  struct tm tmInfo;
  gmtime_r(&ahora, &tmInfo);
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tmInfo);
  return String(buf);
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  if (String(topic) != topicConfig) return;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("Config invalida: %s\n", err.c_str());
    return;
  }

  if (doc["umbral_alerta"].is<float>()) {
    umbralAlerta = doc["umbral_alerta"].as<float>();
    Serial.printf("Umbral actualizado: %.1f\n", umbralAlerta);
  }
}

void conectarMqtt() {
  wifiClientSecure.setCACert(CA_CERT);
  wifiClientSecure.setCertificate(CLIENT_CERT);
  wifiClientSecure.setPrivateKey(CLIENT_KEY);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);

  while (!mqttClient.connected()) {
    Serial.print("Conectando a MQTT...");
    String clientId = String(NODO_CODIGO);
    if (mqttClient.connect(clientId.c_str(), topicEstado.c_str(), 1, true, "offline")) {
      Serial.println(" ok");
      mqttClient.publish(topicEstado.c_str(), "online", true);
      mqttClient.subscribe(topicConfig.c_str());
    } else {
      Serial.printf(" fallo, rc=%d, reintento en 5s\n", mqttClient.state());
      delay(5000);
    }
  }
}

void publicarTelemetria() {
  float temperatura = dht.readTemperature();
  float humedad = dht.readHumidity();

  if (isnan(temperatura) || isnan(humedad)) {
    Serial.println("Lectura de sensor invalida, se omite publicacion");
    return;
  }

  JsonDocument doc;
  doc["temperatura"] = temperatura;
  doc["humedad"] = humedad;
  doc["ts"] = tsIso8601();

  char payload[128];
  serializeJson(doc, payload);
  mqttClient.publish(topicTelemetria.c_str(), payload);
  Serial.printf("Publicado: %s\n", payload);

  digitalWrite(LED_ALERTA_PIN, temperatura >= umbralAlerta ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_ALERTA_PIN, OUTPUT);
  dht.begin();

  topicTelemetria = String("lujan/deposito/") + NODO_CODIGO + "/telemetria";
  topicConfig = String("lujan/deposito/") + NODO_CODIGO + "/config";
  topicEstado = String("lujan/deposito/") + NODO_CODIGO + "/estado";

  conectarWifi();
  sincronizarHora();
  conectarMqtt();
}

void loop() {
  if (!mqttClient.connected()) conectarMqtt();
  mqttClient.loop();

  unsigned long ahora = millis();
  if (ahora - ultimaPublicacion >= INTERVALO_PUBLICACION_MS) {
    ultimaPublicacion = ahora;
    publicarTelemetria();
  }
}
