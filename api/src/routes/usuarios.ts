import { Router } from "express";
import { verificarToken, requireRol } from "../middleware/auth";
import * as ctrl from "../controllers/usuarios.controller";

const router = Router();

router.use(verificarToken);
router.use(requireRol("admin"));

router.get("/", ctrl.listar);
router.post("/", ctrl.crear);
router.put("/:id", ctrl.actualizar);
router.delete("/:id", ctrl.eliminar);

export default router;
