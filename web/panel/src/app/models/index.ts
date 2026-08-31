export type EstadoPedido = 'recibido' | 'en_preparacion' | 'listo' | 'entregado';
export type Rol = 'admin' | 'operador' | 'readonly';

// ── IoT / Monitoreo ambiental ───────────────────────────

export interface LecturaAmbiental {
  id: number;
  nodo_id: number;
  temperatura: number;
  humedad: number;
  ts: string;
}

export interface NodoIot {
  id: number;
  codigo: string;
  ubicacion: string | null;
  umbral_alerta: number;
  ultimo_visto: string | null;
  activo: boolean;
  created_at: string;
  lecturas?: LecturaAmbiental[];
}

// ── Catálogo ───────────────────────────────────────────

export interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
}

export interface Unidad {
  id: number;
  nombre: string;
  abreviacion?: string | null;
}

export interface PrecioDefault {
  id: number;
  producto_id: number;
  unidad_id: number;
  precio: string | null;
  fecha_desde: string;
  fecha_hasta: string | null;
  unidad: Unidad;
}

export interface Producto {
  id: number;
  nombre: string;
  categoria_id: number | null;
  unidad_default: string;
  activo: boolean;
  categoria: Categoria | null;
  precios_default: PrecioDefault[];
  precios_cliente?: { unidad_id: number; precio: string }[];
}

// ── Clientes ───────────────────────────────────────────

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  contact_id: string | null;
  activo: boolean;
  created_at: string;
}

export interface ClienteConStats extends Cliente {
  total_pedidos: number;
  suma_total: number;
  ultimo_pedido: string | null;
}


export interface ImportListaResultado {
  creados: number;
  actualizados: number;
  eliminados: number;
  sin_cambios: number;
}

export interface PrecioListaPrecio {
  id: number;
  lista_id: number;
  producto_id: number;
  unidad_id: number;
  precio: string;
  fecha_desde: string;
  fecha_hasta: string | null;
  producto: { id: number; nombre: string };
  unidad: Unidad;
}

export interface ListaPrecio {
  id: number;
  nombre: string;
  cliente_id: number;
  es_default: boolean;
  activo: boolean;
  created_at: string;
  precios: PrecioListaPrecio[];
}

// ── Pedidos ────────────────────────────────────────────

export interface ClienteResumen {
  id: number;
  nombre: string;
  telefono: string;
}

export interface ItemPedido {
  id: number;
  producto_id: number | null;
  producto_raw: string | null;
  cantidad: string;
  unidad: string;
  unidad_id: number | null;
  precio_unitario: string | null;       // precio final cobrado
  descuento_item: number | null;        // calculado en front a partir de precios temporales
  producto: { id: number; nombre: string; categoria: { nombre: string } | null } | null;
  unidad_rel: Unidad | null;
}

export interface Pedido {
  id: number;
  fecha: string;
  estado: EstadoPedido;
  cliente_id: number | null;
  lista_precio_id: number | null;
  cliente: ClienteResumen | null;
  items: ItemPedido[];
  aclaraciones: string | null;
  whatsapp_msg: string | null;
  printer_msg: string | null;
  descuento_tipo: string | null;
  descuento_valor: string | null;
  descuento_motivo: string | null;
  impresiones: number;
  created_at: string;
  visto: boolean;
  fusionado_en_id: number | null;
  fusionado_at: string | null;
  deshecho_at: string | null;
  es_fusion: boolean;
  subtotal: number;
  total_items: number;
  descuento_global: number;
  total_final: number;
  ahorro_total: number;
}

// ── Métricas ───────────────────────────────────────────

export interface TopProducto {
  posicion: number;
  producto_id: number;
  nombre: string | null;
  cantidad_pedidos: number;
}

export interface ClienteRanking {
  cliente_id: number;
  nombre: string;
  telefono: string;
  total_pedidos: number;
  suma_total: number;
}

export interface Metricas {
  total_pedidos: number;
  pedidos_no_vistos: number;
  por_estado: Partial<Record<EstadoPedido, number>>;
  top_productos: TopProducto[];
  clientes_ranking: ClienteRanking[];
}

export interface ItemPedidoConPedido {
  id: number;
  cantidad: string;
  unidad: string;
  pedido: {
    id: number;
    fecha: string;
    cliente: { id: number; nombre: string; telefono: string } | null;
  };
}

// ── Print Logs ────────────────────────────────────────

export interface PrintLog {
  id: number;
  pedido_id: number;
  fecha: string;
  estado: 'ok' | 'error';
  con_precios: boolean;
  error_msg: string | null;
  printer_msg: string | null;
  resuelto_en: string | null;
}

export interface ErrorImpresion {
  pedido_id: number;
  fecha_pedido: string;
  cliente_nombre: string | null;
  ultimo_error: string | null;
  fecha_error: string;
}

// ── Tráfico de pedidos ────────────────────────────────

export interface TraficoPorHora {
  dow: number;
  hora: number;
  total: number;
  promedio: number;
}

export interface TraficoPedidos {
  por_dia_hora: TraficoPorHora[];
  periodo_dias: number;
}

// ── Métricas de productos ─────────────────────────────

export interface ProductoTiempoItem {
  mes: string;
  total: number;
}

export interface ProductoTiempo {
  datos: ProductoTiempoItem[];
  granularidad: 'dia' | 'semana' | 'mes';
}

export interface CategoriaDistribucion {
  categoria: string;
  total: number;
  porcentaje: number;
}

export interface CategoriasDistribucion {
  datos: CategoriaDistribucion[];
  total_general: number;
}

// ── Métricas de cliente ───────────────────────────────

export interface ClienteMetricas {
  total_pedidos: number;
  gasto_total: number;
  ticket_promedio: number;
  granularidad: 'dia' | 'semana' | 'mes';
  top_productos: { nombre: string; total: number }[];
  gasto_mensual: { mes: string; total: number }[];
}

// ── Usuarios ───────────────────────────────────────────

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  created_at: string;
}
