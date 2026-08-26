import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of, switchMap } from 'rxjs';
import { Categoria, EstadoPedido, Producto, Unidad, ClienteResumen } from '../../models';
import { ApiService } from '../../services/api.service';

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

@Component({
  selector: 'app-crear-pedido-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    MatTooltipModule,
  ],
  templateUrl: './crear-pedido-dialog.html',
})
export class CrearPedidoDialogComponent {
  private dialogRef = inject(MatDialogRef<CrearPedidoDialogComponent>);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  protected readonly estados = ESTADOS;

  // Loading / saving
  protected cargandoClientes = signal(false);
  protected cargandoCatalogo = signal(false);
  protected guardando = signal(false);
  protected mostrarConfirmCierre = signal(false);

  // Meta fields
  protected estadoNuevo = signal<EstadoPedido>('recibido');

  protected editPedidoForm = new FormGroup({
    fechaDate: new FormControl(this.buildNow().fechaDate),
    fechaTime: new FormControl(this.buildNow().fechaTime),
  });

  // Cliente
  protected clienteId = signal<number | null>(null);
  protected clientes = signal<ClienteResumen[]>([]);
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
  protected clienteSeleccionado = computed(
    () => this.clientes().find((c) => c.id === this.clienteId()) ?? null,
  );

  // Catalog
  protected productos = signal<Producto[]>([]);
  protected unidades = signal<Unidad[]>([]);
  protected categorias = signal<Categoria[]>([]);
  private _categoriasLoaded = false;

  // Items draft
  protected itemsAgregados = signal<ItemAgregado[]>([]);

  // Item form
  protected itemFormMode = signal<'new' | 'edit' | null>(null);
  protected itemFormEditingIdx = signal<number | null>(null);
  protected itemFormProductoId = signal<number | null>(null);
  protected itemFormFueraCatalogo = signal(false);
  protected itemFormProductoRaw = signal('');
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
  private itemFormUnidadVal = toSignal(
    this.itemForm.get('unidad_id')!.valueChanges.pipe(startWith(null)),
    { initialValue: null as number | null },
  );
  protected itemFormPreciosRef = computed(() => {
    const prodId = this.itemFormProductoId();
    const unidadId = this.itemFormUnidadVal();
    const prod = prodId ? this.productos().find((p) => p.id === prodId) : null;
    const catalogo =
      unidadId && prod
        ? (prod.precios_default.find((pd) => pd.unidad_id === unidadId)?.precio ?? null)
        : null;
    const cliente =
      unidadId && prod
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

  // Agregar al catálogo (desde fuera de catálogo)
  protected mostrarAgregarCatalogo = signal(false);
  protected agregarCatalogoNombre = signal('');
  protected agregarCatalogoCategoria = signal<number | null>(null);
  protected agregarCatalogoPrecio = signal('');
  protected guardandoAgregarCatalogo = signal(false);
  private _catalogProductoJustCreated: number | null = null;
  private _productosCreados: number[] = [];

  // Item eliminar
  protected itemEliminandoIdx = signal<number | null>(null);

  // Descuento global
  protected mostrarDescuento = signal(false);
  protected descuentoTipo = signal<'porcentaje' | 'monto_fijo'>('porcentaje');
  protected descuentoValor = signal('');
  protected descuentoMotivo = signal('');
  protected descuentoPendiente = signal<{
    tipo: 'porcentaje' | 'monto_fijo';
    valor: number;
    motivo: string;
  } | null>(null);

  protected hayCambios = computed(
    () =>
      this.itemsAgregados().length > 0 ||
      this.clienteId() !== null ||
      this.descuentoPendiente() !== null,
  );

  // Totales en tiempo real
  protected subtotalEfectivo = computed(() =>
    this.itemsAgregados().reduce((sum, item) => {
      const precio = item.precio_unitario ?? 0;
      return sum + precio * item.cantidad;
    }, 0),
  );

  protected descuentoEfectivoMonto = computed(() => {
    const subtotal = this.subtotalEfectivo();
    const desc = this.descuentoPendiente();
    if (!desc || isNaN(desc.valor) || desc.valor <= 0) return 0;
    if (desc.tipo === 'porcentaje') return subtotal * (desc.valor / 100);
    return Math.min(desc.valor, subtotal);
  });

  protected totalEfectivo = computed(() =>
    Math.max(0, this.subtotalEfectivo() - this.descuentoEfectivoMonto()),
  );

  constructor() {
    this.dialogRef.backdropClick().subscribe(() => this.intentarCerrar());
    this.cargarClientes();
    this.cargarCatalogo(null);
  }

  private buildNow(): { fechaDate: string; fechaTime: string } {
    const d = new Date();
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

  private cargarClientes(): void {
    this.cargandoClientes.set(true);
    this.api.getClientes().subscribe({
      next: (res) => {
        this.clientes.set(
          res.data.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })),
        );
        this.cargandoClientes.set(false);
      },
      error: () => this.cargandoClientes.set(false),
    });
  }

