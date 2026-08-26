import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { Rol } from "../../generated/prisma/client";

export async function listar(req: Request, res: Response): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      created_at: true,
    },
    orderBy: { nombre: "asc" },
  });
  res.json(usuarios);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const { nombre, email, password, rol } = req.body as {
    nombre: string;
    email: string;
    password: string;
    rol: Rol;
  };

  const hash = await bcrypt.hash(password, 10);

  const usuario = await prisma.usuario.create({
    data: { nombre, email, password: hash, rol },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      created_at: true,
    },
  });
  res.status(201).json(usuario);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { nombre, email, rol, activo, password } = req.body as {
    nombre?: string;
    email?: string;
    rol?: Rol;
    activo?: boolean;
    password?: string;
  };

  const data: Record<string, unknown> = { nombre, email, rol, activo };
  if (password) data["password"] = await bcrypt.hash(password, 10);

  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      created_at: true,
    },
  });
  res.json(usuario);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);

  if (req.usuario!.sub === id) {
    res.status(400).json({ error: "No podés eliminar tu propio usuario" });
    return;
  }

  await prisma.usuario.delete({ where: { id } });
  res.status(204).send();
}
