import { Router } from "express";
import { verificarToken, requireRol } from "../middleware/auth";
import * as ctrl from "../controllers/precios_default.controller";

const router = Router();

router.use(verificarToken);
router.get("/export", requireRol("admin", "operador"), ctrl.exportPreciosDefault);
router.post("/import", requireRol("admin", "operador"), ctrl.importPreciosDefault);
router.post("/", requireRol("admin", "operador"), ctrl.upsert);
router.delete("/:productoId/:unidadId", requireRol("admin", "operador"), ctrl.eliminar);

export default router;
