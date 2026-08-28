import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import categoriasRoutes from "./routes/categorias";
import clientesRoutes from "./routes/clientes";
import iotRoutes from "./routes/iot";
import metricasRoutes from "./routes/metricas";
import pedidosRoutes from "./routes/pedidos";
import preciosDefaultRoutes from "./routes/precios_default";
import printLogsRoutes from "./routes/print_logs";
import productosRoutes from "./routes/productos";
import unidadesRoutes from "./routes/unidades";
import usuariosRoutes from "./routes/usuarios";
import { conectarMqtt } from "./mqtt/client";
import { escucharTelemetria } from "./mqtt/telemetria.listener";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/iot", iotRoutes);
app.use("/api/metricas", metricasRoutes);
app.use("/api/pedidos", pedidosRoutes);
app.use("/api/precios_default", preciosDefaultRoutes);
app.use("/api/print-logs", printLogsRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/unidades", unidadesRoutes);
app.use("/api/usuarios", usuariosRoutes);

const PORT = process.env["PORT"] ?? 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

const mqttClient = conectarMqtt();
escucharTelemetria(mqttClient);
