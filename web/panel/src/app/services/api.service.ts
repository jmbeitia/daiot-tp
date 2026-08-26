import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Categoria,
  Cliente,
  ClienteConStats,
  ErrorImpresion,
  ItemPedido,
  ItemPedidoConPedido,
  CategoriasDistribucion,
  ClienteMetricas,
  Metricas,
  Pedido,
  ProductoTiempo,
  TraficoPedidos,
  PrintLog,
  Producto,
  Unidad,
  Usuario,
  ListaPrecio,
  PrecioListaPrecio,
  ImportListaResultado,
} from '../models';

const BASE = (window as any).__API_URL__ ?? 'http://localhost:3000/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // ── Catálogo ────────────────────────────────────────

  getCategorias() {
    return this.http.get<Categoria[]>(`${BASE}/categorias`);
  }

  createCategoria(data: { nombre: string; descripcion?: string }) {
    return this.http.post<Categoria>(`${BASE}/categorias`, data);
  }

  updateCategoria(id: number, data: { nombre?: string; descripcion?: string; activo?: boolean }) {
    return this.http.put<Categoria>(`${BASE}/categorias/${id}`, data);
  }

  deleteCategoria(id: number) {
    return this.http.delete<void>(`${BASE}/categorias/${id}`);
  }

  getUnidades() {
    return this.http.get<Unidad[]>(`${BASE}/unidades`);
  }

  createUnidad(data: { nombre: string; abreviacion?: string }) {
    return this.http.post<Unidad>(`${BASE}/unidades`, data);
  }

  updateUnidad(id: number, data: { nombre?: string; abreviacion?: string }) {
    return this.http.put<Unidad>(`${BASE}/unidades/${id}`, data);
  }

  deleteUnidad(id: number) {
    return this.http.delete<void>(`${BASE}/unidades/${id}`);
  }

  // ── Productos ────────────────────────────────────────

  getProductos(clienteId?: number | null, fecha?: string | null, todos?: boolean) {
    const params: string[] = [];
    if (clienteId) params.push(`cliente_id=${clienteId}`);
    if (fecha) params.push(`fecha=${encodeURIComponent(fecha)}`);
    if (todos) params.push('todos=true');
    const qs = params.length ? `?${params.join('&')}` : '';
    return this.http.get<Producto[]>(`${BASE}/productos${qs}`);
  }

  createProducto(data: {
    nombre: string;
    categoria_id?: number | null;
    unidad_default: string;
    precios?: { unidad_id: number; precio: number }[];
  }) {
    return this.http.post<Producto>(`${BASE}/productos`, data);
  }

  updateProducto(
    id: number,
    data: {
      nombre?: string;
      categoria_id?: number | null;
      unidad_default?: string;
      activo?: boolean;
      precios?: { unidad_id: number; precio: number }[];
    },
  ) {
    return this.http.put<Producto>(`${BASE}/productos/${id}`, data);
  }

  deleteProducto(id: number) {
    return this.http.delete<{ action: string; message: string }>(`${BASE}/productos/${id}`);
  }

  getPedidosDelProducto(id: number, page: number, limit: number) {
    const params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));
    return this.http.get<{ pedidos: ItemPedidoConPedido[]; total: number }>(
      `${BASE}/productos/${id}/pedidos`,
      { params },
    );
  }

  upsertPrecioDefault(data: { producto_id: number; unidad_id: number; precio: number }) {
    return this.http.post<{ id: number; precio: string }>(`${BASE}/precios_default`, data);
  }

  deletePrecioDefault(productoId: number, unidadId: number) {
    return this.http.delete<void>(`${BASE}/precios_default/${productoId}/${unidadId}`);
  }

  exportPreciosDefault() {
    return this.http.get(`${BASE}/precios_default/export`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  importPreciosDefault(contenido: string) {
    return this.http.post<ImportListaResultado>(`${BASE}/precios_default/import`, { contenido });
  }

  // ── Clientes ────────────────────────────────────────

  getClientes(buscar = '') {
    let params = new HttpParams();
    if (buscar) params = params.set('buscar', buscar);
    return this.http.get<{ data: ClienteConStats[]; total: number }>(
      `${BASE}/clientes`,
      { params },
    );
  }

  getCliente(id: number) {
    return this.http.get<Cliente>(`${BASE}/clientes/${id}`);
  }

  createCliente(data: { nombre: string; telefono: string; contact_id?: string }) {
    return this.http.post<Cliente>(`${BASE}/clientes`, data);
  }

  updateCliente(id: number, data: { nombre?: string; contact_id?: string; activo?: boolean }) {
    return this.http.put<Cliente>(`${BASE}/clientes/${id}`, data);
  }

  // ── Listas de precios ────────────────────────────────

  getListasPrecio(clienteId: number) {
    return this.http.get<ListaPrecio[]>(`${BASE}/clientes/${clienteId}/listas`);
  }

  createListaPrecio(clienteId: number, nombre: string) {
    return this.http.post<ListaPrecio>(`${BASE}/clientes/${clienteId}/listas`, { nombre });
  }

  updateListaPrecio(clienteId: number, listaId: number, data: { nombre?: string; activo?: boolean }) {
    return this.http.put<ListaPrecio>(`${BASE}/clientes/${clienteId}/listas/${listaId}`, data);
  }

  marcarDefaultListaPrecio(clienteId: number, listaId: number) {
    return this.http.put<ListaPrecio>(`${BASE}/clientes/${clienteId}/listas/${listaId}/default`, {});
  }

  deleteListaPrecio(clienteId: number, listaId: number) {
    return this.http.delete<void>(`${BASE}/clientes/${clienteId}/listas/${listaId}`);
  }

  createPrecioLista(clienteId: number, listaId: number, data: { producto_id: number; unidad_id: number; precio: number }) {
    return this.http.post<PrecioListaPrecio>(`${BASE}/clientes/${clienteId}/listas/${listaId}/precios`, data);
  }

  updatePrecioLista(
    clienteId: number,
    listaId: number,
    productoId: number,
    unidadId: number,
    precio: number,
    nuevaUnidadId?: number,
  ) {
    return this.http.put<PrecioListaPrecio>(
      `${BASE}/clientes/${clienteId}/listas/${listaId}/precios/${productoId}/${unidadId}`,
      { precio, ...(nuevaUnidadId != null && { nueva_unidad_id: nuevaUnidadId }) },
    );
  }

  deletePrecioLista(clienteId: number, listaId: number, productoId: number, unidadId: number) {
    return this.http.delete<void>(
      `${BASE}/clientes/${clienteId}/listas/${listaId}/precios/${productoId}/${unidadId}`,
    );
  }

  exportListaPrecio(clienteId: number, listaId: number) {
    return this.http.get(`${BASE}/clientes/${clienteId}/listas/${listaId}/export`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  importListaPrecio(clienteId: number, listaId: number, contenido: string) {
    return this.http.post<ImportListaResultado>(
      `${BASE}/clientes/${clienteId}/listas/${listaId}/import`,
      { contenido },
    );
  }

  // ── Pedidos ────────────────────────────────────────

  getPedidos(params?: {
    fecha?: string;
    desde?: string;
    hasta?: string;
    estado?: string;
    no_vistos?: boolean;
    cliente_id?: number;
    errores_impresion?: boolean;
  }) {
    let query = new HttpParams();
    if (params?.fecha) query = query.set('fecha', params.fecha);
    if (params?.desde) query = query.set('desde', params.desde);
    if (params?.hasta) query = query.set('hasta', params.hasta);
    if (params?.estado) query = query.set('estado', params.estado);
    if (params?.no_vistos) query = query.set('no_vistos', 'true');
    if (params?.cliente_id) query = query.set('cliente_id', String(params.cliente_id));
    if (params?.errores_impresion) query = query.set('errores_impresion', 'true');
    return this.http.get<Pedido[]>(`${BASE}/pedidos`, { params: query });
  }

  getPedido(id: number) {
    return this.http.get<Pedido>(`${BASE}/pedidos/${id}`);
  }

  /** Crear pedido desde el panel (endpoint protegido con JWT) */
  crearPedidoPanel(data: { cliente_id?: number | null; fecha?: string; estado?: string }) {
    return this.http.post<Pedido>(`${BASE}/pedidos/panel`, data);
  }

  /** Crear pedido desde n8n/WhatsApp (público, sin JWT) */
  crearPedido(data: {
    telefono: string;
    items: { producto_raw: string; cantidad: number; unidad: string }[];
  }) {
    return this.http.post<Pedido>(`${BASE}/pedidos`, data);
  }

  patchPedido(id: number, data: { fecha?: string; cliente_id?: number | null }) {
    return this.http.patch<Pedido>(`${BASE}/pedidos/${id}`, data);
  }

  patchEstado(id: number, estado: string) {
    return this.http.patch<Pedido>(`${BASE}/pedidos/${id}/estado`, { estado });
  }

  aplicarDescuento(
    id: number,
    data: { tipo: 'porcentaje' | 'monto_fijo'; valor: number; motivo?: string },
  ) {
    return this.http.patch<Pedido>(`${BASE}/pedidos/${id}/descuento`, data);
  }

  eliminarDescuento(id: number) {
    return this.http.delete<Pedido>(`${BASE}/pedidos/${id}/descuento`);
  }

  imprimirPedido(id: number, data: { con_precios?: boolean; cut?: boolean; printer_name?: string; ip?: string; port?: number; text_size?: string }) {
    return this.http.post<{ ok: boolean; print_log_id: number; pedido: Pedido }>(
      `${BASE}/pedidos/${id}/imprimir`,
      data,
    );
  }

  patchAclaraciones(id: number, aclaraciones: string | null) {
    return this.http.patch<Pedido>(`${BASE}/pedidos/${id}`, { aclaraciones });
  }

  getTicketPreview(pedidoId: number, conPrecios: boolean) {
    return this.http.get<{ text: string }>(`${BASE}/pedidos/${pedidoId}/ticket`, {
      params: { con_precios: String(conPrecios) },
    });
  }

  getImpresiones(pedidoId: number) {
    return this.http.get<PrintLog[]>(`${BASE}/pedidos/${pedidoId}/impresiones`);
  }

  getErroresImpresion() {
    return this.http.get<ErrorImpresion[]>(`${BASE}/print-logs/errores`);
  }

  resolverErrorImpresion(pedidoId: number) {
    return this.http.post<{ ok: boolean }>(`${BASE}/pedidos/${pedidoId}/resolver-error-impresion`, {});
  }

  marcarNoVisto(id: number) {
    return this.http.post<Pedido>(`${BASE}/pedidos/${id}/marcar-no-visto`, {});
  }

  marcarVisto(id: number) {
    return this.http.post<Pedido>(`${BASE}/pedidos/${id}/marcar-visto`, {});
  }

  duplicarPedido(id: number, clienteId?: number) {
    return this.http.post<Pedido>(`${BASE}/pedidos/${id}/duplicar`, {
      ...(clienteId != null && { cliente_id: clienteId }),
    });
  }

  fusionarPedidos(ids: number[], clienteId?: number) {
    return this.http.post<Pedido | { error: string; clientes: { id: number; nombre: string; telefono: string }[] }>(
      `${BASE}/pedidos/fusionar`,
      { ids, ...(clienteId != null && { cliente_id: clienteId }) },
    );
  }

  deshacerFusion(id: number) {
    return this.http.post<{ ok: boolean }>(`${BASE}/pedidos/${id}/deshacer-fusion`, {});
  }

  deletePedido(id: number) {
    return this.http.delete<void>(`${BASE}/pedidos/${id}`);
  }

  marcarVistosBulk(ids: number[]) {
    return this.http.post<{ ok: boolean; count: number }>(`${BASE}/pedidos/marcar-vistos-bulk`, { ids });
  }

  marcarNoVistosBulk(ids: number[]) {
    return this.http.post<{ ok: boolean; count: number }>(`${BASE}/pedidos/marcar-no-vistos-bulk`, { ids });
  }

  cambiarEstadoBulk(ids: number[], estado: string) {
    return this.http.post<{ ok: boolean; count: number }>(`${BASE}/pedidos/cambiar-estado-bulk`, { ids, estado });
  }

  eliminarBulk(ids: number[]) {
    return this.http.delete<void>(`${BASE}/pedidos/bulk`, { body: { ids } });
  }

  getChatwootUrl(id: number) {
    return this.http.get<{ conv_id: number | null; conv_url: string | null; contact_url: string | null }>(
      `${BASE}/pedidos/${id}/chatwoot-url`,
    );
  }

  confirmarWhatsapp(id: number) {
    return this.http.post<{ ok: boolean; telefono: string; conv_id: number | null }>(
      `${BASE}/pedidos/${id}/confirmar-whatsapp`,
      {},
    );
  }

  // Items del pedido
  crearItemPedido(
    pedidoId: number,
    data: {
      producto_raw: string;
      cantidad: number;
      unidad: string;
      producto_id?: number;
      unidad_id?: number;
      precio_unitario?: number;
    },
  ) {
    return this.http.post<ItemPedido>(`${BASE}/pedidos/${pedidoId}/items`, data);
  }

  actualizarItemPedido(
    pedidoId: number,
    itemId: number,
    data: {
      cantidad?: number;
      unidad?: string;
      precio_unitario?: number | null;
      producto_id?: number;
      unidad_id?: number;
      producto_raw?: string;
    },
  ) {
    return this.http.put<ItemPedido>(`${BASE}/pedidos/${pedidoId}/items/${itemId}`, data);
  }

  eliminarItemPedido(pedidoId: number, itemId: number) {
    return this.http.delete<void>(`${BASE}/pedidos/${pedidoId}/items/${itemId}`);
  }

  // ── Métricas ────────────────────────────────────────

  getMetricasHoy() {
    return this.http.get<Metricas>(`${BASE}/metricas/hoy`);
  }

  getTraficoPedidos(dias: 7 | 30 | 90 | 365 = 90) {
    return this.http.get<TraficoPedidos>(`${BASE}/metricas/trafico?dias=${dias}`);
  }

  getProductosTiempo(params?: { producto_id?: number; dias?: number }) {
    const p = new HttpParams();
    let q = p;
    if (params?.dias)        q = q.set('dias', String(params.dias));
    if (params?.producto_id) q = q.set('producto_id', String(params.producto_id));
    return this.http.get<ProductoTiempo>(`${BASE}/metricas/productos-tiempo`, { params: q });
  }

  getCategoriasDistribucion(dias: number = 365) {
    return this.http.get<CategoriasDistribucion>(
      `${BASE}/metricas/categorias-distribucion?dias=${dias}`,
    );
  }

  getClienteMetricas(clienteId: number, dias: number = 365) {
    return this.http.get<ClienteMetricas>(
      `${BASE}/clientes/${clienteId}/metricas?dias=${dias}`,
    );
  }

  // ── Usuarios ────────────────────────────────────────

  getUsuarios() {
    return this.http.get<Usuario[]>(`${BASE}/usuarios`);
  }

  createUsuario(data: { nombre: string; email: string; password: string; rol: string }) {
    return this.http.post<Usuario>(`${BASE}/usuarios`, data);
  }

  updateUsuario(
    id: number,
    data: { nombre?: string; email?: string; rol?: string; activo?: boolean; password?: string },
  ) {
    return this.http.put<Usuario>(`${BASE}/usuarios/${id}`, data);
  }

  deleteUsuario(id: number) {
    return this.http.delete<void>(`${BASE}/usuarios/${id}`);
  }
}
