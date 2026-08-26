import { Router } from "express";
import { verificarToken, requireRol, requireApiKey, requireApiKeyOrToken } from "../middleware/auth";
import * as ctrl from "../controllers/pedidos.controller";

const router = Router();

// Interno: solo n8n con API key
router.post("/", requireApiKey, ctrl.crearDesdeWhatsapp);
// Acepta API key (n8n) o JWT (panel)
router.post("/:id/imprimir", requireApiKeyOrToken, ctrl.imprimir);

// Rutas protegidas
router.use(verificarToken);
router.use(requireRol("admin", "operador"));

router.get("/", ctrl.listar);
router.get("/:id", ctrl.obtener);

router.patch("/:id", ctrl.actualizar);
router.patch("/:id/estado", ctrl.actualizarEstado);
router.patch("/:id/descuento", ctrl.actualizarDescuento);
router.delete("/:id/descuento", ctrl.eliminarDescuento);

// Crear desde el panel (protegido, antes de /:id para evitar colisión)
router.post("/panel", ctrl.crearDesdePanel);

// Fusionar y operaciones bulk van antes de /:id para evitar colisión de parámetros
router.post("/fusionar", ctrl.fusionar);
router.post("/:id/deshacer-fusion", ctrl.deshacerFusion);
router.post("/marcar-vistos-bulk", ctrl.marcarVistosBulk);
router.post("/marcar-no-vistos-bulk", ctrl.marcarNoVistosBulk);
router.post("/cambiar-estado-bulk", ctrl.cambiarEstadoBulk);
router.delete("/bulk", requireRol("admin"), ctrl.eliminarBulk);

router.post("/:id/duplicar", ctrl.duplicar);
router.post("/:id/marcar-no-visto", ctrl.marcarNoVisto);
router.post("/:id/marcar-visto", ctrl.marcarVisto);
router.get("/:id/chatwoot-url", ctrl.chatwootUrl);
router.post("/:id/confirmar-whatsapp", ctrl.confirmarWhatsapp);

router.delete("/:id", requireRol("admin"), ctrl.eliminar);

// Items del pedido
router.post("/:id/items", ctrl.crearItem);
router.put("/:id/items/:itemId", ctrl.actualizarItem);
router.delete("/:id/items/:itemId", ctrl.eliminarItem);

// Previsualizar ticket (sin imprimir)
router.get("/:id/ticket", ctrl.ticketPreview);

// Historial de impresiones
router.get("/:id/impresiones", ctrl.getImpresiones);
router.post("/:id/resolver-error-impresion", ctrl.resolverErrorImpresion);

export default router;
