import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  catchError,
  forkJoin,
  interval,
  of,
  startWith,
  Subscription,
  switchMap,
} from 'rxjs';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../services/api.service';
import { ErrorImpresion, Metricas, Pedido } from '../../models';

type Seccion = 'top_productos' | 'no_vistos' | 'ultimos' | 'errores_impresion';
type ConfigUltimos = '15min' | '30min' | '1h' | '2h' | '6h';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,

    MatCardModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);

  private readonly CONFIG_ULTIMOS_KEY = 'dashboard-config-ultimos';
  private readonly CONFIG_TOP_KEY = 'dashboard-config-top';

  protected seccion = signal<Seccion>('no_vistos');

  protected configUltimos = signal<ConfigUltimos>(
    (localStorage.getItem(this.CONFIG_ULTIMOS_KEY) as ConfigUltimos) ?? '1h',
  );
  protected configTop = signal<number>(
    Number(localStorage.getItem(this.CONFIG_TOP_KEY) ?? '5'),
  );

  protected metricas = signal<Metricas | null>(null);
  protected pedidos = signal<Pedido[]>([]);
  protected erroresImpresion = signal<ErrorImpresion[]>([]);
  protected cargando = signal(true);
  protected ultimaActualizacion = signal<Date | null>(null);
  protected segundosDesde = signal(0);

  private tickSub: Subscription;
  private pollSub: Subscription;

  constructor() {
    // Tick every second to update "hace X segundos"
    this.tickSub = interval(1000).subscribe(() => {
      const ua = this.ultimaActualizacion();
      if (ua) {
        this.segundosDesde.set(Math.floor((Date.now() - ua.getTime()) / 1000));
      }
    });

    // Poll metricas + pedidos every 30 seconds
    this.pollSub = interval(30000).pipe(
      startWith(0),
      switchMap(() => {
        const hasta = new Date();
        const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
        return forkJoin({
          metricas: this.api.getMetricasHoy().pipe(catchError(() => of(null))),
          pedidos: this.api.getPedidos({
            desde: desde.toISOString(),
            hasta: hasta.toISOString(),
          }).pipe(catchError(() => of([] as Pedido[]))),
          errores: this.api.getErroresImpresion().pipe(catchError(() => of([] as ErrorImpresion[]))),
        });
      }),
    ).subscribe(({ metricas, pedidos, errores }) => {
      if (metricas) this.metricas.set(metricas);
      this.pedidos.set(pedidos ?? []);
      this.erroresImpresion.set(errores ?? []);
      this.ultimaActualizacion.set(new Date());
      this.segundosDesde.set(0);
      this.cargando.set(false);
    });
  }

  ngOnDestroy(): void {
    this.tickSub.unsubscribe();
    this.pollSub.unsubscribe();
  }

  protected totalPedidos = computed(() => this.metricas()?.total_pedidos ?? 0);
  protected noVistos = computed(() => this.metricas()?.pedidos_no_vistos ?? 0);
  protected recibidos = computed(() => this.metricas()?.por_estado?.['recibido'] ?? 0);
  protected enPreparacion = computed(() => this.metricas()?.por_estado?.['en_preparacion'] ?? 0);
  protected listos = computed(() => this.metricas()?.por_estado?.['listo'] ?? 0);
  protected entregados = computed(() => this.metricas()?.por_estado?.['entregado'] ?? 0);

  protected topProductos = computed(() =>
    (this.metricas()?.top_productos ?? []).slice(0, this.configTop()),
  );

  protected clientesRanking = computed(() => (this.metricas()?.clientes_ranking ?? []).slice(0, 5));

  protected configUltimosMinutos = computed(() => {
    switch (this.configUltimos()) {
      case '15min': return 15;
      case '30min': return 30;
      case '2h': return 120;
      case '6h': return 360;
      default: return 60; // '1h'
    }
  });

  protected pedidosNoVistos = computed(() =>
    this.pedidos().filter((p) => !p.visto).sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    ),
  );

  protected ultimosPedidos = computed(() => {
    const cutoff = new Date(Date.now() - this.configUltimosMinutos() * 60 * 1000);
    return [...this.pedidos()]
      .filter((p) => new Date(p.fecha) >= cutoff)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 15);
  });

  protected erroresCount = computed(() => this.erroresImpresion().length);

  protected readonly columnasTop = ['posicion', 'nombre', 'cantidad'];
  protected readonly columnasNoVistos = ['hora', 'cliente', 'items', 'total'];
  protected readonly columnasUltimos = ['hora', 'cliente', 'estado', 'total'];
  protected readonly columnasRanking = ['pos', 'nombre', 'pedidos', 'total'];
  protected readonly columnasErrores = ['pedido', 'fecha', 'cliente', 'error', 'resolver'];
  protected resolviendoIds = signal<Set<number>>(new Set());

  protected readonly opcionesUltimos: { value: ConfigUltimos; label: string }[] = [
    { value: '15min', label: '15 min' },
    { value: '30min', label: '30 min' },
    { value: '1h', label: '1 hora' },
    { value: '2h', label: '2 horas' },
    { value: '6h', label: '6 horas' },
  ];

  protected readonly opcionesTop = [3, 5, 10, 20];

  protected cambiarConfigUltimos(v: ConfigUltimos): void {
    this.configUltimos.set(v);
    localStorage.setItem(this.CONFIG_ULTIMOS_KEY, v);
  }

  protected cambiarConfigTop(v: number): void {
    this.configTop.set(Number(v));
    localStorage.setItem(this.CONFIG_TOP_KEY, String(v));
  }

  private buildLocalDT(d: Date): string {
    const dateStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
    const timeStr = [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
    ].join(':');
    return `${dateStr}T${timeStr}`;
  }

  protected navegarPedidosHoy(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: { desde: this.buildLocalDT(desde), hasta: this.buildLocalDT(hasta) },
    });
  }

  protected navegarNoVistos(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        no_vistos: 'true',
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
      },
    });
  }

  protected navegarEnPreparacion(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        estado: 'en_preparacion',
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
      },
    });
  }

  protected navegarEntregados(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        estado: 'entregado',
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
      },
    });
  }

  protected navegarUltimos(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - this.configUltimosMinutos() * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: { desde: this.buildLocalDT(desde), hasta: this.buildLocalDT(hasta) },
    });
  }

  protected navegarRecibidos(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        estado: 'recibido',
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
      },
    });
  }

  protected navegarListos(): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        estado: 'listo',
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
      },
    });
  }

  protected navegarErroresImpresion(): void {
    this.router.navigate(['/pedidos'], {
      queryParams: { errores_impresion: 'true' },
    });
  }

  protected resolver(pedidoId: number, event: Event): void {
    event.stopPropagation();
    this.resolviendoIds.update((s) => new Set(s).add(pedidoId));
    this.api.resolverErrorImpresion(pedidoId).subscribe({
      next: () => {
        this.erroresImpresion.update((list) => list.filter((e) => e.pedido_id !== pedidoId));
        this.resolviendoIds.update((s) => { const n = new Set(s); n.delete(pedidoId); return n; });
      },
      error: () => {
        this.resolviendoIds.update((s) => { const n = new Set(s); n.delete(pedidoId); return n; });
      },
    });
  }

  protected navegarAPedido(pedido: { id: number }, extras: Record<string, string | number | boolean> = {}): void {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
        abrir_pedido_id: pedido.id,
        no_vistos: 'false',
        errores_impresion: 'false',
        ...extras,
      },
    });
  }

  protected navegarAErrorImpresion(row: { pedido_id: number; fecha_pedido: string }): void {
    const fecha = new Date(row.fecha_pedido);
    const desde = new Date(fecha);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(fecha);
    hasta.setHours(23, 59, 59, 999);
    this.router.navigate(['/pedidos'], {
      queryParams: {
        desde: this.buildLocalDT(desde),
        hasta: this.buildLocalDT(hasta),
        abrir_pedido_id: row.pedido_id,
        errores_impresion: 'true',
        no_vistos: 'false',
      },
    });
  }

  protected navegarSeccionActual(): void {
    switch (this.seccion()) {
      case 'no_vistos': return this.navegarNoVistos();
      case 'ultimos': return this.navegarUltimos();
      case 'top_productos': return this.navegarPedidosHoy();
      case 'errores_impresion': return this.navegarErroresImpresion();
    }
  }

  protected resumenItems(items: Pedido['items']): string {
    const visibles = items.slice(0, 2).map((i) => {
      const nombre = i.producto?.nombre ?? i.producto_raw ?? '—';
      return `${nombre} x${parseFloat(i.cantidad)}`;
    });
    return visibles.join(', ') + (items.length > 2 ? '…' : '');
  }
}