  private cargarCatalogo(clienteId: number | null): void {
    this.cargandoCatalogo.set(true);
    forkJoin({
      productos: this.api.getProductos(clienteId),
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

  // ── Cliente ──────────────────────────────────────────────────────────

  protected onClienteChange(id: number | null): void {
    this.clienteId.set(id);
    this.cargarCatalogo(id);
  }

  protected onClienteSelectOpenedChange(opened: boolean): void {
    if (!opened) this.clienteSelectSearch.setValue('');
  }

  // ── Item form ────────────────────────────────────────────────────────

  protected abrirFormNuevo(): void {
    this.limpiarItemForm();
    this.itemFormMode.set('new');
  }

  protected abrirFormEditar(idx: number): void {
    const item = this.itemsAgregados()[idx];
    const esFueraCatalogo = item.producto_id == null;
    const prod = !esFueraCatalogo
      ? (this.productos().find((p) => p.id === item.producto_id) ?? null)
      : null;
    this._itemFormProductoSel = prod;
    this.itemFormProductoId.set(item.producto_id ?? null);
    this.itemFormFueraCatalogo.set(esFueraCatalogo);
    this.itemFormProductoRaw.set(esFueraCatalogo ? item.producto_raw : '');
    this.itemFormEditingIdx.set(idx);
    this.itemFormMode.set('edit');
    this.itemFormDescuentoPct.set('');
    this.itemForm.get('unidad_id')!.setValue(item.unidad_id ?? null, { emitEvent: true });
    this.itemForm.patchValue(
      {
        cantidad: String(item.cantidad),
        precio: item.precio_unitario != null ? String(item.precio_unitario) : '',
      },
      { emitEvent: false },
    );
  }

  protected cerrarItemForm(): void {
    this.limpiarItemForm();
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
      this.itemForm.patchValue(
        { precio: String(Math.round(resultado)) },
        { emitEvent: false },
      );
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
    const editingIdx = this.itemFormEditingIdx();
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

    const nuevoItem: ItemAgregado = {
      producto_raw: nombreProducto,
      cantidad,
      unidad: unidadNombre,
      producto_id: productoId,
      unidad_id: unidadId ?? undefined,
      precio_unitario: isNaN(precio) ? undefined : precio,
    };

    if (mode === 'new') {
      this.itemsAgregados.update((arr) => [...arr, nuevoItem]);
    } else if (mode === 'edit' && editingIdx !== null) {
      this.itemsAgregados.update((arr) => {
        const next = [...arr];
        next[editingIdx] = nuevoItem;
        return next;
      });
    }

    // Si se creó un producto nuevo desde "Agregar al catálogo", registrarlo para
    // no borrarlo en limpiarItemForm (el usuario lo confirmó).
    const productoCreado = this._catalogProductoJustCreated;
    this._catalogProductoJustCreated = null;
    if (productoCreado !== null) {
      this._productosCreados.push(productoCreado);
    }

    this.limpiarItemForm();
  }

  private limpiarItemForm(): void {
    // Si hay un producto recién creado que no fue confirmado, borrarlo
    if (this._catalogProductoJustCreated !== null) {
      const idABorrar = this._catalogProductoJustCreated;
      this._catalogProductoJustCreated = null;
      this.productos.update((list) => list.filter((p) => p.id !== idABorrar));
      this.api.deleteProducto(idABorrar).subscribe();
    }
    this.itemFormMode.set(null);
    this.itemFormEditingIdx.set(null);
    this.itemFormProductoId.set(null);
    this.itemFormFueraCatalogo.set(false);
    this.itemFormProductoRaw.set('');
    this.mostrarAgregarCatalogo.set(false);
    this._itemFormProductoSel = null;
    this.itemFormDescuentoPct.set('');
    this.itemForm.reset({ unidad_id: null, cantidad: '', precio: '' });
  }

  // ── Agregar al catálogo ──────────────────────────────────────────────

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

  // ── Eliminar ítem ────────────────────────────────────────────────────

  protected pedirConfirmarEliminarItem(idx: number): void {
    this.itemEliminandoIdx.set(idx);
  }

  protected cancelarEliminarItem(): void {
    this.itemEliminandoIdx.set(null);
  }

  protected confirmarEliminarItem(idx: number): void {
    this.itemsAgregados.update((arr) => arr.filter((_, i) => i !== idx));
    this.itemEliminandoIdx.set(null);
    if (this.itemFormMode() === 'edit' && this.itemFormEditingIdx() === idx) {
      this.limpiarItemForm();
    }
  }

  // ── Descuento global ─────────────────────────────────────────────────

  protected onDescuentoChange(): void {
    const valor = parseFloat(this.descuentoValor());
    if (this.mostrarDescuento() && !isNaN(valor) && valor > 0) {
      this.descuentoPendiente.set({
        tipo: this.descuentoTipo(),
        valor,
        motivo: this.descuentoMotivo(),
      });
      this.mostrarDescuento.set(false);
    } else {
      this.descuentoPendiente.set(null);
    }
  }

  protected aplicarDescuentoEfectivo(): void {
    this.descuentoTipo.set('porcentaje');
    this.descuentoValor.set('10');
    this.descuentoMotivo.set('Efectivo');
    this.descuentoPendiente.set({ tipo: 'porcentaje', valor: 10, motivo: 'Efectivo' });
    this.mostrarDescuento.set(false);
  }

  protected quitarDescuentoGlobal(): void {
    this.descuentoPendiente.set(null);
    this.mostrarDescuento.set(false);
    this.descuentoValor.set('');
    this.descuentoMotivo.set('');
  }

  // ── Guardar ──────────────────────────────────────────────────────────

  protected guardar(): void {
    const { fechaDate, fechaTime } = this.editPedidoForm.value;
    const fechaISO =
      fechaDate && fechaTime
        ? new Date(`${fechaDate}T${fechaTime}`).toISOString()
        : new Date().toISOString();

    this.guardando.set(true);

    this.api
      .crearPedidoPanel({
        cliente_id: this.clienteId(),
        fecha: fechaISO,
        estado: this.estadoNuevo(),
      })
      .pipe(
        switchMap((pedido) => {
          const items = this.itemsAgregados();
          const descuento = this.descuentoPendiente();
          const tareas = [
            ...items.map((item) =>
              this.api.crearItemPedido(pedido.id, {
                producto_raw: item.producto_raw,
                cantidad: item.cantidad,
                unidad: item.unidad,
                producto_id: item.producto_id,
                unidad_id: item.unidad_id,
                precio_unitario: item.precio_unitario,
              }),
            ),
            ...(descuento ? [this.api.aplicarDescuento(pedido.id, descuento)] : []),
          ];
          return tareas.length > 0 ? forkJoin(tareas) : of([]);
        }),
      )
      .subscribe({
        next: () => {
          this._productosCreados = [];
          this.guardando.set(false);
          this.dialogRef.close(true);
        },
        error: () => {
          this.guardando.set(false);
          this.snack.open('Error al crear el pedido', 'Cerrar', { duration: 4000 });
        },
      });
  }

  // ── Cerrar ───────────────────────────────────────────────────────────

  protected intentarCerrar(): void {
    if (this.hayCambios() || this._catalogProductoJustCreated !== null || this._productosCreados.length > 0) {
      this.mostrarConfirmCierre.set(true);
    } else {
      this.dialogRef.close(false);
    }
  }

  protected cerrarConfirmado(): void {
    // Limpiar el form (borra _catalogProductoJustCreated si hay uno pendiente)
    this.limpiarItemForm();
    // Borrar productos creados que no llegaron a guardarse en un pedido
    for (const id of this._productosCreados) {
      this.api.deleteProducto(id).subscribe();
    }
    this._productosCreados = [];
    this.dialogRef.close(false);
  }

  protected cancelarCierre(): void {
    this.mostrarConfirmCierre.set(false);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private mejorPrecio(prod: Producto, unidadId: number | null): string {
    if (!unidadId) return '';
    const clientePrice =
      prod.precios_cliente?.find((pc) => pc.unidad_id === unidadId)?.precio ?? null;
    const catalogPrice =
      prod.precios_default.find((pd) => pd.unidad_id === unidadId)?.precio ?? null;
    if (clientePrice != null && catalogPrice != null) {
      return String(Math.min(Number(clientePrice), Number(catalogPrice)));
    }
    return String(clientePrice ?? catalogPrice ?? '');
  }
}
