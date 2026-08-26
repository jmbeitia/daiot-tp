import { Router } from "express";
import { verificarToken, requireRol, requireApiKey } from "../middleware/auth";
import * as ctrl from "../controllers/clientes.controller";
import * as listasCtrl from "../controllers/listas_precio.controller";

const router = Router();

// Interno: sincronización de contactos desde n8n con API key
router.post("/sync", requireApiKey, ctrl.sync);

router.use(verificarToken);

// Métricas: accesible también por readonly
router.get("/:id/metricas", requireRol("admin", "operador", "readonly"), ctrl.metricasCliente);

router.use(requireRol("admin", "operador"));

router.get("/", ctrl.listar);
router.get("/:id", ctrl.obtener);
router.post("/", ctrl.crear);
router.put("/:id", ctrl.actualizar);

// Listas de precios por cliente
router.get("/:id/listas", listasCtrl.listarListas);
router.post("/:id/listas", listasCtrl.crearLista);
router.put("/:id/listas/:listaId/default", listasCtrl.marcarDefault);
router.put("/:id/listas/:listaId", listasCtrl.actualizarLista);
router.delete("/:id/listas/:listaId", listasCtrl.eliminarLista);

router.get("/:id/listas/:listaId/export", listasCtrl.exportListaPrecio);
router.post("/:id/listas/:listaId/import", listasCtrl.importListaPrecio);

router.get("/:id/listas/:listaId/precios", listasCtrl.listarPreciosLista);
router.post("/:id/listas/:listaId/precios", listasCtrl.crearPrecioLista);
router.put("/:id/listas/:listaId/precios/:productoId/:unidadId", listasCtrl.actualizarPrecioLista);
router.delete("/:id/listas/:listaId/precios/:productoId/:unidadId", listasCtrl.eliminarPrecioLista);

export default router;
