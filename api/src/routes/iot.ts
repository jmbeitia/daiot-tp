import { Router } from "express";
import { verificarToken, requireRol } from "../middleware/auth";
import * as ctrl from "../controllers/iot.controller";

const router = Router();

router.use(verificarToken);

router.get("/nodos", requireRol("admin", "operador", "readonly"), ctrl.listarNodos);
router.get(
  "/nodos/:codigo/lecturas",
  requireRol("admin", "operador", "readonly"),
  ctrl.listarLecturas,
);
router.put("/nodos/:codigo/umbral", requireRol("admin", "operador"), ctrl.actualizarUmbral);

export default router;
