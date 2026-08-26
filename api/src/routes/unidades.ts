import { Router } from "express";
import { verificarToken, requireRol, requireApiKey } from "../middleware/auth";
import * as ctrl from "../controllers/unidades.controller";

const router = Router();

// Interno: solo n8n con API key
router.get("/catalogo", requireApiKey, ctrl.catalogo);

router.use(verificarToken);

router.get("/", ctrl.listar);
router.post("/", requireRol("admin", "operador"), ctrl.crear);
router.put("/:id", requireRol("admin", "operador"), ctrl.actualizar);
router.delete("/:id", requireRol("admin", "operador"), ctrl.eliminar);

export default router;
