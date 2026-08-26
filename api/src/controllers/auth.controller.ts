import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  if (!usuario.activo) {
    res.status(403).json({ error: "Usuario inactivo" });
    return;
  }

  const ok = await bcrypt.compare(password, usuario.password);
  if (!ok) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET no configurado");

  const token = jwt.sign(
    { sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    secret,
    { expiresIn: "8h" }
  );

  res.json({ token });
}
