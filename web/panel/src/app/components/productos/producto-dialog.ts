import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Categoria, ItemPedidoConPedido, Producto, Unidad } from '../../models';
import { ApiService } from '../../services/api.service';

interface DialogData {
  producto: Producto | null;
  productos: Producto[];
  categorias: Categoria[];
  unidades: Unidad[];
}

interface PrecioFila {
  _key: number;
  unidad_id: number | null;
  precio: string;
  _eliminado: boolean;
}

@Component({
  selector: 'app-producto-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`.pedido-row { cursor: pointer; transition: background 0.15s; } .pedido-row:hover { background: var(--mat-sys-surface-variant); }`],
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    TitleCasePipe,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatDividerModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
  ],
  templateUrl: './producto-dialog.html',
})
export class ProductoDialogComponent {
  protected data = inject<DialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ProductoDialogComponent>);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  protected guardando = signal(false);
  protected mostrarConfirmCierre = signal(false);

  protected pedidosDataSource = new MatTableDataSource<ItemPedidoConPedido>([]);
  protected totalPedidos = signal(0);
  protected cargandoPedidos = signal(false);
  protected paginaPedidos = signal(0);
  protected readonly pageSize = 5;
  protected readonly pedidosColumnas = ['fecha', 'cliente', 'cantidad'];

  constructor() {
    // Interceptar el cierre (backdrop / ESC) para avisar si hay cambios sin guardar
    this.dialogRef.backdropClick().subscribe(() => this.intentarCerrar());
    this.dialogRef.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') this.intentarCerrar();
    });

    if (this.esEdicion) {
      this.cargarPedidos(0);
    }
  }

  protected form = this.fb.group({
    nombre: new FormControl(this.data.producto?.nombre ?? '', Validators.required),
    categoria_id: new FormControl<number | null>(this.data.producto?.categoria_id ?? null),
    unidad_default: new FormControl(this.data.producto?.unidad_default ?? '', Validators.required),
  });

  get esEdicion(): boolean {
    return this.data.producto !== null;
  }

  // ── Precios por unidad (borrador local; persiste al Guardar) ──
  private precioKey = 0;
  protected precios = signal<PrecioFila[]>(
    (this.data.producto?.precios_default ?? []).map((p) => ({
      _key: this.precioKey++,
      unidad_id: p.unidad_id,
      precio: p.precio ?? '',
      _eliminado: false,
    })),
  );

  protected readonly preciosColumnas = ['unidad', 'precio', 'accion'];

  // Edición inline
  protected editandoKey = signal<number | null>(null);
  protected editUnidadId = signal<number | null>(null);
  protected editPrecio = signal<string>('');

  // Agregar
  protected mostrarFormAgregar = signal(false);
  protected nuevoUnidadId = signal<number | null>(null);
  protected nuevoPrecio = signal<string>('');
  protected puedeAgregar = computed(
    () => this.nuevoUnidadId() !== null && this.nuevoPrecio() !== '' && !isNaN(parseFloat(this.nuevoPrecio())),
  );

  protected toggleFormAgregar(): void {
    this.mostrarFormAgregar.update((v) => !v);
    this.nuevoUnidadId.set(null);
    this.nuevoPrecio.set('');
  }

  protected cancelarAgregar(): void {
    this.mostrarFormAgregar.set(false);
    this.nuevoUnidadId.set(null);
    this.nuevoPrecio.set('');
  }

  protected nombreUnidad(id: number | null): string {
    return this.data.unidades.find((u) => u.id === id)?.nombre ?? '—';
  }

  /** Unidades elegibles al editar una fila: las que no usa otra fila activa (salvo la propia). */
  protected unidadesDisponibles(fila: PrecioFila): Unidad[] {
    const usadas = new Set(
      this.precios()
        .filter((x) => x._key !== fila._key && !x._eliminado && x.unidad_id !== null)
        .map((x) => x.unidad_id as number),
    );
    return this.data.unidades.filter((u) => !usadas.has(u.id) || u.id === fila.unidad_id);
  }

  /** Unidades libres para el formulario de agregar. */
  protected unidadesParaAgregar = computed(() => {
    const usadas = new Set(
      this.precios()
        .filter((x) => !x._eliminado && x.unidad_id !== null)
        .map((x) => x.unidad_id as number),
    );
    return this.data.unidades.filter((u) => !usadas.has(u.id));
  });

  // ── Acciones de fila ──────────────────────────────────

  protected iniciarEditar(fila: PrecioFila): void {
    this.editandoKey.set(fila._key);
    this.editUnidadId.set(fila.unidad_id);
    this.editPrecio.set(fila.precio === '' ? '' : String(parseFloat(fila.precio)));
  }

  protected guardarEditar(fila: PrecioFila): void {
    const unidad = this.editUnidadId();
    const precio = this.editPrecio();
    if (unidad === null || precio === '' || isNaN(parseFloat(precio))) {
      this.snack.open('Completá unidad y precio', '', { duration: 2500 });
      return;
    }
    this.precios.update((arr) =>
      arr.map((x) => x._key === fila._key ? { ...x, unidad_id: unidad, precio: String(parseFloat(precio)) } : x),
    );
    this.cancelarEditar();
  }

  protected cancelarEditar(): void {
    this.editandoKey.set(null);
    this.editUnidadId.set(null);
    this.editPrecio.set('');
  }

  protected eliminar(fila: PrecioFila): void {
    if (this.editandoKey() === fila._key) this.cancelarEditar();
    this.precios.update((arr) =>
      arr.map((x) => x._key === fila._key ? { ...x, _eliminado: true } : x),
    );
  }

  protected deshacer(fila: PrecioFila): void {
    this.precios.update((arr) =>
      arr.map((x) => x._key === fila._key ? { ...x, _eliminado: false } : x),
    );
  }

  protected agregar(): void {
    const unidad = this.nuevoUnidadId();
    const precio = this.nuevoPrecio();
    if (unidad === null || precio === '' || isNaN(parseFloat(precio))) return;
    this.precios.update((arr) => [
      ...arr,
      { _key: this.precioKey++, unidad_id: unidad, precio: String(parseFloat(precio)), _eliminado: false },
    ]);
    this.nuevoUnidadId.set(null);
    this.nuevoPrecio.set('');
  }

  // ── Guardar producto ──────────────────────────────────

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snack.open('Completá el nombre del producto', '', { duration: 3000 });
      return;
    }

    const { nombre, categoria_id, unidad_default } = this.form.value;
    const nombreTrim = nombre!.trim();
    const nombreLower = nombreTrim.toLowerCase();
    const propioId = this.data.producto?.id ?? null;
    const duplicado = this.data.productos.find(
      (p) => p.nombre.toLowerCase() === nombreLower && p.id !== propioId,
    );
    if (duplicado) {
      this.snack.open(`Ya existe "${duplicado.nombre}" en el catálogo`, '', { duration: 4000 });
      return;
    }

    this.guardando.set(true);

    const precios = this.precios()
      .filter((p) => !p._eliminado && p.unidad_id !== null && p.precio !== '' && !isNaN(parseFloat(p.precio)))
      .map((p) => ({ unidad_id: p.unidad_id as number, precio: parseFloat(p.precio) }));

    const payload = {
      nombre: nombreTrim,
      categoria_id: categoria_id ?? null,
      unidad_default: unidad_default!,
      precios,
    };

    const obs = this.esEdicion
      ? this.api.updateProducto(this.data.producto!.id, payload)
      : this.api.createProducto(payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.guardando.set(false);
        const msg = err?.error?.error ?? 'Error al guardar el producto';
        this.snack.open(msg, '', { duration: 4000 });
      },
    });
  }

  protected cargarPedidos(pageIndex: number): void {
    const id = this.data.producto!.id;
    this.cargandoPedidos.set(true);
    this.api.getPedidosDelProducto(id, pageIndex + 1, this.pageSize).subscribe({
      next: ({ pedidos, total }) => {
        this.pedidosDataSource.data = pedidos;
        this.totalPedidos.set(total);
        this.cargandoPedidos.set(false);
      },
      error: () => this.cargandoPedidos.set(false),
    });
  }

  protected onPageChange(event: { pageIndex: number }): void {
    this.paginaPedidos.set(event.pageIndex);
    this.cargarPedidos(event.pageIndex);
  }

  protected irAPedido(pedidoId: number, fecha: string): void {
    const d = new Date(fecha);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dia = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    this.dialogRef.close();
    this.router.navigate(['/pedidos'], {
      queryParams: {
        desde: `${dia}T00:00`,
        hasta: `${dia}T23:59`,
        estado: 'todos',
        abrir_pedido_id: pedidoId,
      },
    });
  }

  // ── Cierre con cambios sin guardar ────────────────────

  /** ¿Hay cambios sin persistir? (datos del producto, precios, o un precio a medio cargar) */
  protected hayCambios(): boolean {
    return this.form.dirty
      || this.preciosModificados()
      || this.nuevoUnidadId() !== null
      || this.nuevoPrecio().trim() !== '';
  }

  private preciosModificados(): boolean {
    const norm = (filas: { unidad_id: number | null; precio: string; _eliminado?: boolean }[]) =>
      filas
        .filter((p) => !p._eliminado && p.unidad_id !== null && p.precio !== '' && !isNaN(parseFloat(p.precio)))
        .map((p) => `${p.unidad_id}:${parseFloat(p.precio)}`)
        .sort()
        .join('|');

    const original = norm(
      (this.data.producto?.precios_default ?? []).map((p) => ({ unidad_id: p.unidad_id, precio: p.precio ?? '' })),
    );
    return original !== norm(this.precios());
  }

  protected intentarCerrar(): void {
    if (this.guardando()) return;
    if (this.hayCambios()) {
      this.mostrarConfirmCierre.set(true);
    } else {
      this.dialogRef.close();
    }
  }

  protected cerrarConfirmado(): void {
    this.dialogRef.close();
  }

  protected cancelarCierre(): void {
    this.mostrarConfirmCierre.set(false);
  }
}
