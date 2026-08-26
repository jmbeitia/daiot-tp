import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// Precio vigente en un instante: fecha_desde <= T y (fecha_hasta IS NULL o fecha_hasta > T)
function precioFilter(fecha: Date) {
  return {
    fecha_desde: { lte: fecha },
    OR: [{ fecha_hasta: null as null }, { fecha_hasta: { gt: fecha } }],
  };
}

const productoInclude = {
  categoria: true,
  precios_default: { where: { fecha_hasta: null }, include: { unidad: true } },
} as const;

export async function listar(req: Request, res: Response): Promise<void> {
  const clienteId = req.query["cliente_id"] ? Number(req.query["cliente_id"]) : null;
  const fechaStr = req.query["fecha"] as string | undefined;
  const fecha = fechaStr ? new Date(fechaStr) : new Date();
  const todos = req.query["todos"] === "true";

  const filter = precioFilter(fecha);

  const productos = await prisma.producto.findMany({
    where: todos ? {} : { activo: true },
    include: {
      categoria: true,
      precios_default: { where: filter, include: { unidad: true } },
    },
    orderBy: { nombre: "asc" },
  });

  // Precios especiales del cliente: se toman de su lista de precios default.
  // Se exponen como `precios_cliente` para mantener el contrato con el front.
  if (clienteId) {
    const listaDefault = await prisma.listaPrecio.findFirst({
      where: { cliente_id: clienteId, es_default: true, activo: true },
      select: { id: true },
    });

    const preciosPorProducto = new Map<number, { unidad_id: number; precio: string }[]>();
    if (listaDefault) {
      const precios = await prisma.precioListaPrecio.findMany({
        where: { lista_id: listaDefault.id, ...filter },
        select: { producto_id: true, unidad_id: true, precio: true },
      });
      for (const p of precios) {
        const arr = preciosPorProducto.get(p.producto_id) ?? [];
        arr.push({ unidad_id: p.unidad_id, precio: String(p.precio) });
        preciosPorProducto.set(p.producto_id, arr);
      }
    }

    const conPrecios = productos.map((prod) => ({
      ...prod,
      precios_cliente: preciosPorProducto.get(prod.id) ?? [],
    }));
    res.json(conPrecios);
    return;
  }

  res.json(productos);
}

export async function obtener(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const producto = await prisma.producto.findUnique({
    where: { id },
    include: productoInclude,
  });
  if (!producto) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }
  res.json(producto);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const { nombre, categoria_id, unidad_default, precios } = req.body as {
    nombre: string;
    categoria_id?: number;
    unidad_default: string;
    precios?: { unidad_id: number; precio: number }[];
  };

  const existente = await prisma.producto.findFirst({
    where: { nombre: { equals: nombre.trim(), mode: "insensitive" } },
    select: { id: true, nombre: true, activo: true },
  });
  if (existente) {
    const sufijo = existente.activo ? "" : " (inactivo)";
    res.status(409).json({
      error: `Ya existe un producto con ese nombre: "${existente.nombre}"${sufijo}`,
    });
    return;
  }

  const producto = await prisma.producto.create({
    data: {
      nombre,
      categoria_id,
      unidad_default,
      activo: true,
      ...(precios?.length && {
        precios_default: {
          createMany: {
            data: precios.map((p) => ({ unidad_id: p.unidad_id, precio: p.precio })),
          },
        },
      }),
    },
    include: productoInclude,
  });
  res.status(201).json(producto);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { nombre, categoria_id, unidad_default, activo, precios } = req.body as {
    nombre?: string;
    categoria_id?: number;
    unidad_default?: string;
    activo?: boolean;
    precios?: { unidad_id: number; precio: number }[];
  };

  const producto = await prisma.$transaction(async (tx) => {
    await tx.producto.update({
      where: { id },
      data: { nombre, categoria_id, unidad_default, activo },
    });

    if (precios) {
      const ahora = new Date();
      const unidadesEnviadas = precios.map((p) => p.unidad_id);

      // Cierra los precios de unidades que el usuario eliminó del formulario
      await tx.precioDefault.updateMany({
        where: {
          producto_id: id,
          fecha_hasta: null,
          ...(unidadesEnviadas.length > 0 ? { unidad_id: { notIn: unidadesEnviadas } } : {}),
        },
        data: { fecha_hasta: ahora },
      });

      for (const p of precios) {
        await tx.precioDefault.updateMany({
          where: { producto_id: id, unidad_id: p.unidad_id, fecha_hasta: null },
          data: { fecha_hasta: ahora },
        });
        await tx.precioDefault.create({
          data: { producto_id: id, unidad_id: p.unidad_id, precio: p.precio, fecha_desde: ahora },
        });
      }
    }

    return tx.producto.findUnique({
      where: { id },
      include: productoInclude,
    });
  });

  res.json(producto);
}

export async function listarPedidos(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const page = Math.max(1, Number(req.query["page"] ?? 1));
  const limit = Math.max(1, Number(req.query["limit"] ?? 5));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.itemPedido.findMany({
      where: { producto_id: id },
      orderBy: { pedido: { fecha: "desc" } },
      skip,
      take: limit,
      include: { pedido: { include: { cliente: true } } },
    }),
    prisma.itemPedido.count({ where: { producto_id: id } }),
  ]);

  res.json({ pedidos: items, total });
}

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);

  const [preciosCount, preciosClienteCount, itemsCount] = await Promise.all([
    prisma.precioDefault.count({ where: { producto_id: id } }),
    prisma.precioCliente.count({ where: { producto_id: id } }),
    prisma.itemPedido.count({ where: { producto_id: id } }),
  ]);

  if (preciosCount + preciosClienteCount + itemsCount > 0) {
    await prisma.producto.update({ where: { id }, data: { activo: false } });
    res.json({
      action: "deactivated",
      message: "El producto tiene historial de precios o pedidos asociados. Se ha desactivado para conservar el historial.",
    });
    return;
  }

  await prisma.producto.delete({ where: { id } });
  res.json({ action: "deleted", message: "Producto eliminado físicamente de la base de datos." });
}

export async function catalogo(_req: Request, res: Response): Promise<void> {
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    select: { nombre: true, categoria: { select: { nombre: true } } },
    orderBy: { nombre: "asc" },
  });

  const map = new Map<string, string[]>();
  for (const p of productos) {
    const cat = p.categoria?.nombre ?? "sin_categoria";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p.nombre);
  }

  const categorias = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nombre, productos]) => ({ nombre, productos }));

  res.json({ categorias });
}
