import { Router } from "express";
import { verificarToken, requireRol } from "../middleware/auth";
import {
  metricasHoy,
  obtenerTraficoPedidos,
  obtenerProductosTiempo,
  obtenerCategoriasDistribucion,
} from "../controllers/metricas.controller";

const router = Router();

router.use(verificarToken);

router.get("/hoy", requireRol("admin", "operador", "readonly"), metricasHoy);
router.get("/trafico", requireRol("admin", "operador", "readonly"), obtenerTraficoPedidos);
router.get("/productos-tiempo", requireRol("admin", "operador", "readonly"), obtenerProductosTiempo);
router.get("/categorias-distribucion", requireRol("admin", "operador", "readonly"), obtenerCategoriasDistribucion);

export default router;
