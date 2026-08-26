import { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

function mensajeDuplicado(err: unknown): string | null {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const fields = (err.meta?.target as string[] | undefined) ?? [];
    if (fields.includes("abreviacion")) return "Ya existe una unidad con esa abreviación";
    if (fields.includes("nombre")) return "Ya existe una unidad con ese nombre";
    return "Ya existe una unidad con esos datos";
  }
  return null;
}

export async function listar(req: Request, res: Response): Promise<void> {
  const unidades = await prisma.unidad.findMany({
    orderBy: { nombre: "asc" },
  });
  res.json(unidades);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const { nombre, abreviacion } = req.body as { nombre: string; abreviacion?: string };
  try {
    const unidad = await prisma.unidad.create({
      data: { nombre, abreviacion: abreviacion ?? null },
    });
    res.status(201).json(unidad);
  } catch (err) {
    const msg = mensajeDuplicado(err);
    if (msg) { res.status(409).json({ error: msg }); return; }
    throw err;
  }
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { nombre, abreviacion } = req.body as { nombre?: string; abreviacion?: string };
  try {
    const unidad = await prisma.unidad.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(abreviacion !== undefined && { abreviacion }),
      },
    });
    res.json(unidad);
  } catch (err) {
    const msg = mensajeDuplicado(err);
    if (msg) { res.status(409).json({ error: msg }); return; }
    throw err;
  }
}

export async function catalogo(_req: Request, res: Response): Promise<void> {
  const unidades = await prisma.unidad.findMany({
    orderBy: { nombre: "asc" },
    select: { nombre: true, abreviacion: true },
  });
  res.json({ unidades });
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);

  const [enPrecios, enPreciosCliente, enItems] = await Promise.all([
    prisma.precioDefault.count({ where: { unidad_id: id } }),
    prisma.precioCliente.count({ where: { unidad_id: id } }),
    prisma.itemPedido.count({ where: { unidad_id: id } }),
  ]);

  if (enPrecios + enPreciosCliente + enItems > 0) {
    res.status(409).json({ error: "La unidad está en uso y no puede eliminarse" });
    return;
  }

  await prisma.unidad.delete({ where: { id } });
  res.status(204).send();
}
