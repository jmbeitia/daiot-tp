import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, Subscription, switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';

import { ApiService } from '../../../services/api.service';
import { CategoriaDistribucion, Producto } from '../../../models';
import {
  Chart, PALETTE, Periodo, Modo, periodoLabel,
  fillDias, fillSemanas, fillMeses,
  formatDia, formatSemana, formatMes,
} from '../../../utils/chartjs';

@Component({
  selector: 'app-tab-productos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule],
  templateUrl: './tab-productos.html',
  styleUrl: './tab-productos.scss',
})
export class TabProductosComponent implements OnDestroy {
  private api = inject(ApiService);

  protected periodo = signal<Periodo>(90);
  protected modo    = signal<Modo>('promedio');

  protected readonly periodos: { value: Periodo; label: string }[] = [
    { value: 7,   label: '1 semana' },
    { value: 30,  label: '1 mes' },
    { value: 90,  label: '3 meses' },
    { value: 365, label: '1 año' },
  ];

  protected readonly modos: { value: Modo; label: string }[] = [
    { value: 'promedio',    label: 'Promedio' },
    { value: 'acumulativo', label: 'Acumulativo' },
  ];

  protected cargandoDona  = signal(true);
  protected cargandoLinea = signal(true);
  protected distribucion  = signal<CategoriaDistribucion[]>([]);
  protected tiempoDatos        = signal<{ mes: string; total: number }[]>([]);
  protected lineaGranularidad  = signal<'dia' | 'semana' | 'mes'>('mes');
  protected productos     = signal<Producto[]>([]);
  protected productoId    = signal<number | null>(null);

  protected periodoDesc = computed(() => periodoLabel(this.periodo()));

  protected canvasDona  = viewChild<ElementRef<HTMLCanvasElement>>('canvasDona');
  protected canvasLinea = viewChild<ElementRef<HTMLCanvasElement>>('canvasLinea');

  private chartDona?:  Chart;
  private chartLinea?: Chart;

  constructor() {
    effect(() => {
      const datos = this.distribucion();
      const canvas = this.canvasDona()?.nativeElement;
      if (!canvas || !datos.length) return;
      this.chartDona?.destroy();
      this.chartDona = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: datos.map(d => d.categoria),
          datasets: [{
            data: datos.map(d => d.total),
            backgroundColor: PALETTE,
            borderWidth: 2,
            borderColor: 'var(--mat-sys-surface, #fff)',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { font: { size: 12 }, boxWidth: 14 } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const d = datos[ctx.dataIndex];
                  return ` ${d.categoria}: $${(ctx.raw as number).toLocaleString('es-AR', { maximumFractionDigits: 0 })} (${d.porcentaje}%)`;
                },
              },
            },
          },
        },
      });
    });

    effect(() => {
      const raw    = this.tiempoDatos();
      const gran   = this.lineaGranularidad();
      const modo   = this.modo();
      const periodo = this.periodo();
      const canvas = this.canvasLinea()?.nativeElement;
      if (!canvas) return;

      let datos: { mes: string; total: number }[];
      let labelFn: (s: string) => string;

      if (gran === 'dia') {
        datos   = fillDias(raw, periodo);
        labelFn = formatDia;
      } else if (gran === 'semana') {
        datos   = fillSemanas(raw, Math.ceil(periodo / 7));
        labelFn = formatSemana;
      } else {
        datos   = fillMeses(raw, periodo);
        labelFn = formatMes;
      }

      // Promedio = valor por día; para diario ya es por día, semana÷7, mes÷días
      const chartData = modo === 'promedio' ? datos.map(d => {
        if (gran === 'dia')    return d;
        if (gran === 'semana') return { ...d, total: d.total / 7 };
        const [y, m] = d.mes.split('-').map(Number);
        return { ...d, total: d.total / new Date(y, m, 0).getDate() };
      }) : datos;

      this.chartLinea?.destroy();
      this.chartLinea = new Chart(canvas, {
        type: 'line',
        data: {
          labels: chartData.map(d => labelFn(d.mes)),
          datasets: [{
            label: modo === 'promedio' ? 'Facturación prom./día ($)' : 'Facturación total ($)',
            data: chartData.map(d => d.total),
            borderColor: '#e65100',
            backgroundColor: 'rgba(230,81,0,0.08)',
            pointBackgroundColor: '#e65100',
            tension: 0.3,
            fill: true,
            pointRadius: chartData.length <= 7 ? 5 : chartData.length <= 13 ? 4 : 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxRotation: 0, autoSkip: true } },
            y: {
              beginAtZero: true,
              ticks: { callback: v => `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` },
            },
          },
        },
      });
    });

    const periodo$   = toObservable(this.periodo);
    const productoId$ = toObservable(this.productoId);

    this.sub = new Subscription();

    this.sub.add(periodo$.pipe(
      switchMap(dias => {
        this.cargandoDona.set(true);
        return this.api.getCategoriasDistribucion(dias).pipe(catchError(() => of(null)));
      }),
    ).subscribe(r => {
      if (r) this.distribucion.set(r.datos);
      this.cargandoDona.set(false);
    }));

    this.sub.add(combineLatest([periodo$, productoId$]).pipe(
      switchMap(([dias, productoId]) => {
        this.cargandoLinea.set(true);
        return this.api.getProductosTiempo({
          dias,
          ...(productoId != null && { producto_id: productoId }),
        }).pipe(catchError(() => of(null)));
      }),
    ).subscribe(r => {
      if (r) {
        this.lineaGranularidad.set(r.granularidad);
        this.tiempoDatos.set(r.datos);
      }
      this.cargandoLinea.set(false);
    }));

    this.sub.add(
      this.api.getProductos().pipe(catchError(() => of([] as Producto[])))
        .subscribe(ps => this.productos.set(ps)),
    );
  }

  private sub: Subscription;

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.chartDona?.destroy();
    this.chartLinea?.destroy();
  }
}
