import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type TraficoPorHoraRow = {
  dow: number;
  hora: number;
  total: bigint;
  promedio: string; // NUMERIC viene como string en Prisma
};

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

type ClienteRankingRow = {
  cliente_id: bigint;
  nombre: string;
  telefono: string;
  total_pedidos: bigint;
  suma_total: string | null;
};

export async function metricasHoy(req: Request, res: Response): Promise<void> {
  const hoy = new Date();
  const desde = inicioDia(hoy);
  const hasta = finDia(hoy);

  const rangoHoy = { fecha: { gte: desde, lte: hasta } };

  const [totalPedidos, pedidosPorEstado, pedidosNoVistos, topProductos, clientesRankingRaw] =
    await Promise.all([
      prisma.pedido.count({ where: rangoHoy }),

      prisma.pedido.groupBy({
        by: ["estado"],
        where: rangoHoy,
        _count: { estado: true },
      }),

      prisma.pedido.count({
        where: {
          visto: false,
          fecha: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),

      prisma.itemPedido.groupBy({
        by: ["producto_id"],
        where: {
          pedido: rangoHoy,
          producto_id: { not: null },
        },
        _count: { producto_id: true },
        orderBy: { _count: { producto_id: "desc" } },
        take: 20,
      }),

      prisma.$queryRaw<ClienteRankingRow[]>`
        SELECT
          c.id AS cliente_id,
          c.nombre,
          c.telefono,
          COUNT(DISTINCT p.id) AS total_pedidos,
          SUM(i.cantidad * COALESCE(i.precio_unitario, 0)) AS suma_total
        FROM clientes c
        JOIN pedidos p ON p.cliente_id = c.id
        LEFT JOIN items_pedido i ON i.pedido_id = p.id
        WHERE p.fecha >= ${desde} AND p.fecha <= ${hasta}
        GROUP BY c.id, c.nombre, c.telefono
        ORDER BY total_pedidos DESC
        LIMIT 10
      `,
    ]);

  const productoIds = topProductos
    .map((t) => t.producto_id)
    .filter((id): id is number => id !== null);

  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds } },
    select: { id: true, nombre: true },
  });

  const productoMap = new Map(productos.map((p) => [p.id, p.nombre]));

  // Asegurar que todos los estados aparezcan (con 0 si no hay pedidos)
  const estadosBase = { recibido: 0, en_preparacion: 0, listo: 0, entregado: 0 };
  const porEstado = { ...estadosBase };
  for (const e of pedidosPorEstado) {
    porEstado[e.estado] = e._count.estado;
  }

  const clientesRanking = clientesRankingRaw.map((r) => ({
    cliente_id: Number(r.cliente_id),
    nombre: r.nombre,
    telefono: r.telefono,
    total_pedidos: Number(r.total_pedidos),
    suma_total: r.suma_total != null ? parseFloat(r.suma_total) : 0,
  }));

  res.json({
    total_pedidos: totalPedidos,
    pedidos_no_vistos: pedidosNoVistos,
    por_estado: porEstado,
    top_productos: topProductos.map((t, idx) => ({
      posicion: idx + 1,
      producto_id: t.producto_id,
      nombre: productoMap.get(t.producto_id!) ?? null,
      cantidad_pedidos: t._count.producto_id,
    })),
    clientes_ranking: clientesRanking,
  });
}

export async function obtenerTraficoPedidos(req: Request, res: Response): Promise<void> {
  const PERIODOS_VALIDOS = [7, 30, 90, 365];
  const diasRaw = Number(req.query.dias);
  const dias = PERIODOS_VALIDOS.includes(diasRaw) ? diasRaw : 90;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  // Calcula promedio: total pedidos en ese (dow, hora) dividido por cuántas veces
  // apareció ese día de semana en el período (ej. 30 días → ~4-5 lunes).
  const rows = await prisma.$queryRaw<TraficoPorHoraRow[]>`
    WITH ocurrencias AS (
      SELECT
        EXTRACT(DOW FROM gs)::int AS dow,
        COUNT(*)::float           AS n
      FROM generate_series(${desde}::timestamptz, NOW(), '1 day'::interval) AS gs
      GROUP BY dow
    ),
    conteo AS (
      SELECT
        EXTRACT(DOW FROM fecha)::int  AS dow,
        EXTRACT(HOUR FROM fecha)::int AS hora,
        COUNT(*)                      AS total
      FROM pedidos
      WHERE fecha >= ${desde}
      GROUP BY dow, hora
    )
    SELECT
      c.dow,
      c.hora,
      c.total::bigint                        AS total,
      ROUND((c.total::float / o.n)::numeric, 2) AS promedio
    FROM conteo c
    JOIN ocurrencias o ON o.dow = c.dow
    ORDER BY c.dow, c.hora
  `;

  const por_dia_hora = rows.map((r) => ({
    dow: Number(r.dow),
    hora: Number(r.hora),
    total: Number(r.total),
    promedio: parseFloat(r.promedio),
  }));

  res.json({ por_dia_hora, periodo_dias: dias });
}

