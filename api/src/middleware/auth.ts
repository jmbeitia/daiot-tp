import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface UsuarioPayload {
  sub: number;
  nombre: string;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioPayload;
    }
  }
}

export function verificarToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }

  const token = header.slice(7);
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET no configurado");

  try {
    req.usuario = jwt.verify(token, secret) as unknown as UsuarioPayload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

export function requireRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    next();
  };
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env["N8N_API_KEY"];
  if (!apiKey) throw new Error("N8N_API_KEY no configurado");

  const provided = req.headers["x-api-key"];
  if (!provided || provided !== apiKey) {
    res.status(401).json({ error: "API key inválida" });
    return;
  }
  next();
}

export function requireApiKeyOrToken(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env["N8N_API_KEY"];
  if (apiKey && req.headers["x-api-key"] === apiKey) {
    next();
    return;
  }
  verificarToken(req, res, next);
}
