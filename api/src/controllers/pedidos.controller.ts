import { Request, Response } from "express";
import { Prisma, EstadoPedido } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

const ESTADOS_VALIDOS: EstadoPedido[] = [
  "recibido",
  "en_preparacion",
  "listo",
  "entregado",
];

// ──────────────────────────────────────────────
// Helpers de precios y ticket
// ──────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function resolverPrecio(
  tx: TxClient,
  clienteId: number | null,
  listaPrecioId: number | null,
  productoId: number,
  unidadId: number,
): Promise<Prisma.Decimal | null> {
  // 1. Lista explícita del pedido
  if (listaPrecioId) {
    const pl = await tx.precioListaPrecio.findFirst({
      where: { lista_id: listaPrecioId, producto_id: productoId, unidad_id: unidadId, fecha_hasta: null },
    });
    if (pl) return pl.precio;
  }

  if (clienteId) {
    // 2. Lista default del cliente
    const listaDefault = await tx.listaPrecio.findFirst({
      where: { cliente_id: clienteId, es_default: true, activo: true },
    });
    if (listaDefault) {
      const pl = await tx.precioListaPrecio.findFirst({
        where: { lista_id: listaDefault.id, producto_id: productoId, unidad_id: unidadId, fecha_hasta: null },
      });
      if (pl) return pl.precio;
    }
  }

  // 3. Precio general
  const pdDefault = await tx.precioDefault.findFirst({
    where: { producto_id: productoId, unidad_id: unidadId, fecha_hasta: null },
  });
  return pdDefault?.precio ?? null;
}

const SEP = "________________________";

function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width) {
      if (line) result.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) result.push(line);
  return result;
}

function pushWrapped(lines: string[], text: string, width: number): void {
  wrapText(text, width).forEach((l) => lines.push(l));
}

function buildPrinterMsg(
  cliente: { nombre: string; telefono: string } | null,
  fecha: Date,
  items: { producto_raw: string | null; producto: { nombre: string } | null; cantidad: Prisma.Decimal; unidad: string; unidad_rel: { abreviacion: string | null } | null; precio_unitario: Prisma.Decimal | null; producto_id: number | null }[],
  aclaraciones: string | null,
  conPrecios: boolean,
  descuento?: { tipo: string | null; valor: Prisma.Decimal | null },
): string {
  const width = SEP.length;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
  const nombre = cliente?.nombre ?? "";
  const telefono = cliente?.telefono ?? "";

  const lines: string[] = ["PEDIDO", "Fecha y hora:", ts];
  pushWrapped(lines, `Cliente: ${nombre}`, width);
  lines.push(`Tel: ${telefono}`);

  const itemsEnCatalogo = items.filter((i) => i.producto_id !== null);
  const itemsFuera = items.filter((i) => i.producto_id === null);

  let totalConPrecios = 0;

  for (const item of itemsEnCatalogo) {
    const nombre_item = item.producto?.nombre ?? item.producto_raw ?? "?";
    const unidad = item.unidad_rel?.abreviacion ?? item.unidad;
    const cantidad = parseFloat(String(item.cantidad));
    lines.push(SEP);
    pushWrapped(lines, `- ${nombre_item}: ${cantidad} ${unidad}`, width);
    if (conPrecios && item.precio_unitario != null) {
      const unitario = Number(item.precio_unitario);
      const subtotal = unitario * cantidad;
      totalConPrecios += subtotal;
      const izq = `$${Math.round(unitario).toLocaleString("es-AR")}/${unidad}`;
      const der = `$${Math.round(subtotal).toLocaleString("es-AR")}`;
      const espacio = Math.max(1, width - izq.length - der.length);
      lines.push(izq + " ".repeat(espacio) + der);
    }
  }

  if (itemsFuera.length > 0) {
    lines.push(SEP);
    lines.push("FUERA DE CATALOGO:");
    for (const item of itemsFuera) {
      const nombre_item = item.producto_raw ?? "?";
      const unidad = item.unidad_rel?.abreviacion ?? item.unidad;
      const cantidad = parseFloat(String(item.cantidad));
      lines.push(SEP);
      pushWrapped(lines, `- ${nombre_item}: ${cantidad} ${unidad}`, width);
    }
  }

  if (conPrecios) {
    let totalFinal = totalConPrecios;
    if (descuento?.tipo && descuento.valor != null) {
      const dv = Number(descuento.valor);
      if (descuento.tipo === "porcentaje") {
        totalFinal = totalConPrecios * (1 - dv / 100);
      } else {
        totalFinal = totalConPrecios - dv;
      }
    }
    lines.push(SEP);
    const totalStr = `TOTAL: $${Math.round(totalFinal).toLocaleString("es-AR")}`;
    lines.push(totalStr.padStart(width));
  }

  lines.push(SEP);
  lines.push("ACLARACIONES:");

  if (aclaraciones) {
    pushWrapped(lines, aclaraciones, width);
  }

  for (let i = 0; i < 4; i++) lines.push(SEP);
  lines.push("", "", "", "", "");

  return lines.join("\n");
}

