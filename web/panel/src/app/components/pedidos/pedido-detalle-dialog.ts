import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { TextFieldModule } from '@angular/cdk/text-field';
import { startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import {
  Categoria,
  EstadoPedido,
  Pedido,
  PrintLog,
  Producto,
  Unidad,
  ClienteResumen,
} from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

const ESTADOS: { value: EstadoPedido; label: string }[] = [
  { value: 'recibido', label: 'Recibido' },
  { value: 'en_preparacion', label: 'En preparación' },
  { value: 'listo', label: 'Listo' },
  { value: 'entregado', label: 'Entregado' },
];

interface ItemAgregado {
  producto_raw: string;
  cantidad: number;
  unidad: string;
  producto_id?: number;
  unidad_id?: number;
  precio_unitario?: number;
}

interface ItemEditado {
  itemId: number;
  datos: {
    cantidad?: number;
    unidad?: string;
    unidad_id?: number | null;
    precio_unitario?: number | null;
    producto_id?: number;
    producto_raw?: string;
  };
}

interface Cambios {
  estado: EstadoPedido | null;
  fecha: string | null;
  cliente_id: number | null | undefined;
  descuento: { tipo: 'porcentaje' | 'monto_fijo'; valor: number; motivo: string } | null;
  quitarDescuento: boolean;
  visto: boolean | null;
  itemsAgregados: ItemAgregado[];
  itemsEditados: ItemEditado[];
  itemsEliminados: number[];
  productosCreados: number[];
}

@Component({
  selector: 'app-pedido-detalle-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    DecimalPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatIconModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatChipsModule,
    TextFieldModule,
  ],
  templateUrl: './pedido-detalle-dialog.html',
})
export class PedidoDetalleDialogComponent {
  private data = inject<{ pedido: Pedido }>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<PedidoDetalleDialogComponent>);
  private snack = inject(MatSnackBar);
  private elRef = inject(ElementRef);
  protected api = inject(ApiService);
  protected auth = inject(AuthService);

  protected readonly estados = ESTADOS;
  protected pedido = signal<Pedido>(this.data.pedido);
  protected hasChanged = signal(false);
  protected reloading = signal(false);
  protected isAdmin = computed(() => this.auth.getRol() === 'admin');

  protected mostrarConfirmCierre = signal(false);

  // ── Accumulated local changes ────────────────────────────────────────
  protected cambios = signal<Cambios>({
    estado: null,
    fecha: null,
    cliente_id: undefined,
    descuento: null,
    quitarDescuento: false,
    visto: null,
    itemsAgregados: [],
    itemsEditados: [],
    itemsEliminados: [],
    productosCreados: [],
  });

  protected hayCambios = computed(() => {
    const c = this.cambios();
    return (
      c.estado !== null ||
      c.fecha !== null ||
      c.cliente_id !== undefined ||
      c.descuento !== null ||
      c.quitarDescuento ||
      c.visto !== null ||
      c.itemsAgregados.length > 0 ||
      c.itemsEditados.length > 0 ||
      c.itemsEliminados.length > 0 ||
      this.mostrarConfirmCambioCliente()
    );
  });

  // ── Estado ───────────────────────────────────────────────────────────
  protected estadoNuevo = signal<EstadoPedido>(this.data.pedido.estado);
  protected guardandoTodo = signal(false);

  // ── Descuento global ─────────────────────────────────────────────────
  protected mostrarDescuento = signal(!!this.data.pedido.descuento_tipo);
  protected descuentoTipo = signal<'porcentaje' | 'monto_fijo'>(
    (this.data.pedido.descuento_tipo as 'porcentaje' | 'monto_fijo') ?? 'porcentaje',
  );
  protected descuentoValor = signal<string>(this.data.pedido.descuento_valor ?? '');
  protected descuentoMotivo = signal<string>(this.data.pedido.descuento_motivo ?? '');

  // ── Visto toggle (computed from local state) ──────────────────────────
  protected toggleChecked = computed(() => {
    const c = this.cambios();
    // true = visto; false = no visto
    if (c.visto !== null) return c.visto;
    return this.pedido().visto;
  });

  // ── Edit pedido (fecha / cliente) ────────────────────────────────────
  protected editPedidoForm = new FormGroup({
    fechaDate: new FormControl(this.buildLocalDT(new Date(this.data.pedido.fecha)).fechaDate),
    fechaTime: new FormControl(this.buildLocalDT(new Date(this.data.pedido.fecha)).fechaTime),
  });
  protected editClienteCtrl = new FormControl<ClienteResumen | string | null>('');
  protected editClienteId = signal<number | null>(this.data.pedido.cliente_id);
  protected clientes = signal<ClienteResumen[]>([]);
  protected cargandoClientes = signal(false);

  // ── Select de cliente (mat-select con búsqueda interna) ──────────────
  protected clienteSelectSearch = new FormControl<string>('');
  private clienteSelectSearchVal = toSignal(
    this.clienteSelectSearch.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected clientesFiltradosSelect = computed(() => {
    const q = (this.clienteSelectSearchVal() ?? '').toLowerCase().trim();
    return q
      ? this.clientes().filter(
          (c) => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q),
        )
      : this.clientes();
  });
  protected clienteSeleccionado = computed(() => {
    const id = this.editClienteId();
    return this.clientes().find((c) => c.id === id) ?? null;
  });


  // ── Catalog ──────────────────────────────────────────────────────────
  protected productos = signal<Producto[]>([]);
  protected unidades = signal<Unidad[]>([]);
  protected cargandoCatalogo = signal(false);

  // ── Effective items (computed from local changes + temporal ref prices) ─
  protected itemsEfectivos = computed(() => {
    const pedido = this.pedido();
    const c = this.cambios();
    const prods = this.productos();
    const eliminados = new Set(c.itemsEliminados);

    const refPrices = (prodId: number | null, unidadId: number | null) => {
      if (!prodId || !unidadId) return { ref_lista: null as string | null, ref_especial: null as string | null, ref_base: null as string | null };
      const prod = prods.find((p) => p.id === prodId);
      if (!prod) return { ref_lista: null, ref_especial: null, ref_base: null };
      const lista = prod.precios_default.find((pd) => pd.unidad_id === unidadId)?.precio ?? null;
      const especial = prod.precios_cliente?.find((pc) => pc.unidad_id === unidadId)?.precio ?? null;
      const ref_lista = lista != null ? String(lista) : null;
      const ref_especial = especial != null ? String(especial) : null;
      // Base = el menor entre lista y especial (lo que debería cobrar como mínimo sin descuento manual)
      const ref_base = ref_lista && ref_especial
        ? String(Math.min(Number(ref_lista), Number(ref_especial)))
        : (ref_especial ?? ref_lista);
      return { ref_lista, ref_especial, ref_base };
    };

    const items = pedido.items.map((item) => {
      if (eliminados.has(item.id)) {
        return { ...item, _badge: 'ELIMINADO' as const, ref_lista: null as string | null, ref_especial: null as string | null };
      }
      const edit = c.itemsEditados.find((e) => e.itemId === item.id);
      const prodId = edit?.datos.producto_id ?? item.producto_id;
      const unidadId = edit?.datos.unidad_id ?? item.unidad_id;
      const ref = refPrices(prodId ?? null, unidadId ?? null);
      if (edit) {
        return {
          ...item,
          cantidad: edit.datos.cantidad != null ? String(edit.datos.cantidad) : item.cantidad,
          unidad: edit.datos.unidad ?? item.unidad,
          unidad_id: unidadId ?? item.unidad_id,
          precio_unitario: edit.datos.precio_unitario != null
            ? String(edit.datos.precio_unitario) : item.precio_unitario,
          producto_id: prodId ?? item.producto_id,
          producto_raw: edit.datos.producto_raw ?? item.producto_raw,
          _badge: 'MODIFICADO' as const,
          ...ref,
        };
      }
      return { ...item, _badge: null as null, ...ref };
    });

    const newItems = c.itemsAgregados.map((item, idx) => {
      const ref = refPrices(item.producto_id ?? null, item.unidad_id ?? null);
      return {
        id: -(idx + 1),
        pedido_id: pedido.id,
        producto: null as { id: number; nombre: string; categoria: { nombre: string } | null } | null,
        producto_id: item.producto_id ?? null,
        producto_raw: item.producto_raw,
        cantidad: String(item.cantidad),
        unidad: item.unidad,
        unidad_id: item.unidad_id ?? null,
        unidad_rel: null as Unidad | null,
        precio_unitario: item.precio_unitario != null ? String(item.precio_unitario) : null,
        descuento_item: null as number | null,
        _badge: 'NUEVO' as const,
        ...ref,
      };
    });

    return [...items, ...newItems];
  });

  protected subtotalEfectivo = computed(() => {
    const items = this.itemsEfectivos();
    return items.reduce((sum, item) => {
      if (item._badge === 'ELIMINADO') return sum;
      const precio = parseFloat(item.precio_unitario ?? '0') || 0;
      const cant = parseFloat(String(item.cantidad)) || 0;
      return sum + precio * cant;
    }, 0);
  });

  protected descuentoEfectivoMonto = computed(() => {
    const subtotal = this.subtotalEfectivo();
    const desc = this.cambios().descuento;
    if (!desc || isNaN(desc.valor) || desc.valor <= 0) return 0;
    if (desc.tipo === 'porcentaje') return subtotal * (desc.valor / 100);
    return Math.min(desc.valor, subtotal);
  });

  protected totalEfectivo = computed(() =>
    Math.max(0, this.subtotalEfectivo() - this.descuentoEfectivoMonto()),
  );

  // Descuento a mostrar en totales: usa el pendiente si existe, el del pedido si no, 0 si se va a quitar
  protected descuentoMostrado = computed(() => {
    const c = this.cambios();
    if (c.quitarDescuento) return 0;
    if (c.descuento !== null) return this.descuentoEfectivoMonto();
    return this.pedido().descuento_global ?? 0;
  });

  protected totalMostrado = computed(() =>
    Math.max(0, this.subtotalEfectivo() - this.descuentoMostrado()),
  );

  // ── Item form (new / edit — forma única) ────────────────────────────
  protected itemFormMode = signal<'new' | 'edit' | null>(null);
  protected itemFormEditingId = signal<number | null>(null);
  protected itemFormProductoId = signal<number | null>(null);
  protected itemFormFueraCatalogo = signal(false);
  protected itemFormProductoRaw = signal('');
  protected mostrarAgregarCatalogo = signal(false);
  protected agregarCatalogoNombre = signal('');
  protected agregarCatalogoCategoria = signal<number | null>(null);
  protected agregarCatalogoPrecio = signal('');
  protected guardandoAgregarCatalogo = signal(false);
  protected categorias = signal<Categoria[]>([]);
  private _categoriasLoaded = false;
  private _catalogProductoJustCreated: number | null = null;
  private _itemFormProductoSel: Producto | null = null;
  protected itemForm = new FormGroup({
    unidad_id: new FormControl<number | null>(null),
    cantidad: new FormControl(''),
    precio: new FormControl(''),
  });
  protected itemFormDescuentoPct = signal('');
  private itemFormPrecioVal = toSignal(
    this.itemForm.get('precio')!.valueChanges.pipe(startWith(null)),
    { initialValue: null as string | null },
  );
  private itemFormCantidadVal = toSignal(
    this.itemForm.get('cantidad')!.valueChanges.pipe(startWith(null)),
    { initialValue: null as string | null },
  );
  // Subtotal en vivo (cantidad × precio unit.) para verificar consistencia sin calcular a mano
  protected itemFormSubtotal = computed(() => {
    const cant = parseFloat(String(this.itemFormCantidadVal() ?? ''));
    const precio = parseFloat(String(this.itemFormPrecioVal() ?? ''));
    if (isNaN(cant) || isNaN(precio) || cant <= 0 || precio < 0) return null;
    return { cant, precio, total: cant * precio };
  });
  private itemFormUnidadVal = toSignal(
    this.itemForm.get('unidad_id')!.valueChanges.pipe(startWith(null)),
    { initialValue: null as number | null },
  );
  protected itemFormPreciosRef = computed(() => {
    const prodId = this.itemFormProductoId();
    const unidadId = this.itemFormUnidadVal();
    const prod = prodId ? this.productos().find((p) => p.id === prodId) : null;
    const catalogo = unidadId && prod
      ? (prod.precios_default.find((pd) => pd.unidad_id === unidadId)?.precio ?? null)
      : null;
    const cliente = unidadId && prod
      ? (prod.precios_cliente?.find((pc) => pc.unidad_id === unidadId)?.precio ?? null)
      : null;
    return { catalogo, cliente };
  });
  protected itemFormPrecioResultante = computed(() => {
    const pct = parseFloat(this.itemFormDescuentoPct());
    if (isNaN(pct) || pct <= 0 || pct >= 100) return null;
    const ref = this.itemFormPreciosRef();
    const baseStr = ref.cliente ?? ref.catalogo;
    const base = baseStr
      ? parseFloat(String(baseStr))
      : parseFloat(this.itemFormPrecioVal() ?? '');
    if (isNaN(base)) return null;
    return base * (1 - pct / 100);
  });

  // ── Delete item ──────────────────────────────────────────────────────
  protected itemEliminandoId = signal<number | null>(null);

  // ── Confirmar cambio de cliente ──────────────────────────────────────
  protected clientePendiente = signal<ClienteResumen | null>(null);
  protected mostrarConfirmCambioCliente = signal(false);
  protected clienteSinCliente = signal(false);

  // ── Duplicar ─────────────────────────────────────────────────────────
  protected mostrarDuplicarForm = signal(false);
  protected duplicarClientes = signal<ClienteResumen[]>([]);
  protected duplicarClienteId = signal<number | null>(null);
  protected duplicando = signal(false);

  // ── Deshacer fusión ──────────────────────────────────────────────────
  protected confirmarDeshacerFusion = signal(false);
  protected deshaciendo = signal(false);


  // ── Imprimir ─────────────────────────────────────────────────────────
  protected imprimiendo = signal(false);
  protected mostrarDialogImprimir = signal(false);
  protected mostrarHistorialImpresiones = signal(false);
  protected historialImpresiones = signal<PrintLog[]>([]);
  protected cargandoHistorial = signal(false);
  protected expandedLogs = signal<Set<number>>(new Set());
  protected mostrarVistaPrevia = signal(false);
  protected vistaPreviaConPrecios = signal(false);
  protected vistaPreviaText = signal<string | null>(null);
  protected cargandoVistaPrevia = signal(false);

  // ── Aclaraciones ─────────────────────────────────────────────────────
  protected aclaraciones = signal(this.data.pedido.aclaraciones ?? '');
  protected guardandoAclaraciones = signal(false);

  // ── Eliminar pedido ──────────────────────────────────────────────────
  protected confirmarEliminar = signal(false);
  protected eliminando = signal(false);

  // ── WhatsApp / Chatwoot ──────────────────────────────────────────────
  protected confirmandoWA = signal(false);
  protected waResultado = signal<string | null>(null);
  protected waError = signal(false);
  protected chatwootConvUrl = signal<string | null>(null);
  protected chatwootContactUrl = signal<string | null>(null);
  protected chatwootCargando = signal(false);
  protected chatwootMensaje = signal<string | null>(null);

  constructor() {
    this.dialogRef.backdropClick().subscribe(() => this.intentarCerrar());
    if (this.data.pedido.cliente) {
      this.editClienteCtrl.setValue(this.data.pedido.cliente.nombre, { emitEvent: false });
    }
    this.abrirEditPedido();
    this.cargarCatalogo(this.data.pedido.cliente_id, this.data.pedido.fecha);
    if (this.data.pedido.cliente?.telefono) {
      this.cargarChatwootUrl();
    }
  }

  private buildLocalDT(d: Date): { fechaDate: string; fechaTime: string } {
    const fechaDate = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
    const fechaTime = [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
    ].join(':');
    return { fechaDate, fechaTime };
  }

  private recargar(): void {
    this.reloading.set(true);
    this.api.getPedido(this.pedido().id).subscribe({
      next: (p) => {
        this.pedido.set(p);
        this.estadoNuevo.set(p.estado);
        this.reloading.set(false);
        this.hasChanged.set(true);
      },
      error: () => this.reloading.set(false),
    });
  }

  // ── Visto (local) ────────────────────────────────────────────────────

  protected toggleVisto(checkedVisto: boolean): void {
    const currentVisto = this.pedido().visto;
    this.cambios.update((c) => ({ ...c, visto: checkedVisto === currentVisto ? null : checkedVisto }));
  }

  // ── Estado (local) ───────────────────────────────────────────────────

  protected onEstadoChange(estado: EstadoPedido): void {
    this.estadoNuevo.set(estado);
    this.cambios.update((c) => ({
      ...c,
      estado: estado === this.pedido().estado ? null : estado,
    }));
  }

  // ── Descuento (local) ────────────────────────────────────────────────

  protected onDescuentoChange(): void {
    const valor = parseFloat(this.descuentoValor());
    if (this.mostrarDescuento() && !isNaN(valor) && valor > 0) {
      this.cambios.update((c) => ({
        ...c,
        descuento: { tipo: this.descuentoTipo(), valor, motivo: this.descuentoMotivo() },
        quitarDescuento: false,
      }));
      this.mostrarDescuento.set(false);
    } else {
      this.cambios.update((c) => ({ ...c, descuento: null }));
    }
  }

  protected aplicarDescuentoEfectivo(): void {
    this.descuentoTipo.set('porcentaje');
    this.descuentoValor.set('10');
    this.descuentoMotivo.set('Efectivo');
    this.cambios.update((c) => ({
      ...c,
      descuento: { tipo: 'porcentaje', valor: 10, motivo: 'Efectivo' },
      quitarDescuento: false,
    }));
    this.mostrarDescuento.set(false);
  }

  protected quitarDescuentoGlobal(): void {
    this.cambios.update((c) => ({ ...c, quitarDescuento: true, descuento: null }));
    this.mostrarDescuento.set(false);
    this.descuentoValor.set('');
    this.descuentoMotivo.set('');
  }

  // ── Edit pedido (local) ──────────────────────────────────────────────

  protected onClienteChange(id: number | null): void {
    if (id === null) { this.aplicarSinCliente(); return; }
    const cliente = this.clientes().find((c) => c.id === id);
    if (cliente) this.seleccionarCliente(cliente);
  }

  protected onClienteSelectOpenedChange(opened: boolean): void {
    if (!opened) this.clienteSelectSearch.setValue('');
  }

  protected abrirEditPedido(): void {
    if (this.clientes().length === 0) {
      this.cargandoClientes.set(true);
      this.api.getClientes().subscribe({
        next: (res) => {
          const lista = res.data.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }));
          this.clientes.set(lista);
          const match = lista.find((c) => c.id === this.editClienteId());
          if (match) this.editClienteCtrl.setValue(match, { emitEvent: false });
          this.cargandoClientes.set(false);
        },
        error: () => this.cargandoClientes.set(false),
      });
    }
  }

  protected seleccionarCliente(cliente: ClienteResumen): void {
    if (cliente.id === this.pedido().cliente_id) {
      this.editClienteId.set(cliente.id);
      this.editClienteCtrl.setValue(cliente, { emitEvent: false });
      this.cambios.update((c) => ({ ...c, cliente_id: undefined }));
      this.clienteSinCliente.set(false);
      this.mostrarConfirmCambioCliente.set(false);
      this.clientePendiente.set(null);
      return;
    }

    const currentClienteId = this.cambios().cliente_id !== undefined
      ? this.cambios().cliente_id
      : this.pedido().cliente_id;
    if (cliente.id === currentClienteId) {
      this.editClienteId.set(cliente.id);
      this.editClienteCtrl.setValue(cliente, { emitEvent: false });
      this.clienteSinCliente.set(false);
      return;
    }

    this.editClienteId.set(cliente.id);
    this.clienteSinCliente.set(false);
    this.clientePendiente.set(cliente);
    this.mostrarConfirmCambioCliente.set(true);
  }

  protected confirmarCambioCliente(): void {
    const cliente = this.clientePendiente();
    if (!cliente) return;

    this.editClienteId.set(cliente.id);
    this.editClienteCtrl.setValue(cliente, { emitEvent: false });
    this.cambios.update((c) => ({
      ...c,
      cliente_id: cliente.id === this.pedido().cliente_id ? undefined : cliente.id,
    }));

    this.resetItemPrices();
    const fecha = this.cambios().fecha ?? this.pedido().fecha;
    this.cargarCatalogo(cliente.id, fecha);

    this.mostrarConfirmCambioCliente.set(false);
    this.clientePendiente.set(null);
    this.clienteSinCliente.set(false);
  }

  protected confirmarCambioClienteSinReset(): void {
    const cliente = this.clientePendiente();
    if (!cliente) return;

    this.editClienteId.set(cliente.id);
    this.editClienteCtrl.setValue(cliente, { emitEvent: false });
    this.cambios.update((c) => ({
      ...c,
      cliente_id: cliente.id === this.pedido().cliente_id ? undefined : cliente.id,
    }));

    const fecha = this.cambios().fecha ?? this.pedido().fecha;
    this.cargarCatalogo(cliente.id, fecha);

    this.mostrarConfirmCambioCliente.set(false);
    this.clientePendiente.set(null);
    this.clienteSinCliente.set(false);
  }

  protected cancelarCambioCliente(): void {
    const currentClienteId = this.cambios().cliente_id !== undefined
      ? this.cambios().cliente_id
      : this.pedido().cliente_id;
    this.editClienteId.set(currentClienteId ?? null);
    const currentCliente = this.clientes().find((c) => c.id === currentClienteId);
    if (currentCliente) {
      this.editClienteCtrl.setValue(currentCliente, { emitEvent: false });
    } else {
      this.editClienteCtrl.setValue(this.pedido().cliente?.nombre ?? '', { emitEvent: false });
    }
    this.mostrarConfirmCambioCliente.set(false);
    this.clientePendiente.set(null);
  }

  private resetItemPrices(): void {
    const c = this.cambios();
    const eliminados = new Set(c.itemsEliminados);
    const prods = this.productos();
    const itemsEditados = [...c.itemsEditados];

    for (const item of this.pedido().items) {
      if (eliminados.has(item.id)) continue;

      const existingEdit = itemsEditados.find((e) => e.itemId === item.id);
      const unidadId = existingEdit?.datos.unidad_id ?? item.unidad_id;
      const prodId = existingEdit?.datos.producto_id ?? item.producto_id;

      let listPrice: number | null = null;
      if (prodId && unidadId) {
        const prod = prods.find((p) => p.id === prodId);
        if (prod) {
          const precio = prod.precios_default.find((pd) => pd.unidad_id === unidadId)?.precio ?? null;
          listPrice = precio != null ? Number(precio) : null;
        }
      }

      if (existingEdit) {
        existingEdit.datos.precio_unitario = listPrice;
      } else {
        itemsEditados.push({ itemId: item.id, datos: { precio_unitario: listPrice } });
      }
    }

    const itemsAgregados = c.itemsAgregados.map((item) => {
      let listPrice: number | undefined = undefined;
      if (item.producto_id && item.unidad_id) {
        const prod = prods.find((p) => p.id === item.producto_id);
        if (prod) {
          const precio = prod.precios_default.find((pd) => pd.unidad_id === item.unidad_id)?.precio ?? null;
          listPrice = precio != null ? Number(precio) : undefined;
        }
      }
      return { ...item, precio_unitario: listPrice };
    });

    this.cambios.update((prev) => ({ ...prev, itemsEditados, itemsAgregados }));
  }

  protected aplicarCambiosFecha(): void {
    const { fechaDate, fechaTime } = this.editPedidoForm.value;
    if (!fechaDate || !fechaTime) return;
    const fechaISO = new Date(`${fechaDate}T${fechaTime}`).toISOString();
    const fechaOriginal = new Date(this.pedido().fecha).toISOString();
    this.cambios.update((c) => ({ ...c, fecha: fechaISO === fechaOriginal ? null : fechaISO }));
    // Recargar catálogo con los precios vigentes a la nueva fecha
    const clienteId = this.editClienteId();
    this.cargarCatalogo(clienteId, fechaISO);
  }

  // ── Reset draft ──────────────────────────────────────────────────────

  protected resetDraft(): void {
    const p = this.pedido();
    const productosABorrar = this.cambios().productosCreados;

    // 1. Limpiar el acumulador de cambios
    this.cambios.set({
      estado: null,
      fecha: null,
      cliente_id: undefined,
      descuento: null,
      quitarDescuento: false,
      visto: null,
      itemsAgregados: [],
      itemsEditados: [],
      itemsEliminados: [],
      productosCreados: [],
    });

    // 2. Sincronizar todos los signals de inputs al estado original del pedido
    this.estadoNuevo.set(p.estado);
    this.mostrarDescuento.set(!!p.descuento_tipo);
    this.descuentoTipo.set((p.descuento_tipo as 'porcentaje' | 'monto_fijo') ?? 'porcentaje');
    this.descuentoValor.set(p.descuento_valor ?? '');
    this.descuentoMotivo.set(p.descuento_motivo ?? '');
    this.editClienteId.set(p.cliente_id);
    const clienteObj = this.clientes().find((c) => c.id === p.cliente_id);
    this.editClienteCtrl.setValue(clienteObj ?? p.cliente?.nombre ?? '', { emitEvent: false });
    this.clienteSinCliente.set(false);
    this.mostrarConfirmCambioCliente.set(false);
    this.clientePendiente.set(null);
    this.editPedidoForm.setValue(
      this.buildLocalDT(new Date(p.fecha)),
      { emitEvent: false },
    );

    // 3. Cerrar cualquier sub-formulario abierto
    this.limpiarItemForm();
    this.itemEliminandoId.set(null);
    this.mostrarConfirmCierre.set(false);

    // 4. Borrar productos creados durante el draft que se descarta
    for (const id of productosABorrar) {
      this.productos.update((list) => list.filter((p) => p.id !== id));
      this.api.deleteProducto(id).subscribe();
    }
  }

  // ── Guardar todo ─────────────────────────────────────────────────────

  protected guardarTodo(): void {
    if (!this.hayCambios()) {
      this.dialogRef.close(this.hasChanged());
      return;
    }

    this.guardandoTodo.set(true);
    const c = this.cambios();
    const id = this.pedido().id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tareas: any[] = [];

    if (c.estado !== null) tareas.push(this.api.patchEstado(id, c.estado));
    if (c.fecha !== null || c.cliente_id !== undefined) {
      const body: { fecha?: string; cliente_id?: number | null } = {};
      if (c.fecha !== null) body.fecha = c.fecha;
      if (c.cliente_id !== undefined) body.cliente_id = c.cliente_id;
      tareas.push(this.api.patchPedido(id, body));
    }
    if (c.visto !== null) {
      tareas.push(c.visto ? this.api.marcarVisto(id) : this.api.marcarNoVisto(id));
    }
    if (c.quitarDescuento) tareas.push(this.api.eliminarDescuento(id));
    else if (c.descuento !== null) tareas.push(this.api.aplicarDescuento(id, c.descuento));
    for (const item of c.itemsAgregados) {
      tareas.push(this.api.crearItemPedido(id, {
        producto_raw: item.producto_raw,
        cantidad: item.cantidad,
        unidad: item.unidad,
        producto_id: item.producto_id,
        unidad_id: item.unidad_id,
        precio_unitario: item.precio_unitario,
      }));
    }
    for (const edit of c.itemsEditados) {
      tareas.push(this.api.actualizarItemPedido(id, edit.itemId, {
        cantidad: edit.datos.cantidad,
        unidad: edit.datos.unidad,
        unidad_id: edit.datos.unidad_id ?? undefined,
        precio_unitario: edit.datos.precio_unitario !== undefined ? edit.datos.precio_unitario : undefined,
        producto_id: edit.datos.producto_id,
        producto_raw: edit.datos.producto_raw,
      }));
    }
    for (const itemId of c.itemsEliminados) {
      tareas.push(this.api.eliminarItemPedido(id, itemId));
    }

    forkJoin(tareas).subscribe({
      next: () => {
        this.api.getPedido(id).subscribe({
          next: (p) => {
            this.pedido.set(p);
            this.resetDraft();
            this.hasChanged.set(true);
            this.guardandoTodo.set(false);
            this.snack.open('Cambios guardados', '', { duration: 2000 });
            this.recargarVistaPrevia();
            const accion = this.accionPendiente();
            this.accionPendiente.set(null);
            accion?.();
          },
          error: () => {
            this.guardandoTodo.set(false);
            this.snack.open('Error al recargar el pedido', 'Cerrar', { duration: 4000 });
          },
        });
      },
      error: () => {
        this.guardandoTodo.set(false);
        this.snack.open('Error al guardar los cambios', 'Cerrar', { duration: 4000 });
      },
    });
  }

  // ── Item form — métodos unificados (new / edit) ──────────────────────

  protected abrirFormNuevo(): void {
    this.asegurarCatalogo();
    this.limpiarItemForm();
    this.itemFormMode.set('new');
  }

  protected abrirFormEditar(item: {
    id: number; producto_id: number | null; unidad_id: number | null;
    cantidad: string | number; precio_unitario: string | null;
    producto_raw?: string | null;
  }): void {
    this.asegurarCatalogo();
    const prod = this.productos().find((p) => p.id === item.producto_id) ?? null;
    const esFueraCatalogo = item.producto_id === null;
    this._itemFormProductoSel = prod;
    this.itemFormProductoId.set(item.producto_id ?? null);
    this.itemFormFueraCatalogo.set(esFueraCatalogo);
    this.itemFormProductoRaw.set(esFueraCatalogo ? (item.producto_raw ?? '') : '');
    this.itemFormEditingId.set(item.id);
    this.itemFormMode.set('edit');
    this.itemFormDescuentoPct.set('');
    // Emitir para que itemFormUnidadVal signal se actualice
    this.itemForm.get('unidad_id')!.setValue(item.unidad_id ?? null, { emitEvent: true });
    this.itemForm.patchValue({
      cantidad: String(parseFloat(String(item.cantidad))),
      precio: item.precio_unitario ?? '',
    }, { emitEvent: true });
  }

  protected toggleItemFormFueraCatalogo(): void {
    const going = !this.itemFormFueraCatalogo();
    this.itemFormFueraCatalogo.set(going);
    if (going) {
      this.itemFormProductoRaw.set(this._itemFormProductoSel?.nombre ?? '');
      this._itemFormProductoSel = null;
      this.itemFormProductoId.set(null);
    } else {
      this.itemFormProductoRaw.set('');
    }
    this.mostrarAgregarCatalogo.set(false);
  }

  protected abrirAgregarCatalogo(): void {
    this.agregarCatalogoNombre.set(this.itemFormProductoRaw());
    this.agregarCatalogoCategoria.set(null);
    this.agregarCatalogoPrecio.set(this.itemForm.get('precio')!.value ?? '');
    this.mostrarAgregarCatalogo.set(true);
    if (!this._categoriasLoaded) {
      this.api.getCategorias().subscribe((cats) => {
        this.categorias.set(cats);
        this._categoriasLoaded = true;
      });
    }
  }

  protected cerrarAgregarCatalogo(): void {
    this.mostrarAgregarCatalogo.set(false);
  }

  protected confirmarAgregarCatalogo(): void {
    const nombre = this.agregarCatalogoNombre().trim();
    if (!nombre) {
      this.snack.open('El nombre del producto es obligatorio', '', { duration: 3000 });
      return;
    }
    const nombreLower = nombre.toLowerCase();
    const existente = this.productos().find((p) => p.nombre.toLowerCase() === nombreLower);
    if (existente) {
      this.snack.open(`Ya existe "${existente.nombre}" en el catálogo`, '', { duration: 4000 });
      return;
    }
    const unidadId = this.itemForm.get('unidad_id')!.value;
    const unidadNombre = this.unidades().find((u) => u.id === unidadId)?.nombre ?? '';
    const precioStr = this.agregarCatalogoPrecio();
    const precio = parseFloat(precioStr);
    this.guardandoAgregarCatalogo.set(true);
    this.api.createProducto({
      nombre,
      unidad_default: unidadNombre,
      categoria_id: this.agregarCatalogoCategoria(),
      precios: unidadId && !isNaN(precio) && precio > 0
        ? [{ unidad_id: unidadId, precio }]
        : undefined,
    }).subscribe({
      next: (nuevoProd) => {
        this.guardandoAgregarCatalogo.set(false);
        this._catalogProductoJustCreated = nuevoProd.id;
        this.productos.update((list) => [...list, { ...nuevoProd, precios_cliente: [] }]);
        this.itemFormFueraCatalogo.set(false);
        this.itemFormProductoRaw.set('');
        this.mostrarAgregarCatalogo.set(false);
        this.onItemFormProductoSelect(nuevoProd.id);
        this.snack.open(`"${nombre}" agregado al catálogo`, '', { duration: 3000 });
      },
      error: () => {
        this.guardandoAgregarCatalogo.set(false);
        this.snack.open('Error al crear el producto', '', { duration: 3000 });
      },
    });
  }

  protected cerrarItemForm(): void {
    this.limpiarItemForm();
  }

  protected onItemFormProductoSelect(id: number): void {
    const prod = this.productos().find((p) => p.id === id);
    if (!prod) return;
    this._itemFormProductoSel = prod;
    this.itemFormProductoId.set(id);
    const unidadDefault = this.unidades().find((u) => u.nombre === prod.unidad_default);
    const unidadId = unidadDefault?.id ?? null;
    this.itemForm.get('unidad_id')!.setValue(unidadId, { emitEvent: true });
    this.itemForm.patchValue({ precio: this.mejorPrecio(prod, unidadId) }, { emitEvent: false });
  }

  protected onItemFormUnidadChange(unidadId: number): void {
    if (this._itemFormProductoSel) {
      const mejor = this.mejorPrecio(this._itemFormProductoSel, unidadId);
      this.itemForm.patchValue({ precio: mejor }, { emitEvent: false });
    }
  }

  protected usarItemFormPrecioRef(precio: string): void {
    this.itemForm.patchValue({ precio }, { emitEvent: false });
    this.itemFormDescuentoPct.set('');
  }

  protected aplicarDescuentoPctItemForm(): void {
    const resultado = this.itemFormPrecioResultante();
    if (resultado !== null) {
      this.itemForm.patchValue({ precio: String(Math.round(resultado)) }, { emitEvent: false });
      this.itemFormDescuentoPct.set('');
    }
  }

  protected confirmarItemForm(): void {
    const vals = this.itemForm.value;
    const unidadId = vals.unidad_id ?? null;
    const unidadNombre = this.unidades().find((u) => u.id === unidadId)?.nombre ?? '';
    const cantidad = parseFloat(vals.cantidad ?? '');
    const precio = parseFloat(vals.precio ?? '');
    const mode = this.itemFormMode();
    const editingId = this.itemFormEditingId();
    const esFueraCatalogo = this.itemFormFueraCatalogo();
    const rawNombre = this.itemFormProductoRaw().trim();

    if (esFueraCatalogo) {
      if (!rawNombre || isNaN(cantidad) || cantidad <= 0 || !unidadNombre) {
        this.snack.open('Completá producto, cantidad y unidad', '', { duration: 3000 });
        return;
      }
    } else {
      if (!this._itemFormProductoSel || isNaN(cantidad) || cantidad <= 0 || !unidadNombre) {
        this.snack.open('Completá producto, cantidad y unidad', '', { duration: 3000 });
        return;
      }
    }

    const nombreProducto = esFueraCatalogo ? rawNombre : this._itemFormProductoSel!.nombre;
    const productoId = esFueraCatalogo ? undefined : this._itemFormProductoSel!.id;

    if (mode === 'new') {
      this.cambios.update((c) => ({
        ...c,
        itemsAgregados: [...c.itemsAgregados, {
          producto_raw: nombreProducto,
          cantidad,
          unidad: unidadNombre,
          producto_id: productoId,
          unidad_id: unidadId ?? undefined,
          precio_unitario: isNaN(precio) ? undefined : precio,
        }],
      }));
    } else if (mode === 'edit' && editingId !== null) {
      if (editingId < 0) {
        // Editar un ítem NUEVO aún no guardado (en itemsAgregados)
        const newIdx = -editingId - 1;
        this.cambios.update((c) => {
          const arr = [...c.itemsAgregados];
          arr[newIdx] = {
            producto_raw: nombreProducto,
            cantidad,
            unidad: unidadNombre,
            producto_id: productoId,
            unidad_id: unidadId ?? undefined,
            precio_unitario: isNaN(precio) ? undefined : precio,
          };
          return { ...c, itemsAgregados: arr };
        });
      } else {
        // Editar un ítem persistido
        this.cambios.update((c) => {
          const editados = c.itemsEditados.filter((e) => e.itemId !== editingId);
          editados.push({
            itemId: editingId,
            datos: {
              cantidad: isNaN(cantidad) ? undefined : cantidad,
              unidad: unidadNombre,
              unidad_id: unidadId,
              precio_unitario: isNaN(precio) ? null : precio,
              producto_id: productoId,
              producto_raw: nombreProducto,
            },
          });
          return { ...c, itemsEditados: editados };
        });
      }
    }

    const productoCreado = this._catalogProductoJustCreated;
    this._catalogProductoJustCreated = null;
    if (productoCreado !== null) {
      this.cambios.update((c) => ({
        ...c,
        productosCreados: [...c.productosCreados, productoCreado],
      }));
    }
    this.limpiarItemForm();
  }

  private limpiarItemForm(): void {
    if (this._catalogProductoJustCreated !== null) {
      const idABorrar = this._catalogProductoJustCreated;
      this._catalogProductoJustCreated = null;
      this.productos.update((list) => list.filter((p) => p.id !== idABorrar));
      this.api.deleteProducto(idABorrar).subscribe();
    }
    this.itemFormMode.set(null);
    this.itemFormEditingId.set(null);
    this.itemFormProductoId.set(null);
    this.itemFormFueraCatalogo.set(false);
    this.itemFormProductoRaw.set('');
    this.mostrarAgregarCatalogo.set(false);
    this._itemFormProductoSel = null;
    this.itemFormDescuentoPct.set('');
    this.itemForm.reset({ unidad_id: null, cantidad: '', precio: '' });
  }

  // ── Delete item (local) ──────────────────────────────────────────────

  protected pedirConfirmarEliminarItem(id: number): void {
    this.itemEliminandoId.set(id);
  }

  protected cancelarEliminarItem(): void {
    this.itemEliminandoId.set(null);
  }

  protected confirmarEliminarItemLocal(itemId: number, isNew: boolean, newIdx: number): void {
    if (isNew) {
      this.cambios.update((c) => {
        const arr = [...c.itemsAgregados];
        arr.splice(newIdx, 1);
        return { ...c, itemsAgregados: arr };
      });
    } else {
      this.cambios.update((c) => ({
        ...c,
        itemsEliminados: [...c.itemsEliminados, itemId],
        itemsEditados: c.itemsEditados.filter((e) => e.itemId !== itemId),
      }));
    }
    this.itemEliminandoId.set(null);
  }

  protected deshacerEliminarItem(itemId: number): void {
    this.cambios.update((c) => ({
      ...c,
      itemsEliminados: c.itemsEliminados.filter((id) => id !== itemId),
    }));
  }

  protected onClienteBlur(): void {
    const val = this.editClienteCtrl.value;
    if (val !== null && typeof val === 'object') return;
    const text = (typeof val === 'string' ? val : '').trim();
    if (!text) { this.aplicarSinCliente(); return; }
    const match = this.clientes().find((c) => c.nombre.toLowerCase() === text.toLowerCase());
    if (match) this.seleccionarCliente(match); else this.aplicarSinCliente();
  }

  private aplicarSinCliente(): void {
    this.mostrarConfirmCambioCliente.set(false);
    this.clientePendiente.set(null);

    this.editClienteCtrl.setValue(null, { emitEvent: false });
    this.editClienteId.set(null);
    // Comparar contra el cliente original del pedido (no el estado acumulado),
    // así el cartel persiste aunque blur dispare varias veces con campo vacío.
    const esUnCambio = this.pedido().cliente_id !== null;
    this.cambios.update((c) => ({ ...c, cliente_id: esUnCambio ? null : undefined }));
    this.clienteSinCliente.set(esUnCambio);
  }

  private cargarCatalogo(clienteId: number | null, fecha?: string): void {
    this.cargandoCatalogo.set(true);
    forkJoin({
      productos: this.api.getProductos(clienteId, fecha),
      unidades: this.api.getUnidades(),
    }).subscribe({
      next: ({ productos, unidades }) => {
        this.productos.set(productos);
        this.unidades.set(unidades);
        this.cargandoCatalogo.set(false);
      },
      error: () => this.cargandoCatalogo.set(false),
    });
  }

  /** Mejor precio disponible para un producto/unidad: especial del cliente si existe, sino catálogo. */
  private mejorPrecio(prod: Producto, unidadId: number | null): string {
    if (!unidadId) return '';
    const clientePrice = prod.precios_cliente?.find((pc) => pc.unidad_id === unidadId)?.precio ?? null;
    const catalogPrice = prod.precios_default.find((pd) => pd.unidad_id === unidadId)?.precio ?? null;
    if (clientePrice != null && catalogPrice != null) {
      return String(Math.min(Number(clientePrice), Number(catalogPrice)));
    }
    return clientePrice ?? catalogPrice ?? '';
  }

  private asegurarCatalogo(): void {
    if (this.productos().length === 0 && !this.cargandoCatalogo()) {
      const fecha = this.cambios().fecha ?? this.pedido().fecha;
      this.cargarCatalogo(this.pedido().cliente_id, fecha);
    }
  }

  // ── Imprimir ─────────────────────────────────────────────────────────

  protected cerrarTodasConfirmaciones(): void {
    this.mostrarDialogImprimir.set(false);
    this.confirmarDeshacerFusion.set(false);
    this.confirmarEliminar.set(false);
    this.mostrarAdvertenciaCambios.set(false);
    this.accionPendiente.set(null);
  }

  protected abrirDialogImprimir(): void {
    if (this.requerirGuardado(() => this.abrirDialogImprimir())) return;
    const eraActivo = this.mostrarDialogImprimir();
    this.cerrarTodasConfirmaciones();
    if (!eraActivo) this.mostrarDialogImprimir.set(true);
  }

  protected abrirConfirmarEliminar(): void {
    const eraActivo = this.confirmarEliminar();
    this.cerrarTodasConfirmaciones();
    if (!eraActivo) this.confirmarEliminar.set(true);
  }

  protected abrirConfirmarDeshacerFusion(): void {
    const eraActivo = this.confirmarDeshacerFusion();
    this.cerrarTodasConfirmaciones();
    if (!eraActivo) this.confirmarDeshacerFusion.set(true);
  }

  protected imprimir(conPrecios: boolean): void {
    this.mostrarDialogImprimir.set(false);
    this.imprimiendo.set(true);
    this.api.imprimirPedido(this.pedido().id, {
      con_precios: conPrecios,
      cut: true,
      printer_name: 'Hasar_USB',
      text_size: 'double_width',
    }).subscribe({
      next: (res) => {
        this.imprimiendo.set(false);
        if (res.ok) {
          this.snack.open('Impreso correctamente', '', { duration: 3000 });
        } else {
          this.snack.open('Error al imprimir', 'Cerrar', { duration: 6000 });
        }
        this.pedido.set(res.pedido);
        this.hasChanged.set(true);
        if (this.mostrarHistorialImpresiones()) {
          this.api.getImpresiones(this.pedido().id).subscribe({
            next: (logs) => this.historialImpresiones.set(logs),
          });
        }
      },
      error: () => {
        this.imprimiendo.set(false);
        this.snack.open('Sin conexión con el servidor', 'Cerrar', { duration: 6000 });
      },
    });
  }

  protected guardarAclaraciones(): void {
    const valor = this.aclaraciones();
    this.guardandoAclaraciones.set(true);
    this.api.patchAclaraciones(this.pedido().id, valor.trim() || null).subscribe({
      next: (p) => {
        this.pedido.set(p);
        this.aclaraciones.set(p.aclaraciones ?? '');
        this.hasChanged.set(true);
        this.guardandoAclaraciones.set(false);
        this.snack.open('Aclaraciones guardadas', '', { duration: 2000 });
        this.recargarVistaPrevia();
      },
      error: () => this.guardandoAclaraciones.set(false),
    });
  }

  protected resolverErrorImpresion(logId: number): void {
    this.api.resolverErrorImpresion(this.pedido().id).subscribe({
      next: () => {
        this.historialImpresiones.update((logs) =>
          logs.map((l) => l.id === logId ? { ...l, resuelto_en: new Date().toISOString() } : l),
        );
        this.hasChanged.set(true);
      },
    });
  }

  protected toggleLogDetalle(id: number): void {
    this.expandedLogs.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  private accionPendiente = signal<(() => void) | null>(null);
  protected mostrarAdvertenciaCambios = signal(false);

  private requerirGuardado(accion: () => void): boolean {
    if (!this.hayCambios()) return false;
    this.cerrarTodasConfirmaciones();
    this.accionPendiente.set(accion);
    this.mostrarAdvertenciaCambios.set(true);
    return true;
  }

  private recargarVistaPrevia(): void {
    if (!this.mostrarVistaPrevia()) { this.vistaPreviaText.set(null); return; }
    this.cargandoVistaPrevia.set(true);
    this.api.getTicketPreview(this.pedido().id, this.vistaPreviaConPrecios()).subscribe({
      next: ({ text }) => { this.vistaPreviaText.set(text); this.cargandoVistaPrevia.set(false); },
      error: () => this.cargandoVistaPrevia.set(false),
    });
  }

  protected toggleVistaPreviaConPrecios(): void {
    this.vistaPreviaConPrecios.update(v => !v);
    this.recargarVistaPrevia();
  }

  private scrollToSection(selector: string, block: ScrollLogicalPosition = 'nearest'): void {
    setTimeout(() => {
      const el = (this.elRef.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
      el?.scrollIntoView({ behavior: 'smooth', block });
    });
  }

  protected toggleHistorialImpresiones(): void {
    const opening = !this.mostrarHistorialImpresiones();
    this.mostrarHistorialImpresiones.set(opening);
    if (opening) {
      this.mostrarVistaPrevia.set(false);
      this.scrollToSection('.historial-toggle', 'start');
      if (this.historialImpresiones().length === 0) {
        this.cargandoHistorial.set(true);
        this.api.getImpresiones(this.pedido().id).subscribe({
          next: (logs) => { this.historialImpresiones.set(logs); this.cargandoHistorial.set(false); },
          error: () => this.cargandoHistorial.set(false),
        });
      }
    } else {
      this.scrollToSection('.historial-toggle');
    }
  }

  protected toggleVistaPrevia(): void {
    const opening = !this.mostrarVistaPrevia();
    if (opening && this.requerirGuardado(() => this.toggleVistaPrevia())) return;
    this.mostrarVistaPrevia.set(opening);
    if (opening) {
      this.mostrarHistorialImpresiones.set(false);
      this.scrollToSection('.historial-toggle', 'start');
      if (this.vistaPreviaText() === null) {
        this.recargarVistaPrevia();
      }
    } else {
      this.scrollToSection('.historial-toggle');
    }
  }

  // ── Duplicar ─────────────────────────────────────────────────────────

  protected abrirDuplicarForm(): void {
    if (this.requerirGuardado(() => this.abrirDuplicarForm())) return;
    this.mostrarDuplicarForm.set(true);
    this.duplicarClienteId.set(this.pedido().cliente_id);
    if (this.duplicarClientes().length === 0) {
      this.api.getClientes().subscribe({
        next: (res) => {
          this.duplicarClientes.set(res.data.map((c) => ({
            id: c.id, nombre: c.nombre, telefono: c.telefono,
          })));
        },
      });
    }
  }

  protected confirmarDuplicar(): void {
    this.duplicando.set(true);
    this.api.duplicarPedido(this.pedido().id, this.duplicarClienteId() ?? undefined).subscribe({
      next: () => {
        this.duplicando.set(false);
        this.mostrarDuplicarForm.set(false);
        this.hasChanged.set(true);
        this.snack.open('Pedido duplicado', '', { duration: 3000 });
      },
      error: () => this.duplicando.set(false),
    });
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────

  private cargarChatwootUrl(): void {
    this.chatwootCargando.set(true);
    this.chatwootMensaje.set(null);
    this.api.getChatwootUrl(this.pedido().id).subscribe({
      next: (res) => {
        this.chatwootConvUrl.set(res.conv_url);
        this.chatwootContactUrl.set(res.contact_url);
        if (!res.conv_url) {
          this.chatwootMensaje.set('No se encontró ninguna conversación en Chatwoot para este contacto');
        }
        this.chatwootCargando.set(false);
      },
      error: () => {
        this.chatwootMensaje.set('No se pudo verificar la conversación en Chatwoot');
        this.chatwootCargando.set(false);
      },
    });
  }

  protected abrirChatwoot(): void {
    const url = this.chatwootConvUrl() ?? this.chatwootContactUrl();
    if (url) window.open(url, '_blank', 'noopener');
  }

  protected confirmarWhatsApp(): void {
    if (this.requerirGuardado(() => this.confirmarWhatsApp())) return;
    this.confirmandoWA.set(true);
    this.waResultado.set(null);
    this.waError.set(false);
    this.api.confirmarWhatsapp(this.pedido().id).subscribe({
      next: (res) => {
        this.waResultado.set(`✓ Mensaje enviado a ${res.telefono}`);
        this.waError.set(false);
        this.confirmandoWA.set(false);
        if (res.conv_id && !this.chatwootConvUrl()) {
          this.cargarChatwootUrl();
        }
      },
      error: (err) => {
        const msg = err?.error?.error ?? 'No se pudo enviar el mensaje de WhatsApp';
        this.waResultado.set(msg);
        this.waError.set(true);
        this.confirmandoWA.set(false);
      },
    });
  }

  // ── Deshacer fusión ──────────────────────────────────────────────────

  protected deshacerFusion(): void {
    this.deshaciendo.set(true);
    this.api.deshacerFusion(this.pedido().id).subscribe({
      next: () => this.dialogRef.close(true),
      error: () => this.deshaciendo.set(false),
    });
  }

  // ── Eliminar pedido ──────────────────────────────────────────────────

  protected eliminarPedido(): void {
    this.eliminando.set(true);
    this.api.deletePedido(this.pedido().id).subscribe({
      next: () => this.dialogRef.close(true),
      error: () => this.eliminando.set(false),
    });
  }

  // ── Cerrar ───────────────────────────────────────────────────────────

  /** Descarta el borrador local si hay cambios; de lo contrario cierra el diálogo. */
  protected intentarCerrar(): void {
    if (this.hayCambios()) {
      this.mostrarConfirmCierre.set(true);
    } else {
      this.dialogRef.close(this.hasChanged());
    }
  }

  protected cerrarConfirmado(): void {
    this.dialogRef.close(this.hasChanged());
  }

  protected cancelarCierre(): void {
    this.mostrarConfirmCierre.set(false);
  }
}
