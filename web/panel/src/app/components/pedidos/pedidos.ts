import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { interval, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorImpresion, EstadoPedido, Pedido } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PedidosEventService } from '../../services/pedidos-event.service';
import { PedidoDetalleDialogComponent } from './pedido-detalle-dialog';
import { CrearPedidoDialogComponent } from './crear-pedido-dialog';
import { FusionarDialogComponent } from './fusionar-dialog';

type FiltroEstado = EstadoPedido | 'todos';

interface FiltrosPersistidos {
  desdeFecha: string;
  desdeHora: string;
  hastaFecha: string;
  hastaHora: string;
  estado: FiltroEstado;
  noVistos?: boolean;
  erroresImpresion?: boolean;
}

const ESTADOS_LABELS: { value: EstadoPedido; label: string }[] = [
  { value: 'recibido', label: 'Recibido' },
  { value: 'en_preparacion', label: 'En preparación' },
  { value: 'listo', label: 'Listo' },
  { value: 'entregado', label: 'Entregado' },
];

@Component({
  selector: 'app-pedidos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    TitleCasePipe,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSelectModule,
    MatMenuModule,
  ],
  templateUrl: './pedidos.html',
  styleUrl: './pedidos.scss',
})
export class PedidosComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  protected auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pedidosEvent = inject(PedidosEventService);
  private snack = inject(MatSnackBar);

  private sort = viewChild(MatSort);
  private paginator = viewChild(MatPaginator);

  private readonly STORAGE_KEY = 'pedidos-filtros';

  protected dataSource = new MatTableDataSource<Pedido>([]);
  protected cargando = signal(true);
  protected filtroEstado = signal<FiltroEstado>('todos');

  protected desdeFecha = signal('');
  protected desdeHora = signal('');
  protected hastaFecha = signal('');
  protected hastaHora = signal('');

  protected clienteIdFiltro = signal<number | null>(null);
  protected clienteNombreFiltro = signal<string | null>(null);

  protected filtroNoVistos = signal(false);
  protected filtroErrImpresion = signal(false);

  protected modoAutoRefresh = signal(false);
  protected ultimaActualizacion = signal<Date | null>(null);
  protected segundosDesde = signal(0);
  private autoRefreshSub: Subscription | null = null;

  protected buscarCtrl = new FormControl('');

  protected seleccionados = signal<Set<number>>(new Set());
  protected seleccionadosArray = computed(() => Array.from(this.seleccionados()));
  protected readonly columnas = ['select', 'hora', 'cliente', 'items', 'total_final', 'estado', 'visto'];

  protected readonly estadosLabels = ESTADOS_LABELS;

  // Bulk action state
  private _pendingAbrirId: number | null = null;

  protected todosErrores = signal<ErrorImpresion[]>([]);
  protected erroresFueraDeRango = computed(() => {
    if (!this.filtroErrImpresion()) return [];
    const idsVisibles = new Set(this.dataSource.data.map((p) => p.id));
    return this.todosErrores().filter((e) => !idsVisibles.has(e.pedido_id));
  });

  protected operandoBulk = signal(false);
  protected confirmarEliminarBulk = signal(false);
  protected bulkEstadoSel = signal<EstadoPedido>('recibido');

  // Computed selection state for header checkbox
  protected todosEnPaginaSeleccionados = computed(() => {
    const visible = this.dataSource.filteredData;
    return visible.length > 0 && visible.every((p) => this.seleccionados().has(p.id));
  });

  protected algunoSeleccionado = computed(() => {
    const visible = this.dataSource.filteredData;
    return visible.some((p) => this.seleccionados().has(p.id));
  });

  protected hayIndeterminate = computed(() =>
    this.algunoSeleccionado() && !this.todosEnPaginaSeleccionados(),
  );

  constructor() {
    effect(() => {
      const p = this.paginator();
      if (p) this.dataSource.paginator = p;
    });

    effect(() => {
      const s = this.sort();
      if (s) {
        this.dataSource.sort = s;
        this.dataSource.sortingDataAccessor = (item: Pedido, property: string) => {
          switch (property) {
            case 'hora': return new Date(item.fecha).getTime();
            case 'cliente': return item.cliente?.nombre ?? '';
            case 'total_final': return item.total_final;
            case 'estado': return item.estado;
            default: return (item as unknown as Record<string, string | number>)[property] ?? '';
          }
        };
      }
    });

    this.dataSource.filterPredicate = (row: Pedido, filter: string) => {
      const q = filter.toLowerCase();
      const clienteMatch =
        (row.cliente?.nombre ?? '').toLowerCase().includes(q) ||
        (row.cliente?.telefono ?? '').includes(q);
      const itemsMatch = row.items.some(
        (i) =>
          (i.producto?.nombre ?? '').toLowerCase().includes(q) ||
          (i.producto_raw ?? '').toLowerCase().includes(q),
      );
      return clienteMatch || itemsMatch;
    };

    this.buscarCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe((v) => {
      this.dataSource.filter = (v ?? '').toLowerCase().trim();
    });

    this.pedidosEvent.pedidoCreado$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cargarPedidos();
    });

    interval(1000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.dialog.openDialogs.length > 0) return;
      const ua = this.ultimaActualizacion();
      if (ua) this.segundosDesde.set(Math.floor((Date.now() - ua.getTime()) / 1000));
    });
  }

  ngOnInit(): void {
    const hayFiltrosGuardados = !!sessionStorage.getItem(this.STORAGE_KEY);

    const filtros = this.loadFiltros();
    this.desdeFecha.set(filtros.desdeFecha);
    this.desdeHora.set(filtros.desdeHora);
    this.hastaFecha.set(filtros.hastaFecha);
    this.hastaHora.set(filtros.hastaHora);
    this.filtroEstado.set(filtros.estado);
    this.filtroNoVistos.set(filtros.noVistos ?? false);
    this.filtroErrImpresion.set(filtros.erroresImpresion ?? false);

    if (!hayFiltrosGuardados) this.iniciarAutoRefresh();

    this.route.queryParams.subscribe((params) => {
      const clienteId = params['cliente_id'] ? Number(params['cliente_id']) : null;
      const clienteNombre = params['cliente_nombre'] ?? null;
      this.clienteIdFiltro.set(clienteId);
      this.clienteNombreFiltro.set(clienteNombre);

      if (params['desde']) {
        const parts = (params['desde'] as string).split('T');
        this.desdeFecha.set(parts[0]);
        this.desdeHora.set((parts[1] ?? '').substring(0, 5) || '00:00');
      }
      if (params['hasta']) {
        const parts = (params['hasta'] as string).split('T');
        this.hastaFecha.set(parts[0]);
        this.hastaHora.set((parts[1] ?? '').substring(0, 5) || '23:59');
      }
      if (params['estado']) {
        this.filtroEstado.set(params['estado'] as FiltroEstado);
      }
      if ('no_vistos' in params) {
        this.filtroNoVistos.set(params['no_vistos'] === 'true');
      }
      if ('errores_impresion' in params) {
        this.filtroErrImpresion.set(params['errores_impresion'] === 'true');
      }
      if (params['abrir_pedido_id']) {
        this._pendingAbrirId = Number(params['abrir_pedido_id']);
      }

      this.cargarPedidos();
    });
  }

  private buildDefaultFilters(): FiltrosPersistidos {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = (d: Date) =>
      [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
    const timeStr = (d: Date) =>
      [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(':');
    return {
      desdeFecha: dateStr(desde),
      desdeHora: timeStr(desde),
      hastaFecha: dateStr(hasta),
      hastaHora: timeStr(hasta),
      estado: 'todos',
    };
  }

  private loadFiltros(): FiltrosPersistidos {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) return JSON.parse(stored) as FiltrosPersistidos;
    } catch { /* ignore */ }
    return this.buildDefaultFilters();
  }

  private saveFiltros(): void {
    try {
      const filtros: FiltrosPersistidos = {
        desdeFecha: this.desdeFecha(),
        desdeHora: this.desdeHora(),
        hastaFecha: this.hastaFecha(),
        hastaHora: this.hastaHora(),
        estado: this.filtroEstado(),
        noVistos: this.filtroNoVistos(),
        erroresImpresion: this.filtroErrImpresion(),
      };
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtros));
    } catch { /* ignore */ }
  }

  private buildDesde(): string {
    return new Date(`${this.desdeFecha()}T${this.desdeHora()}:00`).toISOString();
  }

  private buildHasta(): string {
    return new Date(`${this.hastaFecha()}T${this.hastaHora()}:59.999`).toISOString();
  }

  private cargarPedidos(): void {
    this.cargando.set(true);
    this.seleccionados.set(new Set());
    this.confirmarEliminarBulk.set(false);
    const estado = this.filtroEstado();
    const clienteId = this.clienteIdFiltro();
    const noVistos = this.filtroNoVistos();
    const errImpresion = this.filtroErrImpresion();

    const params: Parameters<typeof this.api.getPedidos>[0] = {};
    if (clienteId) {
      params.cliente_id = clienteId;
    } else {
      params.desde = this.buildDesde();
      params.hasta = this.buildHasta();
    }
    if (estado !== 'todos') params.estado = estado;
    if (noVistos) params.no_vistos = true;
    if (errImpresion) params.errores_impresion = true;

    this.api.getPedidos(params).subscribe({
      next: (data) => {
        this.dataSource.data = data;
        this.cargando.set(false);
        this.ultimaActualizacion.set(new Date());
        this.segundosDesde.set(0);

        if (this.filtroErrImpresion()) {
          this.api.getErroresImpresion().subscribe((errores) => this.todosErrores.set(errores));
        } else {
          this.todosErrores.set([]);
        }

        const abrirId = this._pendingAbrirId;
        if (abrirId !== null) {
          this._pendingAbrirId = null;
          const pedido = data.find((p) => p.id === abrirId);
          if (pedido) this.abrirDetalle(pedido);
        }
      },
      error: () => this.cargando.set(false),
    });
  }

  ngOnDestroy(): void {
    this.detenerAutoRefresh();
  }

  protected aplicarFiltros(): void {
    this.detenerAutoRefresh();
    this.saveFiltros();
    this.cargarPedidos();
  }

  protected onDesdeFechaChange(v: string): void {
    this.desdeFecha.set(v);
    this.aplicarFiltros();
  }

  protected onHastaFechaChange(v: string): void {
    this.hastaFecha.set(v);
    this.aplicarFiltros();
  }

  protected cambiarEstado(value: FiltroEstado): void {
    this.filtroEstado.set(value);
    this.saveFiltros();
    this.cargarPedidos();
  }

  protected toggleFiltroNoVistos(): void {
    this.filtroNoVistos.update((v) => !v);
    this.saveFiltros();
    this.cargarPedidos();
  }

  protected toggleFiltroErrImpresion(): void {
    this.filtroErrImpresion.update((v) => !v);
    this.saveFiltros();
    this.cargarPedidos();
  }

  protected resetearFiltros(): void {
    sessionStorage.removeItem(this.STORAGE_KEY);
    const defaults = this.buildDefaultFilters();
    this.desdeFecha.set(defaults.desdeFecha);
    this.desdeHora.set(defaults.desdeHora);
    this.hastaFecha.set(defaults.hastaFecha);
    this.hastaHora.set(defaults.hastaHora);
    this.filtroEstado.set('todos');
    this.filtroNoVistos.set(false);
    this.filtroErrImpresion.set(false);
    this.cargarPedidos();
    this.iniciarAutoRefresh();
  }

  private iniciarAutoRefresh(): void {
    this.detenerAutoRefresh();
    this.modoAutoRefresh.set(true);
    this.autoRefreshSub = interval(30000).subscribe(() => {
      if (this.dialog.openDialogs.length > 0) return;
      const defaults = this.buildDefaultFilters();
      this.desdeFecha.set(defaults.desdeFecha);
      this.desdeHora.set(defaults.desdeHora);
      this.hastaFecha.set(defaults.hastaFecha);
      this.hastaHora.set(defaults.hastaHora);
      this.cargarPedidos();
    });
  }

  private detenerAutoRefresh(): void {
    this.autoRefreshSub?.unsubscribe();
    this.autoRefreshSub = null;
    this.modoAutoRefresh.set(false);
  }

  protected irAlErrorMasViejo(): void {
    const fuera = this.erroresFueraDeRango();
    if (!fuera.length) return;
    const masViejo = fuera.reduce((a, b) =>
      new Date(a.fecha_pedido) < new Date(b.fecha_pedido) ? a : b,
    );
    const fecha = new Date(masViejo.fecha_pedido);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
    this.desdeFecha.set(dateStr);
    this.desdeHora.set('00:00');
    this.hastaFecha.set(dateStr);
    this.hastaHora.set('23:59');
    this.detenerAutoRefresh();
    this.saveFiltros();
    this.cargarPedidos();
  }

  protected limpiarFiltroEspecial(): void {
    this.filtroNoVistos.set(false);
    this.filtroErrImpresion.set(false);
    this.saveFiltros();
    this.cargarPedidos();
  }

  protected limpiarFiltroCliente(): void {
    this.router.navigate([], { queryParams: {} });
  }

  protected toggleSeleccion(id: number): void {
    this.seleccionados.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected estaSeleccionado(id: number): boolean {
    return this.seleccionados().has(id);
  }

  protected toggleSeleccionarTodos(checked: boolean): void {
    const ids = this.dataSource.filteredData.map((p) => p.id);
    this.seleccionados.set(checked ? new Set(ids) : new Set());
  }

  protected seleccionarTodos(): void {
    const ids = this.dataSource.filteredData.map((p) => p.id);
    this.seleccionados.set(new Set(ids));
  }

  protected deseleccionarTodos(): void {
    this.seleccionados.set(new Set());
  }

  // ── Bulk actions ───────────────────────────────────

  protected marcarVistosBulk(): void {
    const ids = this.seleccionadosArray();
    if (!ids.length) return;
    this.operandoBulk.set(true);
    this.api.marcarVistosBulk(ids).subscribe({
      next: () => {
        this.operandoBulk.set(false);
        this.snack.open(`${ids.length} pedidos marcados como vistos`, '', { duration: 3000 });
        this.cargarPedidos();
      },
      error: () => {
        this.operandoBulk.set(false);
        this.snack.open('Error al actualizar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected marcarNoVistosBulk(): void {
    const ids = this.seleccionadosArray();
    if (!ids.length) return;
    this.operandoBulk.set(true);
    this.api.marcarNoVistosBulk(ids).subscribe({
      next: () => {
        this.operandoBulk.set(false);
        this.snack.open(`${ids.length} pedidos marcados como no vistos`, '', { duration: 3000 });
        this.cargarPedidos();
      },
      error: () => {
        this.operandoBulk.set(false);
        this.snack.open('Error al actualizar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected aplicarCambioEstadoBulk(): void {
    const ids = this.seleccionadosArray();
    const estado = this.bulkEstadoSel();
    if (!ids.length) return;
    this.operandoBulk.set(true);
    this.api.cambiarEstadoBulk(ids, estado).subscribe({
      next: () => {
        this.operandoBulk.set(false);
        this.snack.open(`Estado actualizado en ${ids.length} pedidos`, '', { duration: 3000 });
        this.cargarPedidos();
      },
      error: () => {
        this.operandoBulk.set(false);
        this.snack.open('Error al actualizar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected eliminarBulk(): void {
    const ids = this.seleccionadosArray();
    if (!ids.length) return;
    this.operandoBulk.set(true);
    this.api.eliminarBulk(ids).subscribe({
      next: () => {
        this.operandoBulk.set(false);
        this.confirmarEliminarBulk.set(false);
        this.snack.open(`${ids.length} pedidos eliminados`, '', { duration: 3000 });
        this.cargarPedidos();
      },
      error: () => {
        this.operandoBulk.set(false);
        this.snack.open('Error al eliminar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected resumenItems(items: Pedido['items']): string {
    const visibles = items.slice(0, 2).map((i) => {
      const nombre = i.producto?.nombre ?? i.producto_raw ?? '—';
      return `${nombre} x${parseFloat(i.cantidad)}`;
    });
    return visibles.join(', ') + (items.length > 2 ? '…' : '');
  }

  protected abrirDetalle(pedido: Pedido): void {
    this.dialog
      .open(PedidoDetalleDialogComponent, {
        data: { pedido },
        width: '700px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) this.cargarPedidos();
      });
  }

  protected abrirCrear(): void {
    this.dialog
      .open(CrearPedidoDialogComponent, { width: '700px', maxHeight: '90vh', disableClose: true })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) this.cargarPedidos();
      });
  }

  protected abrirFusionar(): void {
    const ids = this.seleccionadosArray();
    if (ids.length < 2) return;
    const pedidosSel = this.dataSource.data.filter((p) => ids.includes(p.id));
    this.dialog
      .open(FusionarDialogComponent, {
        data: { pedidos: pedidosSel },
        width: '480px',
      })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) {
          this.seleccionados.set(new Set());
          const defaults = this.buildDefaultFilters();
          this.desdeFecha.set(defaults.desdeFecha);
          this.desdeHora.set(defaults.desdeHora);
          this.hastaFecha.set(defaults.hastaFecha);
          this.hastaHora.set(defaults.hastaHora);
          this.saveFiltros();
          this.cargarPedidos();
        }
      });
  }
}