const pedidoInclude = {
  cliente: true,
  items: { include: { producto: true, unidad_rel: true } },
  originales: { select: { id: true } },
  _count: { select: { print_logs: true } },
} as const;

type PedidoConItems = Prisma.PedidoGetPayload<{
  include: {
    cliente: true;
    items: { include: { producto: true; unidad_rel: true } };
    originales: { select: { id: true } };
    _count: { select: { print_logs: true } };
  };
}>;

type ItemConRels = PedidoConItems["items"][number];

function inicioDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

function mapItem(item: ItemConRels) {
  return { ...item, descuento_item: null as number | null };
}

function calcularTotales(pedido: PedidoConItems) {
  const total_items = pedido.items.reduce((sum, i) => {
    if (i.precio_unitario == null) return sum;
    return sum + Number(i.cantidad) * Number(i.precio_unitario);
  }, 0);

  let total_final = total_items;
  let descuento_global = 0;

  if (pedido.descuento_tipo && pedido.descuento_valor != null) {
    const dv = Number(pedido.descuento_valor);
    if (pedido.descuento_tipo === "porcentaje") {
      descuento_global = total_items * (dv / 100);
      total_final = total_items - descuento_global;
    } else {
      descuento_global = dv;
      total_final = total_items - dv;
    }
  }

  // subtotal = total antes del descuento global; ahorro proviene de lookups temporales en el front
  return { subtotal: total_items, total_items, descuento_global, total_final, ahorro_total: 0 };
}

function mapPedido(pedido: PedidoConItems) {
  const { originales, _count, ...rest } = pedido;
  const totales = calcularTotales(pedido);
  return {
    ...rest,
    items: rest.items.map(mapItem),
    impresiones: _count.print_logs,
    es_fusion: originales.length > 0,
    ...totales,
  };
}

// ──────────────────────────────────────────────
// Lectura
// ──────────────────────────────────────────────

