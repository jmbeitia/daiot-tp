import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login } from "../controllers/auth.controller";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, login);

export default router;
