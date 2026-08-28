import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { publicarUmbral } from "../mqtt/client";

export async function listarNodos(req: Request, res: Response): Promise<void> {
  const nodos = await prisma.nodoIot.findMany({
    orderBy: { codigo: "asc" },
    include: {
      lecturas: { orderBy: { ts: "desc" }, take: 1 },
    },
  });
  res.json(nodos);
}

export async function listarLecturas(req: Request, res: Response): Promise<void> {
  const codigo = req.params["codigo"] as string;
  const desde = req.query["desde"] as string | undefined;
  const hasta = req.query["hasta"] as string | undefined;

  const nodo = await prisma.nodoIot.findUnique({ where: { codigo } });
  if (!nodo) {
    res.status(404).json({ error: "Nodo no encontrado" });
    return;
  }

  const lecturas = await prisma.lecturaAmbiental.findMany({
    where: {
      nodo_id: nodo.id,
      ts: {
        gte: desde ? new Date(desde) : undefined,
        lte: hasta ? new Date(hasta) : undefined,
      },
    },
    orderBy: { ts: "asc" },
  });
  res.json(lecturas);
}

export async function actualizarUmbral(req: Request, res: Response): Promise<void> {
  const codigo = req.params["codigo"] as string;
  const { umbral_alerta } = req.body as { umbral_alerta: number };

  if (typeof umbral_alerta !== "number" || Number.isNaN(umbral_alerta)) {
    res.status(400).json({ error: "umbral_alerta debe ser numérico" });
    return;
  }

  const nodo = await prisma.nodoIot.findUnique({ where: { codigo } });
  if (!nodo) {
    res.status(404).json({ error: "Nodo no encontrado" });
    return;
  }

  const [nodoActualizado] = await prisma.$transaction([
    prisma.nodoIot.update({ where: { id: nodo.id }, data: { umbral_alerta } }),
    prisma.configuracionNodo.create({
      data: { nodo_id: nodo.id, umbral_alerta, usuario_id: req.usuario?.sub },
    }),
  ]);

  publicarUmbral(codigo, umbral_alerta);

  res.json(nodoActualizado);
}