export async function listar(req: Request, res: Response): Promise<void> {
  const fechaParam = req.query["fecha"] as string | undefined;
  const desdeParam = req.query["desde"] as string | undefined;
  const hastaParam = req.query["hasta"] as string | undefined;
  const estadoParam = req.query["estado"] as string | undefined;
  const noVistos = req.query["no_vistos"] === "true";
  const clienteIdParam = req.query["cliente_id"] as string | undefined;
  const erroresImpresion = req.query["errores_impresion"] === "true";

  const where: Prisma.PedidoWhereInput = {
    fusionado_en_id: null,
    deshecho_at: null,
  };

  if (erroresImpresion) {
    const pedidosConError = await prisma.printLog.findMany({
      where: { estado: "error", resuelto_en: null },
      select: { pedido_id: true },
      distinct: ["pedido_id"],
    });
    where.id = { in: pedidosConError.map((p) => p.pedido_id) };
  }

  if (clienteIdParam) {
    where.cliente_id = Number(clienteIdParam);
  } else if (desdeParam && hastaParam) {
    where.fecha = { gte: new Date(desdeParam), lte: new Date(hastaParam) };
  } else if (!erroresImpresion) {
    const fecha = fechaParam ? new Date(fechaParam) : new Date();
    where.fecha = { gte: inicioDia(fecha), lte: finDia(fecha) };
  }

  if (estadoParam && ESTADOS_VALIDOS.includes(estadoParam as EstadoPedido)) {
    where.estado = estadoParam as EstadoPedido;
  }

  if (noVistos) {
    where.visto = false;
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    include: pedidoInclude,
    orderBy: { created_at: "desc" },
    ...(erroresImpresion && { take: 200 }),
  });

  res.json(pedidos.map(mapPedido));
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { fecha, cliente_id, aclaraciones } = req.body as {
    fecha?: string;
    cliente_id?: number | null;
    aclaraciones?: string | null;
  };

  const data: Prisma.PedidoUpdateInput = {};
  if (fecha !== undefined) data.fecha = new Date(fecha);
  if (aclaraciones !== undefined) data.aclaraciones = aclaraciones;
  if (cliente_id !== undefined) {
    if (cliente_id === null) {
      data.cliente = { disconnect: true };
    } else {
      data.cliente = { connect: { id: Number(cliente_id) } };
    }
  }

  const pedido = await prisma.pedido.update({
    where: { id },
    data,
    include: pedidoInclude,
  });
  res.json(mapPedido(pedido));
}

export async function obtener(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: pedidoInclude,
  });
  if (!pedido) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }
  res.json(mapPedido(pedido));
}

// ──────────────────────────────────────────────
// Crear desde el panel web (protegido con JWT)
// ──────────────────────────────────────────────

export async function crearDesdePanel(
  req: Request,
  res: Response,
): Promise<void> {
  const { cliente_id, fecha, estado } = req.body as {
    cliente_id?: number | null;
    fecha?: string;
    estado?: EstadoPedido;
  };

  const data: Prisma.PedidoCreateInput = {
    estado: ESTADOS_VALIDOS.includes(estado as EstadoPedido)
      ? (estado as EstadoPedido)
      : "recibido",
    fecha: fecha ? new Date(fecha) : new Date(),
  };

  if (cliente_id != null) {
    data.cliente = { connect: { id: Number(cliente_id) } };
  }

  const pedido = await prisma.pedido.create({
    data,
    include: pedidoInclude,
  });

  res.status(201).json(mapPedido(pedido));
}

// ──────────────────────────────────────────────
// Crear desde WhatsApp (público, sin JWT)
// ──────────────────────────────────────────────

interface ItemN8n {
  producto_raw: string;
  cantidad: number;
  unidad: string;
}

export async function crearDesdeWhatsapp(
  req: Request,
  res: Response,
): Promise<void> {
  const { telefono, nombre: nombreCliente, whatsapp_msg, aclaraciones, items } = req.body as {
    telefono: string;
    nombre?: string;
    whatsapp_msg?: string;
    aclaraciones?: string;
    items: ItemN8n[];
  };

  const pedido = await prisma.$transaction(async (tx) => {
    let cliente = await tx.cliente.findUnique({ where: { telefono } });
    if (!cliente) {
      cliente = await tx.cliente.create({
        data: { nombre: nombreCliente ?? telefono, telefono },
      });
    }

    const itemsResueltos: Prisma.ItemPedidoCreateManyPedidoInput[] =
      await Promise.all(
        items.map(async (item) => {
          const producto = await tx.producto.findFirst({
            where: {
              activo: true,
              nombre: { equals: item.producto_raw, mode: "insensitive" },
            },
          });

          const unidadObj = await tx.unidad.findFirst({
            where: {
              OR: [
                { nombre: { equals: item.unidad, mode: "insensitive" } },
                { abreviacion: { equals: item.unidad, mode: "insensitive" } },
              ],
            },
          });

          let precio_unitario: Prisma.Decimal | null = null;

          if (producto && unidadObj) {
            precio_unitario = await resolverPrecio(tx, cliente.id, null, producto.id, unidadObj.id);
          }

          return {
            producto_id: producto?.id ?? null,
            producto_raw: item.producto_raw,
            cantidad: item.cantidad,
            unidad: item.unidad,
            unidad_id: unidadObj?.id ?? null,
            precio_unitario,
          };
        }),
      );

    return tx.pedido.create({
      data: {
        cliente_id: cliente.id,
        estado: "recibido",
        whatsapp_msg,
        aclaraciones: aclaraciones ?? null,
        items: { createMany: { data: itemsResueltos } },
      },
      include: pedidoInclude,
    });
  });

  res.status(201).json(mapPedido(pedido));
}

