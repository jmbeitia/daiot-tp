import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { analizarImport, construirCsvExport, sanitizarNombreArchivo } from "../lib/csv_precios";

const precioInclude = {
  producto: { select: { id: true, nombre: true } },
  unidad: true,
} as const;

// ── Listas ────────────────────────────────────────────────

export async function listarListas(req: Request, res: Response): Promise<void> {
  const cliente_id = Number(req.params["id"]);
  const listas = await prisma.listaPrecio.findMany({
    where: { cliente_id, activo: true },
    include: { precios: { where: { fecha_hasta: null }, include: precioInclude } },
    orderBy: [{ es_default: "desc" }, { created_at: "asc" }],
  });
  res.json(listas);
}

export async function crearLista(req: Request, res: Response): Promise<void> {
  const cliente_id = Number(req.params["id"]);
  const { nombre } = req.body as { nombre: string };

  if (!nombre?.trim()) {
    res.status(400).json({ error: "nombre es requerido" });
    return;
  }

  const lista = await prisma.listaPrecio.create({
    data: { nombre: nombre.trim(), cliente_id },
    include: { precios: false },
  });
  res.status(201).json(lista);
}

export async function actualizarLista(req: Request, res: Response): Promise<void> {
  const lista_id = Number(req.params["listaId"]);
  const { nombre, activo } = req.body as { nombre?: string; activo?: boolean };

  const lista = await prisma.listaPrecio.update({
    where: { id: lista_id },
    data: {
      ...(nombre !== undefined && { nombre: nombre.trim() }),
      ...(activo !== undefined && { activo }),
    },
  });
  res.json(lista);
}

export async function marcarDefault(req: Request, res: Response): Promise<void> {
  const cliente_id = Number(req.params["id"]);
  const lista_id = Number(req.params["listaId"]);

  await prisma.$transaction(async (tx) => {
    await tx.listaPrecio.updateMany({
      where: { cliente_id, es_default: true },
      data: { es_default: false },
    });
    await tx.listaPrecio.update({
      where: { id: lista_id },
      data: { es_default: true },
    });
  });

  const lista = await prisma.listaPrecio.findUnique({ where: { id: lista_id } });
  res.json(lista);
}

export async function eliminarLista(req: Request, res: Response): Promise<void> {
  const lista_id = Number(req.params["listaId"]);

  await prisma.listaPrecio.update({
    where: { id: lista_id },
    data: { activo: false },
  });
  res.status(204).send();
}

// ── Precios dentro de una lista ───────────────────────────

export async function listarPreciosLista(req: Request, res: Response): Promise<void> {
  const lista_id = Number(req.params["listaId"]);
  const precios = await prisma.precioListaPrecio.findMany({
    where: { lista_id, fecha_hasta: null },
    include: precioInclude,
    orderBy: [{ producto: { nombre: "asc" } }],
  });
  res.json(precios);
}

export async function crearPrecioLista(req: Request, res: Response): Promise<void> {
  const lista_id = Number(req.params["listaId"]);
  const { producto_id, unidad_id, precio } = req.body as {
    producto_id: number;
    unidad_id: number;
    precio: number;
  };

  const ahora = new Date();

  const precio_obj = await prisma.$transaction(async (tx) => {
    await tx.precioListaPrecio.updateMany({
      where: { lista_id, producto_id, unidad_id, fecha_hasta: null },
      data: { fecha_hasta: ahora },
    });
    return tx.precioListaPrecio.create({
      data: { lista_id, producto_id, unidad_id, precio, fecha_desde: ahora },
      include: precioInclude,
    });
  });

  res.status(201).json(precio_obj);
}

