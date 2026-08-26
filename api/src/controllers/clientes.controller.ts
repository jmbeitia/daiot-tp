import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type ClienteConStats = {
  id: bigint;
  nombre: string;
  telefono: string;
  contact_id: string | null;
  activo: boolean;
  created_at: Date;
  total_pedidos: bigint;
  suma_total: string | null;
  ultimo_pedido: Date | null;
};

export async function listar(req: Request, res: Response): Promise<void> {
  const buscar = (req.query["buscar"] as string | undefined) ?? "";

  let data: ClienteConStats[];

  if (buscar) {
    data = await prisma.$queryRaw<ClienteConStats[]>`
      SELECT
        c.id,
        c.nombre,
        c.telefono,
        c.contact_id,
        c.activo,
        c.created_at,
        COALESCE(COUNT(DISTINCT p.id), 0) AS total_pedidos,
        SUM(i.cantidad * COALESCE(i.precio_unitario, 0)) AS suma_total,
        MAX(p.fecha) AS ultimo_pedido
      FROM clientes c
      LEFT JOIN pedidos p ON p.cliente_id = c.id
      LEFT JOIN items_pedido i ON i.pedido_id = p.id
      WHERE c.activo = true
        AND (c.nombre ILIKE ${'%' + buscar + '%'} OR c.telefono ILIKE ${'%' + buscar + '%'})
      GROUP BY c.id
      ORDER BY total_pedidos DESC, c.nombre ASC
    `;
  } else {
    data = await prisma.$queryRaw<ClienteConStats[]>`
      SELECT
        c.id,
        c.nombre,
        c.telefono,
        c.contact_id,
        c.activo,
        c.created_at,
        COALESCE(COUNT(DISTINCT p.id), 0) AS total_pedidos,
        SUM(i.cantidad * COALESCE(i.precio_unitario, 0)) AS suma_total,
        MAX(p.fecha) AS ultimo_pedido
      FROM clientes c
      LEFT JOIN pedidos p ON p.cliente_id = c.id
      LEFT JOIN items_pedido i ON i.pedido_id = p.id
      WHERE c.activo = true
      GROUP BY c.id
      ORDER BY total_pedidos DESC, c.nombre ASC
    `;
  }

  const result = data.map((c) => ({
    ...c,
    id: Number(c.id),
    total_pedidos: Number(c.total_pedidos),
    suma_total: c.suma_total != null ? parseFloat(c.suma_total) : 0,
  }));

  res.json({ data: result, total: result.length });
}

export async function obtener(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return;
  }
  res.json(cliente);
}

export async function crear(req: Request, res: Response): Promise<void> {
  const { nombre, telefono, contact_id } = req.body as {
    nombre: string;
    telefono: string;
    contact_id?: string;
  };
  const cliente = await prisma.cliente.create({
    data: { nombre, telefono, contact_id },
  });
  res.status(201).json(cliente);
}

export async function actualizar(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const { nombre, contact_id, activo } = req.body as {
    nombre?: string;
    contact_id?: string;
    activo?: boolean;
  };
  const cliente = await prisma.cliente.update({
    where: { id },
    data: { nombre, contact_id, activo },
  });
  res.json(cliente);
}

export async function sync(req: Request, res: Response): Promise<void> {
  const { nombre, telefono, contact_id } = req.body as {
    nombre: string;
    telefono: string;
    contact_id?: string;
  };

  if (!nombre || !telefono) {
    res.status(400).json({ error: "nombre y telefono son requeridos" });
    return;
  }

  const cliente = await prisma.cliente.upsert({
    where: { telefono },
    update: { nombre, ...(contact_id !== undefined && { contact_id }) },
    create: { nombre, telefono, contact_id },
  });

  res.json(cliente);
}