// ──────────────────────────────────────────────
// Mutaciones de estado y descuento
// ──────────────────────────────────────────────

export async function actualizarEstado(
  req: Request,
  res: Response,
): Promise<void> {
  const id = Number(req.params["id"]);
  const { estado } = req.body as { estado: EstadoPedido };

  if (!ESTADOS_VALIDOS.includes(estado)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }

  const pedido = await prisma.pedido.update({
    where: { id },
    data: { estado, visto: true },
    include: pedidoInclude,
  });
  res.json(mapPedido(pedido));
}

export async function actualizarDescuento(
  req: Request,
  res: Response,
): Promise<void> {
  const id = Number(req.params["id"]);
  const { tipo, valor, motivo } = req.body as {
    tipo: "porcentaje" | "monto_fijo";
    valor: number;
    motivo?: string;
  };

  if (!["porcentaje", "monto_fijo"].includes(tipo)) {
    res.status(400).json({ error: "Tipo de descuento inválido" });
    return;
  }

  const pedido = await prisma.pedido.update({
    where: { id },
    data: {
      descuento_tipo: tipo,
      descuento_valor: valor,
      descuento_motivo: motivo ?? null,
    },
    include: pedidoInclude,
  });
  res.json(mapPedido(pedido));
}

export async function eliminarDescuento(
  req: Request,
  res: Response,
): Promise<void> {
  const id = Number(req.params["id"]);
  const pedido = await prisma.pedido.update({
    where: { id },
    data: {
      descuento_tipo: null,
      descuento_valor: null,
      descuento_motivo: null,
    },
    include: pedidoInclude,
  });
  res.json(mapPedido(pedido));
}

// ──────────────────────────────────────────────
// Eliminar (solo admin — validado en la ruta)
// ──────────────────────────────────────────────

export async function eliminar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  await prisma.pedido.delete({ where: { id } });
  res.status(204).send();
}

// ──────────────────────────────────────────────
// Duplicar
// ──────────────────────────────────────────────

export async function duplicar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { cliente_id } = req.body as { cliente_id?: number };

  const original = await prisma.pedido.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!original) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }

  const nuevo = await prisma.pedido.create({
    data: {
      cliente_id: cliente_id ?? original.cliente_id,
      estado: "recibido",
      visto: false,
      items: {
        createMany: {
          data: original.items.map((item) => ({
            producto_id: item.producto_id,
            producto_raw: item.producto_raw,
            cantidad: item.cantidad,
            unidad: item.unidad,
            unidad_id: item.unidad_id,
            precio_unitario: item.precio_unitario,
          })),
        },
      },
    },
    include: pedidoInclude,
  });

  res.status(201).json(mapPedido(nuevo));
}

// ──────────────────────────────────────────────
// Fusionar
// ──────────────────────────────────────────────

