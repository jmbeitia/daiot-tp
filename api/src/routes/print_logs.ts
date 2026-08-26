import { Router } from "express";
import { verificarToken, requireRol } from "../middleware/auth";
import { getErroresImpresion } from "../controllers/pedidos.controller";

const router = Router();

router.use(verificarToken);
router.use(requireRol("admin", "operador"));

router.get("/errores", getErroresImpresion);

export default router;
