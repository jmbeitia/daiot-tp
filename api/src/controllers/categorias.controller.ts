import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response): Promise<void> {
  const categorias = await prisma.categoria.findMany({
    orderBy: { nombre: "asc" },
  });
  res.json(categorias);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const { nombre, descripcion } = req.body as {
    nombre: string;
    descripcion?: string;
  };
  const categoria = await prisma.categoria.create({
    data: { nombre, descripcion },
  });
  res.status(201).json(categoria);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { nombre, descripcion, activo } = req.body as {
    nombre?: string;
    descripcion?: string;
    activo?: boolean;
  };
  const categoria = await prisma.categoria.update({
    where: { id },
    data: { nombre, descripcion, activo },
  });
  res.json(categoria);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);

  const conProductos = await prisma.producto.count({
    where: { categoria_id: id, activo: true },
  });

  if (conProductos > 0) {
    res
      .status(409)
      .json({ error: "La categoría tiene productos activos asociados" });
    return;
  }

  await prisma.categoria.delete({ where: { id } });
  res.status(204).send();
}