export async function fusionar(req: Request, res: Response): Promise<void> {
  const { ids, cliente_id } = req.body as {
    ids: number[];
    cliente_id?: number;
  };

  if (!Array.isArray(ids) || ids.length < 2) {
    res
      .status(400)
      .json({ error: "Se necesitan al menos 2 pedidos para fusionar" });
    return;
  }

  // Si no viene cliente_id, devolver los clientes únicos de esos pedidos
  if (cliente_id == null) {
    const pedidosInfo = await prisma.pedido.findMany({
      where: { id: { in: ids } },
      include: { cliente: true },
    });

    if (pedidosInfo.length !== ids.length) {
      res.status(404).json({ error: "Uno o más pedidos no encontrados" });
      return;
    }

    const clientesMap = new Map<number, { id: number; nombre: string; telefono: string }>();
    for (const p of pedidosInfo) {
      if (p.cliente) {
        clientesMap.set(p.cliente.id, {
          id: p.cliente.id,
          nombre: p.cliente.nombre,
          telefono: p.cliente.telefono,
        });
      }
    }

    res.status(400).json({
      error: "Se requiere cliente_id",
      clientes: Array.from(clientesMap.values()),
    });
    return;
  }

  const pedido = await prisma.$transaction(async (tx) => {
    const originales = await tx.pedido.findMany({
      where: { id: { in: ids } },
      include: { items: true },
    });

    if (originales.length !== ids.length) {
      throw new Error("Uno o más pedidos no encontrados");
    }

    const todosLosItems = originales.flatMap((p) =>
      p.items.map((item) => ({
        producto_id: item.producto_id,
        producto_raw: item.producto_raw,
        cantidad: item.cantidad,
        unidad: item.unidad,
        unidad_id: item.unidad_id,
        precio_unitario: item.precio_unitario,
      })),
    );

    const nuevo = await tx.pedido.create({
      data: {
        cliente_id,
        estado: "recibido",
        items: { createMany: { data: todosLosItems } },
      },
      include: pedidoInclude,
    });

    await tx.pedido.updateMany({
      where: { id: { in: ids } },
      data: { fusionado_en_id: nuevo.id, fusionado_at: new Date() },
    });

    return nuevo;
  });

  res.status(201).json(mapPedido(pedido));
}

// ──────────────────────────────────────────────
// Deshacer fusión
// ──────────────────────────────────────────────

export async function deshacerFusion(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { originales: { select: { id: true } } },
  });

  if (!pedido) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }
  if (pedido.originales.length === 0) {
    res.status(400).json({ error: "Este pedido no es resultado de una fusión" });
    return;
  }
  if (pedido.deshecho_at) {
    res.status(400).json({ error: "Esta fusión ya fue deshecha" });
    return;
  }

  await prisma.$transaction([
    prisma.pedido.update({ where: { id }, data: { deshecho_at: new Date() } }),
    prisma.pedido.updateMany({
      where: { fusionado_en_id: id },
      data: { fusionado_en_id: null, fusionado_at: null },
    }),
  ]);

  res.json({ ok: true });
}

// ──────────────────────────────────────────────
// Imprimir
// ──────────────────────────────────────────────

