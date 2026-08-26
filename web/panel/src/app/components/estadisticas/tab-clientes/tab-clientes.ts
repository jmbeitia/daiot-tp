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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  catchError, combineLatest, debounceTime, distinctUntilChanged,
  filter, of, Subscription, switchMap,
} from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

import { ApiService } from '../../../services/api.service';
import { ClienteConStats, ClienteMetricas } from '../../../models';
import {
  Chart, Periodo, periodoLabel,
  fillDias, fillSemanas, fillMeses,
  formatDia, formatSemana, formatMes,
} from '../../../utils/chartjs';

@Component({
  selector: 'app-tab-clientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './tab-clientes.html',
  styleUrl: './tab-clientes.scss',
})
export class TabClientesComponent implements OnDestroy {
  private api = inject(ApiService);

  protected periodo = signal<Periodo>(90);

  protected readonly periodos: { value: Periodo; label: string }[] = [
    { value: 7,   label: '1 semana' },
    { value: 30,  label: '1 mes' },
    { value: 90,  label: '3 meses' },
    { value: 365, label: '1 año' },
  ];

  protected periodoDesc = computed(() => periodoLabel(this.periodo()));

  protected busqueda  = new FormControl('');
  protected clientes  = signal<ClienteConStats[]>([]);
  protected clienteSeleccionado = signal<ClienteConStats | null>(null);
  protected metricas  = signal<ClienteMetricas | null>(null);
  protected cargandoMetricas = signal(false);

  protected canvasTop     = viewChild<ElementRef<HTMLCanvasElement>>('canvasTop');
  protected canvasMensual = viewChild<ElementRef<HTMLCanvasElement>>('canvasMensual');

  private chartTop?:     Chart;
  private chartMensual?: Chart;

  protected displayFn = (c: ClienteConStats | null) => c?.nombre ?? '';

  constructor() {
    effect(() => {
      const m      = this.metricas();
      const canvas = this.canvasTop()?.nativeElement;
      if (!m || !canvas || !m.top_productos.length) return;
      this.chartTop?.destroy();
      this.chartTop = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: m.top_productos.map(p => p.nombre),
          datasets: [{
            label: 'Gasto ($)',
            data: m.top_productos.map(p => p.total),
            backgroundColor: '#e65100',
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` $${(ctx.raw as number).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`,
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { callback: v => `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` },
            },
          },
        },
      });
    });

    effect(() => {
      const m      = this.metricas();
      const canvas = this.canvasMensual()?.nativeElement;
      if (!m || !canvas || !m.gasto_mensual.length) return;
      const periodo = this.periodo();
      const gran = m.granularidad;

      let datos: { mes: string; total: number }[];
      let labelFn: (s: string) => string;

      if (gran === 'dia') {
        datos   = fillDias(m.gasto_mensual, periodo);
        labelFn = formatDia;
      } else if (gran === 'semana') {
        datos   = fillSemanas(m.gasto_mensual, Math.ceil(periodo / 7));
        labelFn = formatSemana;
      } else {
        datos   = fillMeses(m.gasto_mensual, periodo);
        labelFn = formatMes;
      }

      this.chartMensual?.destroy();
      this.chartMensual = new Chart(canvas, {
        type: 'line',
        data: {
          labels: datos.map(d => labelFn(d.mes)),
          datasets: [{
            label: 'Gasto ($)',
            data: datos.map(d => d.total),
            borderColor: '#2e7d32',
            backgroundColor: 'rgba(46,125,50,0.08)',
            pointBackgroundColor: '#2e7d32',
            tension: 0.3,
            fill: true,
            pointRadius: datos.length <= 7 ? 5 : datos.length <= 12 ? 4 : 3,
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

    this.sub = new Subscription();

    this.sub.add(this.busqueda.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      filter(v => typeof v === 'string' && (v as string).length >= 2),
      switchMap(v =>
        this.api.getClientes(v as string).pipe(catchError(() => of({ data: [], total: 0 }))),
      ),
    ).subscribe(resp => this.clientes.set(resp.data.slice(0, 10))));

    this.sub.add(combineLatest([
      toObservable(this.clienteSeleccionado),
      toObservable(this.periodo),
    ]).pipe(
      filter(([cliente]) => cliente !== null),
      switchMap(([cliente, dias]) => {
        this.cargandoMetricas.set(true);
        this.metricas.set(null);
        return this.api.getClienteMetricas(cliente!.id, dias).pipe(catchError(() => of(null)));
      }),
    ).subscribe(m => {
      if (m) this.metricas.set(m);
      this.cargandoMetricas.set(false);
    }));
  }

  private sub: Subscription;

  protected onClienteSelected(ev: MatAutocompleteSelectedEvent): void {
    this.clienteSeleccionado.set(ev.option.value as ClienteConStats);
  }

  protected fmtPeso(v: number): string {
    return v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.chartTop?.destroy();
    this.chartMensual?.destroy();
  }
}