// ── Evolución de facturación mensual (últimos 12 meses) ───────────────────────

type TiempoRow = { mes: Date; total: string };

export async function obtenerProductosTiempo(req: Request, res: Response): Promise<void> {
  const PERIODOS_VALIDOS = [7, 30, 90, 365];
  const diasRaw = Number(req.query.dias);
  const dias = PERIODOS_VALIDOS.includes(diasRaw) ? diasRaw : 365;
  const productoId = req.query.producto_id ? Number(req.query.producto_id) : null;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const granularidad: "dia" | "semana" | "mes" =
    dias <= 7 ? "dia" : dias <= 90 ? "semana" : "mes";

  let rows: TiempoRow[];

  if (granularidad === "dia") {
    rows = productoId
      ? await prisma.$queryRaw<TiempoRow[]>`
          SELECT DATE_TRUNC('day', p.fecha)::date AS mes,
                 COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
          FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
          WHERE p.fecha >= ${desde} AND i.producto_id = ${productoId}
          GROUP BY DATE_TRUNC('day', p.fecha)::date ORDER BY mes
        `
      : await prisma.$queryRaw<TiempoRow[]>`
          SELECT DATE_TRUNC('day', p.fecha)::date AS mes,
                 COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
          FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
          WHERE p.fecha >= ${desde}
          GROUP BY DATE_TRUNC('day', p.fecha)::date ORDER BY mes
        `;
  } else if (granularidad === "semana") {
    rows = productoId
      ? await prisma.$queryRaw<TiempoRow[]>`
          SELECT DATE_TRUNC('week', p.fecha)::date AS mes,
                 COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
          FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
          WHERE p.fecha >= ${desde} AND i.producto_id = ${productoId}
          GROUP BY DATE_TRUNC('week', p.fecha)::date ORDER BY mes
        `
      : await prisma.$queryRaw<TiempoRow[]>`
          SELECT DATE_TRUNC('week', p.fecha)::date AS mes,
                 COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
          FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
          WHERE p.fecha >= ${desde}
          GROUP BY DATE_TRUNC('week', p.fecha)::date ORDER BY mes
        `;
  } else {
    rows = productoId
      ? await prisma.$queryRaw<TiempoRow[]>`
          SELECT DATE_TRUNC('month', p.fecha)::date AS mes,
                 COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
          FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
          WHERE p.fecha >= ${desde} AND i.producto_id = ${productoId}
          GROUP BY DATE_TRUNC('month', p.fecha)::date ORDER BY mes
        `
      : await prisma.$queryRaw<TiempoRow[]>`
          SELECT DATE_TRUNC('month', p.fecha)::date AS mes,
                 COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
          FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
          WHERE p.fecha >= ${desde}
          GROUP BY DATE_TRUNC('month', p.fecha)::date ORDER BY mes
        `;
  }

  res.json({
    granularidad,
    datos: rows.map((r) => ({
      mes: (r.mes as Date).toISOString().substring(0, 10),
      total: parseFloat(r.total ?? "0"),
    })),
  });
}

// ── Distribución de facturación por categoría (últimos 12 meses) ─────────────

export async function obtenerCategoriasDistribucion(req: Request, res: Response): Promise<void> {
  const PERIODOS_VALIDOS = [7, 30, 90, 365];
  const diasRaw = Number(req.query.dias);
  const dias = PERIODOS_VALIDOS.includes(diasRaw) ? diasRaw : 365;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  type Row = { categoria: string; total: string };

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT COALESCE(cat.nombre, 'Sin categoría') AS categoria,
           COALESCE(SUM(i.cantidad * COALESCE(i.precio_unitario, 0)), 0)::text AS total
    FROM items_pedido i
    JOIN pedidos p ON p.id = i.pedido_id
    LEFT JOIN productos pr ON pr.id = i.producto_id
    LEFT JOIN categorias cat ON cat.id = pr.categoria_id
    WHERE p.fecha >= ${desde}
      AND i.precio_unitario IS NOT NULL
    GROUP BY cat.nombre
    HAVING SUM(i.cantidad * COALESCE(i.precio_unitario, 0)) > 0
    ORDER BY total DESC
  `;

  const totalGeneral = rows.reduce((acc, r) => acc + parseFloat(r.total ?? "0"), 0);
  const datos = rows.map((r) => {
    const total = parseFloat(r.total ?? "0");
    return {
      categoria: r.categoria,
      total,
      porcentaje: totalGeneral > 0 ? Math.round((total / totalGeneral) * 1000) / 10 : 0,
    };
  });

  res.json({ datos, total_general: totalGeneral });
}