export async function imprimir(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { cut = true, printer_name, ip, port, text_size = "double_width", con_precios = false } = req.body as {
    cut?: boolean;
    printer_name?: string;
    ip?: string;
    port?: number;
    text_size?: string;
    con_precios?: boolean;
  };

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { cliente: true, items: { include: { producto: true, unidad_rel: true } } },
  });

  if (!pedido) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }

  const printer_msg = buildPrinterMsg(
    pedido.cliente,
    pedido.fecha,
    pedido.items,
    pedido.aclaraciones,
    con_precios,
    { tipo: pedido.descuento_tipo, valor: pedido.descuento_valor },
  );

  let ok = false;
  let error: string | undefined;

  const printServerUrl = process.env["PRINT_SERVER_URL"] ?? "http://localhost:5001/print";
  const printServerToken = process.env["PRINT_SERVER_TOKEN"] ?? "";

  try {
    const response = await fetch(printServerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Printer-Token": printServerToken,
      },
      body: JSON.stringify({ text: printer_msg, cut, printer_name, ip, port, text_size }),
    });

    if (response.ok) {
      ok = true;
    } else {
      const body = await response.json().catch(() => ({})) as { error?: string };
      error = body.error ?? `HTTP ${response.status}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Error desconocido";
  }

  // La impresión NO marca el pedido como visto: solo el operador lo hace
  // desde el panel (toggle o cambio de estado). El historial vive en PrintLog.
  const printLog = await prisma.printLog.create({
    data: {
      pedido_id: id,
      estado: ok ? "ok" : "error",
      con_precios,
      error_msg: ok ? null : (error ?? "Error desconocido"),
      printer_msg,
    },
  });

  const pedidoActualizado = await prisma.pedido.findUniqueOrThrow({
    where: { id },
    include: pedidoInclude,
  });

  res.json({ ok, print_log_id: printLog.id, pedido: mapPedido(pedidoActualizado) });
}

export async function ticketPreview(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const con_precios = req.query["con_precios"] === "true";

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { cliente: true, items: { include: { producto: true, unidad_rel: true } } },
  });

  if (!pedido) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }

  const text = buildPrinterMsg(
    pedido.cliente,
    pedido.fecha,
    pedido.items,
    pedido.aclaraciones,
    con_precios,
    { tipo: pedido.descuento_tipo, valor: pedido.descuento_valor },
  );

  res.json({ text });
}

export async function getImpresiones(
  req: Request,
  res: Response,
): Promise<void> {
  const pedidoId = Number(req.params["id"]);
  const logs = await prisma.printLog.findMany({
    where: { pedido_id: pedidoId },
    orderBy: { fecha: "desc" },
  });
  res.json(logs);
}

export async function getErroresImpresion(
  req: Request,
  res: Response,
): Promise<void> {
  // Get pedidos where the LAST print attempt was an error
  type ErrorRow = {
    pedido_id: bigint;
    fecha_pedido: Date;
    cliente_nombre: string | null;
    ultimo_error: string | null;
    fecha_error: Date;
  };

  const desde30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<ErrorRow[]>`
    SELECT DISTINCT ON (pl.pedido_id)
      pl.pedido_id,
      p.fecha AS fecha_pedido,
      c.nombre AS cliente_nombre,
      pl.error_msg AS ultimo_error,
      pl.fecha AS fecha_error
    FROM print_logs pl
    JOIN pedidos p ON p.id = pl.pedido_id
    LEFT JOIN clientes c ON c.id = p.cliente_id
    WHERE pl.resuelto_en IS NULL
      AND pl.fecha >= ${desde30dias}
    ORDER BY pl.pedido_id, pl.fecha DESC
  `;

  const errores = rows
    .filter((r) => r.ultimo_error !== null)
    .map((r) => ({
      pedido_id: Number(r.pedido_id),
      fecha_pedido: r.fecha_pedido,
      cliente_nombre: r.cliente_nombre,
      ultimo_error: r.ultimo_error,
      fecha_error: r.fecha_error,
    }));

  res.json(errores);
}

// ──────────────────────────────────────────────
// Resolver error de impresión
// ──────────────────────────────────────────────

export async function resolverErrorImpresion(req: Request, res: Response): Promise<void> {
  const pedidoId = Number(req.params["id"]);
  await prisma.printLog.updateMany({
    where: { pedido_id: pedidoId, estado: "error", resuelto_en: null },
    data: { resuelto_en: new Date() },
  });
  res.json({ ok: true });
}

// ──────────────────────────────────────────────
// Marcar como no visto
// ──────────────────────────────────────────────

export async function marcarNoVisto(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const pedido = await prisma.pedido.update({
    where: { id },
    data: { visto: false },
    include: pedidoInclude,
  });
  res.json(mapPedido(pedido));
}

export async function marcarVisto(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const pedido = await prisma.pedido.update({
    where: { id },
    data: { visto: true },
    include: pedidoInclude,
  });
  res.json(mapPedido(pedido));
}

// ──────────────────────────────────────────────
// Confirmar por WhatsApp
// ──────────────────────────────────────────────
// Chatwoot — URL de conversación del cliente
// ──────────────────────────────────────────────

export async function chatwootUrl(
  req: Request,
  res: Response,
): Promise<void> {
  const id = Number(req.params["id"]);

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { cliente: true },
  });

  if (!pedido?.cliente?.telefono) {
    res.json({ conv_id: null, conv_url: null });
    return;
  }

  const baseUrl   = process.env["CHATWOOT_URL"]        ?? "";
  const token     = process.env["CHATWOOT_TOKEN"]      ?? "";
  const accountId = process.env["CHATWOOT_ACCOUNT_ID"] ?? "1";
  const inboxId   = Number(process.env["CHATWOOT_INBOX_ID"] ?? "3");

  if (!baseUrl || !token) {
    res.json({ conv_id: null, conv_url: null });
    return;
  }

  try {
    const searchRes = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(pedido.cliente.telefono)}&include_contacts=true`,
      { headers: { api_access_token: token } },
    );
    const search = await searchRes.json() as { meta?: { count: number }; payload?: { id: number }[] };

    if (!search.meta?.count || !search.payload?.[0]) {
      res.json({ conv_id: null, conv_url: null });
      return;
    }

    const contactId = search.payload[0].id;
    const convsRes = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
      { headers: { api_access_token: token } },
    );
    const convs = await convsRes.json() as { payload?: { id: number; inbox_id: number; status: string; last_activity_at: number }[] };

    const lista = (convs.payload ?? [])
      .filter((c) => c.inbox_id === inboxId)
      .sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0));

    const conv = lista[0] ?? null;
    const conv_id = conv?.id ?? null;
    const conv_url = conv_id
      ? `${baseUrl}/app/accounts/${accountId}/inbox/${inboxId}/conversations/${conv_id}`
      : null;
    const contact_url = `${baseUrl}/app/accounts/${accountId}/contacts/${contactId}`;

    res.json({ conv_id, conv_url, contact_url });
  } catch {
    res.json({ conv_id: null, conv_url: null });
  }
}