export async function actualizarPrecioLista(req: Request, res: Response): Promise<void> {
  const lista_id = Number(req.params["listaId"]);
  const producto_id = Number(req.params["productoId"]);
  const unidad_id = Number(req.params["unidadId"]);
  const { precio, nueva_unidad_id } = req.body as { precio: number; nueva_unidad_id?: number };

  // Si viene nueva_unidad_id, el precio se "mueve" a esa unidad (cambia su identidad)
  const destino_unidad = nueva_unidad_id ?? unidad_id;
  const ahora = new Date();

  const precio_obj = await prisma.$transaction(async (tx) => {
    // Cerrar el registro actual
    await tx.precioListaPrecio.updateMany({
      where: { lista_id, producto_id, unidad_id, fecha_hasta: null },
      data: { fecha_hasta: ahora },
    });
    // Si cambió de unidad, cerrar también cualquier precio activo en la unidad destino
    if (destino_unidad !== unidad_id) {
      await tx.precioListaPrecio.updateMany({
        where: { lista_id, producto_id, unidad_id: destino_unidad, fecha_hasta: null },
        data: { fecha_hasta: ahora },
      });
    }
    return tx.precioListaPrecio.create({
      data: { lista_id, producto_id, unidad_id: destino_unidad, precio, fecha_desde: ahora },
      include: precioInclude,
    });
  });

  res.json(precio_obj);
}

export async function eliminarPrecioLista(req: Request, res: Response): Promise<void> {
  const lista_id = Number(req.params["listaId"]);
  const producto_id = Number(req.params["productoId"]);
  const unidad_id = Number(req.params["unidadId"]);

  await prisma.precioListaPrecio.updateMany({
    where: { lista_id, producto_id, unidad_id, fecha_hasta: null },
    data: { fecha_hasta: new Date() },
  });

  res.status(204).send();
}

// ── Import / Export CSV ───────────────────────────────────
//
// Matriz ancha (una fila por producto, una columna por unidad). La lógica de
// formato/parseo/validación es compartida con precios default → ver lib/csv_precios.
// El archivo es la fuente de verdad de la lista (un "sync"): celda con número
// crea/actualiza; celda vacía sobre un precio activo lo elimina.

export async function exportListaPrecio(req: Request, res: Response): Promise<void> {
  const cliente_id = Number(req.params["id"]);
  const lista_id = Number(req.params["listaId"]);

  const lista = await prisma.listaPrecio.findFirst({ where: { id: lista_id, cliente_id } });
  if (!lista) {
    res.status(404).json({ error: "Lista no encontrada" });
    return;
  }
  const cliente = await prisma.cliente.findUnique({ where: { id: cliente_id } });

  const [productos, unidades, precios] = await Promise.all([
    prisma.producto.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.unidad.findMany({ orderBy: { nombre: "asc" } }),
    prisma.precioListaPrecio.findMany({ where: { lista_id, fecha_hasta: null } }),
  ]);

  const csv = construirCsvExport(productos, unidades, precios);
  const nombreArchivo = `lista_${sanitizarNombreArchivo(cliente?.nombre ?? String(cliente_id))}_${sanitizarNombreArchivo(lista.nombre)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
  res.send(csv);
}

export async function importListaPrecio(req: Request, res: Response): Promise<void> {
  const cliente_id = Number(req.params["id"]);
  const lista_id = Number(req.params["listaId"]);
  const { contenido } = req.body as { contenido?: string };

  const lista = await prisma.listaPrecio.findFirst({ where: { id: lista_id, cliente_id } });
  if (!lista) {
    res.status(404).json({ error: "Lista no encontrada" });
    return;
  }

  const [productos, unidades, preciosActivos] = await Promise.all([
    prisma.producto.findMany({ select: { id: true } }),
    prisma.unidad.findMany(),
    prisma.precioListaPrecio.findMany({ where: { lista_id, fecha_hasta: null } }),
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
  // Batch en 2 queries (updateMany + createMany) para no acumular round-trips en
  // la transacción —contra la base remota superaba el timeout de 5s—.
  const aCerrar = [...r.eliminar, ...r.actualizar];
  const aCrear = [...r.crear, ...r.actualizar];

  await prisma.$transaction(async (tx) => {
    if (aCerrar.length > 0) {
      await tx.precioListaPrecio.updateMany({
        where: {
          lista_id,
          fecha_hasta: null,
          OR: aCerrar.map((p) => ({ producto_id: p.producto_id, unidad_id: p.unidad_id })),
        },
        data: { fecha_hasta: ahora },
      });
    }
    if (aCrear.length > 0) {
      await tx.precioListaPrecio.createMany({
        data: aCrear.map((a) => ({
          lista_id, producto_id: a.producto_id, unidad_id: a.unidad_id,
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
