import { MqttClient } from "mqtt";
import { prisma } from "../lib/prisma";

const TOPIC_TELEMETRIA = "lujan/deposito/+/telemetria";

interface TelemetriaPayload {
  temperatura: number;
  humedad: number;
  ts: string;
}

function esPayloadValido(data: unknown): data is TelemetriaPayload {
  if (!data || typeof data !== "object") return false;
  const { temperatura, humedad, ts } = data as Record<string, unknown>;
  return (
    typeof temperatura === "number" &&
    typeof humedad === "number" &&
    typeof ts === "string" &&
    !Number.isNaN(Date.parse(ts))
  );
}

export function escucharTelemetria(client: MqttClient): void {
  client.subscribe(TOPIC_TELEMETRIA, { qos: 1 }, (err) => {
    if (err) console.error("MQTT: no se pudo suscribir a telemetría:", err.message);
  });

  client.on("message", (topic, payload) => {
    const partes = topic.split("/");
    if (partes[1] !== "deposito" || partes[3] !== "telemetria") return;
    const codigo = partes[2];
    if (!codigo) return;

    let data: unknown;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      console.warn(`MQTT: payload no es JSON válido en ${topic}`);
      return;
    }

    if (!esPayloadValido(data)) {
      console.warn(`MQTT: payload inválido en ${topic}:`, payload.toString());
      return;
    }

    guardarLectura(codigo, data).catch((err: unknown) => {
      console.error(`MQTT: error al persistir lectura de ${codigo}:`, err);
    });
  });
}

async function guardarLectura(codigo: string, data: TelemetriaPayload): Promise<void> {
  const ts = new Date(data.ts);

  const nodo = await prisma.nodoIot.upsert({
    where: { codigo },
    update: { ultimo_visto: ts },
    create: { codigo, ultimo_visto: ts },
  });

  await prisma.lecturaAmbiental.create({
    data: {
      nodo_id: nodo.id,
      temperatura: data.temperatura,
      humedad: data.humedad,
      ts,
    },
  });
}