// ──────────────────────────────────────────────

export async function confirmarWhatsapp(
  req: Request,
  res: Response,
): Promise<void> {
  const id = Number(req.params["id"]);

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      cliente: true,
      items: { include: { producto: true } },
    },
  });

  if (!pedido) {
    res.status(404).json({ error: "Pedido no encontrado" });
    return;
  }

  if (!pedido.cliente?.telefono) {
    res.status(422).json({ error: "El pedido no tiene cliente con teléfono" });
    return;
  }

  const lineas = pedido.items.map((i) => {
    const nombre = i.producto?.nombre ?? i.producto_raw ?? "—";
    const cant = parseFloat(i.cantidad.toString());
    return `• ${nombre} x${cant} ${i.unidad}`;
  });

  const mensaje =
    `✅ *Pedido #${pedido.id} confirmado*\n\n` +
    lineas.join("\n") +
    `\n\n¡Gracias por tu pedido! 🍊`;

  const webhookUrl = process.env["N8N_CONFIRMACION_WEBHOOK"];
  if (!webhookUrl) {
    res.status(503).json({ error: "Webhook de WhatsApp no configurado" });
    return;
  }

  try {
    const n8nRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedido_id: pedido.id,
        telefono: pedido.cliente.telefono,
        cliente: pedido.cliente.nombre,
        mensaje,
      }),
    });

    if (!n8nRes.ok) {
      const body = await n8nRes.json().catch(() => ({})) as { error?: string };
      const status = n8nRes.status === 422 ? 422 : 502;
      res.status(status).json({ error: body.error ?? "Error al enviar por WhatsApp" });
      return;
    }

    const n8nBody = await n8nRes.json().catch(() => ({})) as { conv_id?: number };
    res.json({ ok: true, telefono: pedido.cliente.telefono, conv_id: n8nBody.conv_id ?? null });
  } catch (err) {
    res.status(502).json({ error: "No se pudo contactar el servicio de WhatsApp" });
  }
}