export async function metricasCliente(req: Request, res: Response): Promise<void> {
  const clienteId = Number(req.params["id"]);
  const PERIODOS_VALIDOS = [7, 30, 90, 365];
  const diasRaw = Number(req.query.dias);
  const dias = PERIODOS_VALIDOS.includes(diasRaw) ? diasRaw : 365;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  type KpiRow = { total_pedidos: bigint; gasto_total: string; ticket_promedio: string };
  type TopRow = { nombre: string; cantidad: string };
  type MesRow = { mes: Date; total: string };

  const granularidad: "dia" | "semana" | "mes" =
    dias <= 7 ? "dia" : dias <= 90 ? "semana" : "mes";

  const gastoQuery = (): Promise<MesRow[]> => {
    if (granularidad === "dia") {
      return prisma.$queryRaw<MesRow[]>`
        SELECT DATE_TRUNC('day', p.fecha)::date AS mes,
               COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
        FROM pedidos p LEFT JOIN items_pedido i ON i.pedido_id = p.id
        WHERE p.cliente_id = ${clienteId} AND p.fecha >= ${desde}
        GROUP BY DATE_TRUNC('day', p.fecha)::date ORDER BY mes
      `;
    }
    if (granularidad === "semana") {
      return prisma.$queryRaw<MesRow[]>`
        SELECT DATE_TRUNC('week', p.fecha)::date AS mes,
               COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
        FROM pedidos p LEFT JOIN items_pedido i ON i.pedido_id = p.id
        WHERE p.cliente_id = ${clienteId} AND p.fecha >= ${desde}
        GROUP BY DATE_TRUNC('week', p.fecha)::date ORDER BY mes
      `;
    }
    return prisma.$queryRaw<MesRow[]>`
      SELECT DATE_TRUNC('month', p.fecha)::date AS mes,
             COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
      FROM pedidos p LEFT JOIN items_pedido i ON i.pedido_id = p.id
      WHERE p.cliente_id = ${clienteId} AND p.fecha >= ${desde}
      GROUP BY DATE_TRUNC('month', p.fecha)::date ORDER BY mes
    `;
  };

  const [kpiRows, topRows, mesRows] = await Promise.all([
    prisma.$queryRaw<KpiRow[]>`
      SELECT
        COUNT(DISTINCT p.id)::bigint AS total_pedidos,
        COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS gasto_total,
        CASE WHEN COUNT(DISTINCT p.id) = 0 THEN '0'
             ELSE (COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)
                   / COUNT(DISTINCT p.id))::text
        END AS ticket_promedio
      FROM pedidos p
      LEFT JOIN items_pedido i ON i.pedido_id = p.id
      WHERE p.cliente_id = ${clienteId}
        AND p.fecha >= ${desde}
    `,
    prisma.$queryRaw<TopRow[]>`
      SELECT
        COALESCE(pr.nombre, i.producto_raw, 'Desconocido') AS nombre,
        COALESCE(SUM(i.cantidad * i.precio_unitario), 0)::text AS cantidad
      FROM items_pedido i
      JOIN pedidos p ON p.id = i.pedido_id
      LEFT JOIN productos pr ON pr.id = i.producto_id
      WHERE p.cliente_id = ${clienteId}
        AND p.fecha >= ${desde}
        AND i.precio_unitario IS NOT NULL
      GROUP BY pr.nombre, i.producto_raw
      ORDER BY SUM(i.cantidad * i.precio_unitario) DESC
      LIMIT 10
    `,
    gastoQuery(),
  ]);

  const kpi = kpiRows[0] ?? { total_pedidos: 0n, gasto_total: "0", ticket_promedio: "0" };

  res.json({
    total_pedidos: Number(kpi.total_pedidos),
    gasto_total: parseFloat(kpi.gasto_total),
    ticket_promedio: parseFloat(kpi.ticket_promedio),
    granularidad,
    top_productos: topRows.map((r) => ({
      nombre: r.nombre,
      total: parseFloat(r.cantidad),
    })),
    gasto_mensual: mesRows.map((r) => ({
      mes: (r.mes as Date).toISOString().substring(0, 10), // YYYY-MM-DD siempre
      total: parseFloat(r.total),
    })),
  });
}
