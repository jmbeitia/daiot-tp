import { Router } from "express";
import { verificarToken, requireRol } from "../middleware/auth";
import * as ctrl from "../controllers/categorias.controller";

const router = Router();

router.use(verificarToken);

router.get("/", requireRol("admin", "operador", "readonly"), ctrl.listar);
router.post("/", requireRol("admin", "operador"), ctrl.crear);
router.put("/:id", requireRol("admin", "operador"), ctrl.actualizar);
router.delete("/:id", requireRol("admin", "operador"), ctrl.eliminar);

export default router;