// ──────────────────────────────────────────────
// Items del pedido
// ──────────────────────────────────────────────

export async function crearItem(req: Request, res: Response): Promise<void> {
  const pedido_id = Number(req.params["id"]);
  const {
    producto_raw,
    cantidad,
    unidad,
    producto_id,
    unidad_id,
    precio_unitario,
  } = req.body as {
    producto_raw: string;
    cantidad: number;
    unidad: string;
    producto_id?: number;
    unidad_id?: number;
    precio_unitario?: number;
  };

  // Si no se especificó precio_unitario, buscar el mejor precio vigente para el pedido
  let precio_final: Prisma.Decimal | null = null;

  if (precio_unitario != null) {
    precio_final = new Prisma.Decimal(precio_unitario);
  } else if (producto_id && unidad_id) {
    const pedidoInfo = await prisma.pedido.findUnique({
      where: { id: pedido_id },
      select: { cliente_id: true, lista_precio_id: true },
    });

    precio_final = await resolverPrecio(
      prisma as unknown as TxClient,
      pedidoInfo?.cliente_id ?? null,
      pedidoInfo?.lista_precio_id ?? null,
      producto_id,
      unidad_id,
    );
  }

  const item = await prisma.itemPedido.create({
    data: { pedido_id, producto_raw, cantidad, unidad, producto_id, unidad_id, precio_unitario: precio_final },
    include: { producto: true, unidad_rel: true },
  });

  res.status(201).json({ ...item, descuento_item: null });
}

export async function actualizarItem(
  req: Request,
  res: Response,
): Promise<void> {
  const itemId = Number(req.params["itemId"]);
  const {
    cantidad,
    unidad,
    precio_unitario,
    producto_id,
    unidad_id,
    producto_raw,
  } = req.body as {
    cantidad?: number;
    unidad?: string;
    precio_unitario?: number | null;
    producto_id?: number;
    unidad_id?: number;
    producto_raw?: string;
  };

  const data: Prisma.ItemPedidoUncheckedUpdateInput = {
    cantidad,
    unidad,
    precio_unitario: precio_unitario !== undefined ? precio_unitario : undefined,
    producto_id,
    unidad_id,
    producto_raw,
  };

  const item = await prisma.itemPedido.update({
    where: { id: itemId },
    data,
    include: { producto: true, unidad_rel: true },
  });

  res.json({ ...item, descuento_item: null });
}

export async function eliminarItem(
  req: Request,
  res: Response,
): Promise<void> {
  const itemId = Number(req.params["itemId"]);
  await prisma.itemPedido.delete({ where: { id: itemId } });
  res.status(204).send();
}

// ──────────────────────────────────────────────
// Operaciones bulk
// ──────────────────────────────────────────────

export async function marcarVistosBulk(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "Se requiere un arreglo de ids" });
    return;
  }
  await prisma.pedido.updateMany({ where: { id: { in: ids } }, data: { visto: true } });
  res.json({ ok: true, count: ids.length });
}

export async function marcarNoVistosBulk(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "Se requiere un arreglo de ids" });
    return;
  }
  await prisma.pedido.updateMany({
    where: { id: { in: ids } },
    data: { visto: false },
  });
  res.json({ ok: true, count: ids.length });
}

export async function cambiarEstadoBulk(req: Request, res: Response): Promise<void> {
  const { ids, estado } = req.body as { ids: number[]; estado: EstadoPedido };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "Se requiere un arreglo de ids" });
    return;
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }
  await prisma.pedido.updateMany({ where: { id: { in: ids } }, data: { estado, visto: true } });
  res.json({ ok: true, count: ids.length });
}

export async function eliminarBulk(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "Se requiere un arreglo de ids" });
    return;
  }
  await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
  res.status(204).send();
}
