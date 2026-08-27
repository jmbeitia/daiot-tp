import fs from "node:fs";
import mqtt, { MqttClient } from "mqtt";

let client: MqttClient | undefined;

export function conectarMqtt(): MqttClient {
  if (client) return client;

  const url = process.env["MQTT_URL"];
  const caPath = process.env["MQTT_CA_PATH"];
  const certPath = process.env["MQTT_CERT_PATH"];
  const keyPath = process.env["MQTT_KEY_PATH"];
  if (!url || !caPath || !certPath || !keyPath) {
    throw new Error("Variables de entorno MQTT_* no configuradas");
  }

  client = mqtt.connect(url, {
    ca: fs.readFileSync(caPath),
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    rejectUnauthorized: true,
    clientId: "daiot-tp-backend",
  });

  client.on("connect", () => console.log("MQTT: conectado al broker"));
  client.on("error", (err) => console.error("MQTT: error de conexión:", err.message));
  client.on("reconnect", () => console.log("MQTT: reconectando..."));

  return client;
}

export function publicarUmbral(codigoNodo: string, umbral_alerta: number): void {
  if (!client) throw new Error("Cliente MQTT no conectado");
  const topic = `lujan/deposito/${codigoNodo}/config`;
  client.publish(topic, JSON.stringify({ umbral_alerta }), { qos: 1, retain: true });
}
