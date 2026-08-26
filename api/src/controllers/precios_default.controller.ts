import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { analizarImport, construirCsvExport } from "../lib/csv_precios";

export async function upsert(req: Request, res: Response): Promise<void> {
  const { producto_id, unidad_id, precio } = req.body as {
    producto_id: number;
    unidad_id: number;
    precio: number;
  };

  const ahora = new Date();

  const precio_obj = await prisma.$transaction(async (tx) => {
    // Close any currently active price for this product/unit
    await tx.precioDefault.updateMany({
      where: { producto_id, unidad_id, fecha_hasta: null },
      data: { fecha_hasta: ahora },
    });

    // Create new version
    return tx.precioDefault.create({
      data: { producto_id, unidad_id, precio, fecha_desde: ahora },
      include: { unidad: true },
    });
  });

  res.status(200).json(precio_obj);
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const producto_id = Number(req.params["productoId"]);
  const unidad_id = Number(req.params["unidadId"]);

  // Soft-delete: close the active version instead of hard delete
  await prisma.precioDefault.updateMany({
    where: { producto_id, unidad_id, fecha_hasta: null },
    data: { fecha_hasta: new Date() },
  });

  res.status(204).send();
}

// ── Import / Export CSV ───────────────────────────────────
// Mismo formato de matriz ancha que las listas de cliente (ver lib/csv_precios).
// El archivo es la fuente de verdad de los precios base: celda con número
// crea/actualiza; celda vacía sobre un precio activo lo elimina.

export async function exportPreciosDefault(_req: Request, res: Response): Promise<void> {
  const [productos, unidades, precios] = await Promise.all([
    prisma.producto.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.unidad.findMany({ orderBy: { nombre: "asc" } }),
    // PrecioDefault.precio es nullable: solo exportamos los que tienen valor.
    prisma.precioDefault.findMany({ where: { fecha_hasta: null, precio: { not: null } } }),
  ]);

  const csv = construirCsvExport(
    productos,
    unidades,
    precios.map((p) => ({ producto_id: p.producto_id, unidad_id: p.unidad_id, precio: p.precio! })),
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="precios_base.csv"`);
  res.send(csv);
}

export async function importPreciosDefault(req: Request, res: Response): Promise<void> {
  const { contenido } = req.body as { contenido?: string };

  const [productos, unidades, preciosActivos] = await Promise.all([
    prisma.producto.findMany({ select: { id: true } }),
    prisma.unidad.findMany(),
    prisma.precioDefault.findMany({ where: { fecha_hasta: null, precio: { not: null } } }),
  ]);
  const productoIds = new Set(productos.map((p) => p.id));
  const activos = new Map<number, Map<number, number>>();
  for (const p of preciosActivos) {
    if (!activos.has(p.producto_id)) activos.set(p.producto_id, new Map());
    activos.get(p.producto_id)!.set(p.unidad_id, Number(p.precio));
  }

  const r = analizarImport(contenido ?? "", productoIds, unidades, activos);
  if (!r.ok) {
    res.status(r.status).json({ error: r.error, ...(r.errores && { errores: r.errores }) });
    return;
  }

  const ahora = new Date();
  const aCerrar = [...r.eliminar, ...r.actualizar];
  const aCrear = [...r.crear, ...r.actualizar];

  await prisma.$transaction(async (tx) => {
    if (aCerrar.length > 0) {
      await tx.precioDefault.updateMany({
        where: {
          fecha_hasta: null,
          OR: aCerrar.map((p) => ({ producto_id: p.producto_id, unidad_id: p.unidad_id })),
        },
        data: { fecha_hasta: ahora },
      });
    }
    if (aCrear.length > 0) {
      await tx.precioDefault.createMany({
        data: aCrear.map((a) => ({
          producto_id: a.producto_id, unidad_id: a.unidad_id,
          precio: a.precio, fecha_desde: ahora,
        })),
      });
    }
  });

  res.json({
    creados: r.crear.length,
    actualizados: r.actualizar.length,
    eliminados: r.eliminar.length,
    sin_cambios: r.sin_cambios,
  });
}
