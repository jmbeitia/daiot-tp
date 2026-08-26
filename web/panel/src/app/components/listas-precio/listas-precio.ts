import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CurrencyPipe, PercentPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClienteConStats, ListaPrecio, Producto, Unidad } from '../../models';
import { ApiService } from '../../services/api.service';

type EstadoFila = 'original' | 'nuevo' | 'modificado' | 'eliminado';

interface PrecioFila {
  id: number; // negativo si es nuevo sin guardar
  producto_id: number;
  unidad_id: number;
  precio: string;
  producto: { id: number; nombre: string };
  unidad: { id: number; nombre: string; abreviacion?: string | null };
  _estado: EstadoFila;
}

interface DraftNuevo {
  id: number;
  producto_id: number;
  unidad_id: number;
  precio: string;
}

@Component({
  selector: 'app-listas-precio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    PercentPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './listas-precio.html',
  styleUrl: './listas-precio.scss',
})
export class ListasPrecioComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private snack = inject(MatSnackBar);

  // ── Selección de cliente ─────────────────────────────
  protected clientes = signal<ClienteConStats[]>([]);
  protected cargandoClientes = signal(true);
  protected clienteId = signal<number | null>(null);

  protected clienteSelectSearch = new FormControl<string>('');
  private clienteSelectSearchVal = toSignal(
    this.clienteSelectSearch.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected clientesFiltrados = computed(() => {
    const q = (this.clienteSelectSearchVal() ?? '').toLowerCase().trim();
    return q
      ? this.clientes().filter(
          (c) => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q),
        )
      : this.clientes();
  });
  protected cliente = computed(() =>
    this.clientes().find((c) => c.id === this.clienteId()) ?? null,
  );

  // ── Listas del cliente ───────────────────────────────
  protected listas = signal<ListaPrecio[]>([]);
  protected listaSeleccionadaId = signal<number | null>(null);
  protected cargando = signal(false);

  protected productos = signal<Producto[]>([]);
  protected unidades = signal<Unidad[]>([]);

  // Nueva lista
  protected nombreNuevaLista = signal('');
  protected creandoLista = signal(false);
  protected mostrarFormNuevaLista = signal(false);

  // Edición de nombre de lista
  protected editandoNombreListaId = signal<number | null>(null);
  protected editandoNombreValor = signal('');

  // Nuevo precio en lista
  protected nuevoProductoId = signal<number | null>(null);
  protected nuevaUnidadId = signal<number | null>(null);
  protected nuevoPrecio = signal<string>('');

  // ── Borrador de precios (no persiste hasta "Guardar cambios") ──
  private tempId = -1;
  protected draftAgregados = signal<DraftNuevo[]>([]);
  protected draftEditados = signal<Map<number, { precio: string; unidad_id: number }>>(new Map());
  protected draftEliminados = signal<Set<number>>(new Set());
  protected guardandoCambios = signal(false);

  // Edición inline de una fila
  protected editandoPrecioId = signal<number | null>(null);
  protected editandoPrecioValor = signal('');
  protected editandoUnidadId = signal<number | null>(null);

  // Import / Export CSV
  protected exportando = signal(false);
  protected importando = signal(false);

  protected readonly columnasPrecio = ['producto', 'unidad', 'precio_especial', 'precio_default', 'diff', 'accion'];

  protected listaSeleccionada = computed(() =>
    this.listas().find((l) => l.id === this.listaSeleccionadaId()) ?? null,
  );

  /** Precios originales (del backend) de la lista seleccionada. */
  protected preciosOriginales = computed(() => this.listaSeleccionada()?.precios ?? []);

  /** Precios efectivos: originales + borrador, con su estado. */
  protected preciosEfectivos = computed<PrecioFila[]>(() => {
    const editados = this.draftEditados();
    const eliminados = this.draftEliminados();
    const unids = this.unidades();
    const prods = this.productos();

    const resolverUnidad = (id: number) =>
      unids.find((u) => u.id === id) ?? { id, nombre: '—', abreviacion: null };
    const resolverProducto = (id: number) => {
      const p = prods.find((x) => x.id === id);
      return p ? { id: p.id, nombre: p.nombre } : { id, nombre: '—' };
    };

    const filasOriginales = this.preciosOriginales().map((p): PrecioFila => {
      if (eliminados.has(p.id)) {
        return {
          id: p.id, producto_id: p.producto_id, unidad_id: p.unidad_id, precio: p.precio,
          producto: p.producto, unidad: p.unidad, _estado: 'eliminado',
        };
      }
      const edit = editados.get(p.id);
      if (edit) {
        return {
          id: p.id, producto_id: p.producto_id, unidad_id: edit.unidad_id, precio: edit.precio,
          producto: p.producto, unidad: resolverUnidad(edit.unidad_id), _estado: 'modificado',
        };
      }
      return {
        id: p.id, producto_id: p.producto_id, unidad_id: p.unidad_id, precio: p.precio,
        producto: p.producto, unidad: p.unidad, _estado: 'original',
      };
    });

    const filasNuevas = this.draftAgregados().map((n): PrecioFila => ({
      id: n.id, producto_id: n.producto_id, unidad_id: n.unidad_id, precio: n.precio,
      producto: resolverProducto(n.producto_id), unidad: resolverUnidad(n.unidad_id), _estado: 'nuevo',
    }));

    return [...filasOriginales, ...filasNuevas];
  });

  protected hayCambios = computed(() =>
    this.draftAgregados().length > 0 ||
    this.draftEditados().size > 0 ||
    this.draftEliminados().size > 0,
  );

  ngOnInit(): void {
    this.api.getProductos(null, null, true).subscribe({
      next: (p) => this.productos.set(p),
    });

    this.api.getUnidades().subscribe({
      next: (u) => this.unidades.set(u),
    });

    this.api.getClientes().subscribe({
      next: (res) => {
        this.clientes.set(res.data);
        this.cargandoClientes.set(false);
      },
      error: () => this.cargandoClientes.set(false),
    });

    // El cliente seleccionado se refleja en la URL (/listas-precios/:clienteId).
    // Reaccionar a la URL centraliza la selección (selector, back/forward, link directo).
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      const raw = pm.get('clienteId');
      const id = raw ? Number(raw) : null;
      if (id === null) {
        if (this.clienteId() !== null) this.limpiarSeleccion();
      } else if (id !== this.clienteId()) {
        this.cambiarCliente(id);
      }
    });
  }

  protected onClienteChange(id: number | null): void {
    if (id === null || id === this.clienteId()) return;
    if (this.hayCambios() && !confirm('Tenés cambios sin guardar. ¿Descartarlos?')) {
      // Revertir el select al cliente actual
      const actual = this.clienteId();
      this.clienteId.set(null);
      queueMicrotask(() => this.clienteId.set(actual));
      return;
    }
    // La navegación dispara la suscripción a paramMap, que hace la carga
    this.router.navigate(['/listas-precios', id]);
  }

  protected onClienteSelectOpenedChange(opened: boolean): void {
    if (!opened) this.clienteSelectSearch.setValue('');
  }

  private cambiarCliente(id: number): void {
    this.descartarCambios();
    this.clienteId.set(id);
    this.listaSeleccionadaId.set(null);
    this.listas.set([]);
    this.resetFormPrecio();
    this.cargarListas();
  }

  private limpiarSeleccion(): void {
    this.descartarCambios();
    this.clienteId.set(null);
    this.listaSeleccionadaId.set(null);
    this.listas.set([]);
    this.resetFormPrecio();
  }

  private cargarListas(listaPreferida?: number): void {
    const id = this.clienteId();
    if (id === null) return;
    this.cargando.set(true);
    this.api.getListasPrecio(id).subscribe({
      next: (listas) => {
        this.listas.set(listas);
        if (listas.length > 0) {
          const elegida = listaPreferida
            ? listas.find((l) => l.id === listaPreferida)
            : undefined;
          const defaultLista = elegida ?? listas.find((l) => l.es_default) ?? listas[0];
          this.listaSeleccionadaId.set(defaultLista.id);
        }
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  protected seleccionarLista(id: number): void {
    if (id === this.listaSeleccionadaId()) return;
    if (this.hayCambios() && !confirm('Tenés cambios sin guardar en esta lista. ¿Descartarlos?')) return;
    this.descartarCambios();
    this.listaSeleccionadaId.set(id);
    this.resetFormPrecio();
  }

  // ── Nueva lista ──────────────────────────────────────

  protected toggleFormNuevaLista(): void {
    this.mostrarFormNuevaLista.update((v) => !v);
    this.nombreNuevaLista.set('');
  }

  protected crearLista(): void {
    const nombre = this.nombreNuevaLista().trim();
    const clienteId = this.clienteId();
    if (!nombre || clienteId === null) return;
    this.creandoLista.set(true);
    this.api.createListaPrecio(clienteId, nombre).subscribe({
      next: (lista) => {
        this.listas.update((ls) => [...ls, { ...lista, precios: [] }]);
        this.listaSeleccionadaId.set(lista.id);
        this.mostrarFormNuevaLista.set(false);
        this.nombreNuevaLista.set('');
        this.creandoLista.set(false);
      },
      error: () => this.creandoLista.set(false),
    });
  }

  // ── Default ──────────────────────────────────────────

  protected marcarDefault(lista: ListaPrecio): void {
    const clienteId = this.clienteId();
    if (lista.es_default || clienteId === null) return;
    this.api.marcarDefaultListaPrecio(clienteId, lista.id).subscribe({
      next: () => {
        this.listas.update((ls) =>
          ls.map((l) => ({ ...l, es_default: l.id === lista.id })),
        );
        this.snack.open('Lista marcada como default', '', { duration: 2000 });
      },
    });
  }

  // ── Edición nombre de lista ──────────────────────────

  protected iniciarEditarNombreLista(lista: ListaPrecio): void {
    this.editandoNombreListaId.set(lista.id);
    this.editandoNombreValor.set(lista.nombre);
  }

  protected guardarNombreLista(lista: ListaPrecio): void {
    const nombre = this.editandoNombreValor().trim();
    const clienteId = this.clienteId();
    if (!nombre || clienteId === null) { this.cancelarEditarNombreLista(); return; }
    this.api.updateListaPrecio(clienteId, lista.id, { nombre }).subscribe({
      next: (updated) => {
        this.listas.update((ls) =>
          ls.map((l) => l.id === lista.id ? { ...l, nombre: updated.nombre } : l),
        );
        this.editandoNombreListaId.set(null);
      },
    });
  }

  protected cancelarEditarNombreLista(): void {
    this.editandoNombreListaId.set(null);
    this.editandoNombreValor.set('');
  }

  // ── Eliminar lista ────────────────────────────────────

  protected eliminarLista(lista: ListaPrecio): void {
    const clienteId = this.clienteId();
    if (clienteId === null) return;
    if (!confirm(`¿Eliminar la lista "${lista.nombre}"? Esta acción no se puede deshacer.`)) return;
    this.api.deleteListaPrecio(clienteId, lista.id).subscribe({
      next: () => {
        this.descartarCambios();
        this.listas.update((ls) => ls.filter((l) => l.id !== lista.id));
        if (this.listaSeleccionadaId() === lista.id) {
          const primera = this.listas()[0];
          this.listaSeleccionadaId.set(primera?.id ?? null);
        }
        this.snack.open('Lista eliminada', '', { duration: 2000 });
      },
    });
  }

  // ── Precios: helpers ──────────────────────────────────

  protected getPrecioDefault(productoId: number, unidadId: number): number | null {
    const prod = this.productos().find((p) => p.id === productoId);
    const pd = prod?.precios_default?.find((p) => p.unidad_id === unidadId && !p.fecha_hasta);
    return pd?.precio != null ? parseFloat(pd.precio) : null;
  }

  protected getDiff(precioEspecial: string, productoId: number, unidadId: number): number | null {
    const def = this.getPrecioDefault(productoId, unidadId);
    if (def == null || def === 0) return null;
    return (parseFloat(precioEspecial) - def) / def;
  }

  /** Unidades elegibles al editar: todas menos las que ese producto ya usa (salvo la actual). */
  protected unidadesDisponibles(p: PrecioFila): Unidad[] {
    const usadas = new Set(
      this.preciosEfectivos()
        .filter((x) => x.producto_id === p.producto_id && x.id !== p.id && x._estado !== 'eliminado')
        .map((x) => x.unidad_id),
    );
    return this.unidades().filter((u) => !usadas.has(u.id) || u.id === p.unidad_id);
  }

  // ── Precios: agregar (al borrador) ────────────────────

  protected agregarPrecio(): void {
    const producto_id = this.nuevoProductoId();
    const unidad_id = this.nuevaUnidadId();
    const precio = parseFloat(this.nuevoPrecio());
    if (!producto_id || !unidad_id || isNaN(precio)) return;

    // ¿Ya existe una fila efectiva (no eliminada) con ese producto + unidad?
    const existente = this.preciosEfectivos().find(
      (x) => x.producto_id === producto_id && x.unidad_id === unidad_id && x._estado !== 'eliminado',
    );

    if (existente) {
      this.aplicarEdicionFila(existente, String(precio), unidad_id);
      this.snack.open('Ya existía ese producto y unidad: se actualizó el precio', '', { duration: 2500 });
    } else {
      this.draftAgregados.update((arr) => [
        ...arr,
        { id: this.tempId--, producto_id, unidad_id, precio: String(precio) },
      ]);
    }
    this.resetFormPrecio();
  }

  private resetFormPrecio(): void {
    this.nuevoProductoId.set(null);
    this.nuevaUnidadId.set(null);
    this.nuevoPrecio.set('');
  }

  protected puedeAgregarPrecio = computed(
    () => this.nuevoProductoId() !== null && this.nuevaUnidadId() !== null && this.nuevoPrecio() !== '',
  );

  // ── Precios: editar inline (al borrador) ──────────────

  protected iniciarEditarPrecio(p: PrecioFila): void {
    this.editandoPrecioId.set(p.id);
    this.editandoPrecioValor.set(String(parseFloat(p.precio)));
    this.editandoUnidadId.set(p.unidad_id);
  }

  protected guardarEditarPrecio(p: PrecioFila): void {
    const precio = parseFloat(this.editandoPrecioValor());
    const unidad = this.editandoUnidadId();
    if (isNaN(precio) || unidad === null) { this.cancelarEditarPrecio(); return; }
    this.aplicarEdicionFila(p, String(precio), unidad);
    this.cancelarEditarPrecio();
  }

  /** Aplica una edición de precio/unidad al borrador. Si no hay cambio real vs. el original, no guarda nada. */
  private aplicarEdicionFila(p: PrecioFila, precio: string, unidad_id: number): void {
    const precioNum = parseFloat(precio);

    if (p._estado === 'nuevo') {
      this.draftAgregados.update((arr) =>
        arr.map((n) => n.id === p.id ? { ...n, precio: String(precioNum), unidad_id } : n),
      );
      return;
    }

    // Original o modificado: comparar contra el valor real del backend
    const original = this.preciosOriginales().find((x) => x.id === p.id);
    const igualAlOriginal =
      !!original && parseFloat(original.precio) === precioNum && original.unidad_id === unidad_id;

    this.draftEditados.update((m) => {
      const nm = new Map(m);
      if (igualAlOriginal) {
        nm.delete(p.id); // sin cambios → no se guarda nada
      } else {
        nm.set(p.id, { precio: String(precioNum), unidad_id });
      }
      return nm;
    });
  }

  protected cancelarEditarPrecio(): void {
    this.editandoPrecioId.set(null);
    this.editandoPrecioValor.set('');
    this.editandoUnidadId.set(null);
  }

  // ── Precios: eliminar / deshacer (al borrador) ────────

  protected eliminarPrecio(p: PrecioFila): void {
    if (this.editandoPrecioId() === p.id) this.cancelarEditarPrecio();
    if (p._estado === 'nuevo') {
      this.draftAgregados.update((arr) => arr.filter((n) => n.id !== p.id));
    } else {
      this.draftEliminados.update((s) => new Set(s).add(p.id));
      this.draftEditados.update((m) => {
        const nm = new Map(m);
        nm.delete(p.id);
        return nm;
      });
    }
  }

  protected deshacerEliminarPrecio(p: PrecioFila): void {
    this.draftEliminados.update((s) => {
      const ns = new Set(s);
      ns.delete(p.id);
      return ns;
    });
  }

  // ── Import / Export CSV ───────────────────────────────

  protected exportar(): void {
    const lista = this.listaSeleccionada();
    const clienteId = this.clienteId();
    if (!lista || clienteId === null || this.exportando()) return;

    this.exportando.set(true);
    this.api.exportListaPrecio(clienteId, lista.id).subscribe({
      next: (resp) => {
        const blob = resp.body ?? new Blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lista_${this.slug(this.cliente()?.nombre)}_${this.slug(lista.nombre)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportando.set(false);
      },
      error: () => {
        this.exportando.set(false);
        this.snack.open('No se pudo exportar la lista', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected onArchivoImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) return;

    const lista = this.listaSeleccionada();
    const clienteId = this.clienteId();
    if (!lista || clienteId === null) return;

    if (this.hayCambios() && !confirm('Tenés cambios sin guardar que se descartarán al importar. ¿Continuar?')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const contenido = String(reader.result ?? '');
      this.importando.set(true);
      this.api.importListaPrecio(clienteId, lista.id, contenido).subscribe({
        next: (r) => {
          this.importando.set(false);
          this.descartarCambios();
          this.snack.open(
            `Importado: ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.eliminados} eliminados, ${r.sin_cambios} sin cambios`,
            '',
            { duration: 5000 },
          );
          this.cargarListas(lista.id);
        },
        error: (err) => {
          this.importando.set(false);
          const errores: string[] | undefined = err?.error?.errores;
          const mensaje: string = err?.error?.error ?? 'Error al importar el archivo';
          if (errores?.length) {
            alert(`${mensaje}:\n\n` + errores.join('\n'));
          } else {
            this.snack.open(mensaje, 'Cerrar', { duration: 5000 });
          }
        },
      });
    };
    reader.onerror = () => this.snack.open('No se pudo leer el archivo', 'Cerrar', { duration: 4000 });
    reader.readAsText(file);
  }

  private slug(s: string | undefined): string {
    return (s ?? 'lista')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'lista';
  }

  // ── Guardar / Descartar borrador ──────────────────────

  protected descartarCambios(): void {
    this.draftAgregados.set([]);
    this.draftEditados.set(new Map());
    this.draftEliminados.set(new Set());
    this.cancelarEditarPrecio();
    this.resetFormPrecio();
  }

  protected guardarCambios(): void {
    const lista = this.listaSeleccionada();
    const clienteId = this.clienteId();
    if (!lista || clienteId === null || !this.hayCambios()) return;

    const tareas: Observable<unknown>[] = [];

    for (const id of this.draftEliminados()) {
      const orig = this.preciosOriginales().find((x) => x.id === id);
      if (orig) tareas.push(this.api.deletePrecioLista(clienteId, lista.id, orig.producto_id, orig.unidad_id));
    }

    for (const [id, datos] of this.draftEditados()) {
      const orig = this.preciosOriginales().find((x) => x.id === id);
      if (!orig) continue;
      const cambioUnidad = datos.unidad_id !== orig.unidad_id;
      tareas.push(this.api.updatePrecioLista(
        clienteId, lista.id, orig.producto_id, orig.unidad_id, parseFloat(datos.precio),
        cambioUnidad ? datos.unidad_id : undefined,
      ));
    }

    for (const n of this.draftAgregados()) {
      tareas.push(this.api.createPrecioLista(clienteId, lista.id, {
        producto_id: n.producto_id, unidad_id: n.unidad_id, precio: parseFloat(n.precio),
      }));
    }

    this.guardandoCambios.set(true);
    forkJoin(tareas).subscribe({
      next: () => {
        this.guardandoCambios.set(false);
        this.descartarCambios();
        this.snack.open('Cambios guardados', '', { duration: 2000 });
        this.cargarListas(lista.id);
      },
      error: () => {
        this.guardandoCambios.set(false);
        this.snack.open('Error al guardar los cambios', 'Cerrar', { duration: 4000 });
      },
    });
  }
}
