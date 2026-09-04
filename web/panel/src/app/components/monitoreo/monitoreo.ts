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
import { DatePipe } from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, interval, of, startWith, Subscription, switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { NodoIot, LecturaAmbiental } from '../../models';
import { Chart } from '../../utils/chartjs';

type RangoTiempo = '1h' | '6h' | '12h' | '24h';

const HORAS_POR_RANGO: Record<RangoTiempo, number> = {
  '1h': 1,
  '6h': 6,
  '12h': 12,
  '24h': 24,
};

@Component({
  selector: 'app-monitoreo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './monitoreo.html',
  styleUrl: './monitoreo.scss',
})
export class MonitoreoComponent implements OnDestroy {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  protected auth = inject(AuthService);

  protected nodos = signal<NodoIot[]>([]);
  protected cargandoNodos = signal(true);
  protected nodoSeleccionado = signal<string | null>(null);
  protected lecturas = signal<LecturaAmbiental[]>([]);
  protected cargandoLecturas = signal(false);
  protected umbralForm = signal<number | null>(null);
  protected guardandoUmbral = signal(false);

  protected rango = signal<RangoTiempo>('1h');
  protected readonly rangos: { value: RangoTiempo; label: string }[] = [
    { value: '1h', label: 'Última hora' },
    { value: '6h', label: 'Últimas 6 horas' },
    { value: '12h', label: 'Últimas 12 horas' },
    { value: '24h', label: 'Último día' },
  ];

  protected puedeEditar = computed(() => this.auth.getRol() !== 'readonly');

  protected nodoActual = computed(() =>
    this.nodos().find((n) => n.codigo === this.nodoSeleccionado()) ?? null,
  );

  protected ultimaLectura = computed<LecturaAmbiental | null>(
    () => this.nodoActual()?.lecturas?.[0] ?? null,
  );

  private canvasSerie = viewChild<ElementRef<HTMLCanvasElement>>('canvasSerie');
  private chart?: Chart;
  private pollSub: Subscription;
  private lecturasSub: Subscription;

  constructor() {
    this.pollSub = interval(15000)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getNodosIot().pipe(catchError(() => of([] as NodoIot[])))),
      )
      .subscribe((nodos) => {
        this.nodos.set(nodos);
        this.cargandoNodos.set(false);
        if (!this.nodoSeleccionado() && nodos.length) {
          this.nodoSeleccionado.set(nodos[0].codigo);
        }
      });

    effect(() => {
      const nodo = this.nodoActual();
      if (nodo) this.umbralForm.set(nodo.umbral_alerta);
    });

    // Recarga las lecturas del nodo/rango elegido, y las refresca cada 30s
    // (rolling window: la ventana "desde/hasta" se recalcula en cada tick).
    const nodo$ = toObservable(this.nodoSeleccionado);
    const rango$ = toObservable(this.rango);
    const tick$ = interval(30000).pipe(startWith(0));

    this.lecturasSub = combineLatest([nodo$, rango$]).pipe(
      switchMap(([codigo, rango]) => {
        if (!codigo) return of([] as LecturaAmbiental[]);
        this.cargandoLecturas.set(true);
        return tick$.pipe(
          switchMap(() => {
            const { desde, hasta } = this.calcularRango(rango);
            return this.api
              .getLecturasNodo(codigo, desde, hasta)
              .pipe(catchError(() => of([] as LecturaAmbiental[])));
          }),
        );
      }),
    ).subscribe((lecturas) => {
      this.lecturas.set(lecturas);
      this.cargandoLecturas.set(false);
    });

    effect(() => {
      const datos = this.lecturas();
      const canvas = this.canvasSerie()?.nativeElement;
      if (!canvas) return;

      this.chart?.destroy();
      this.chart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: datos.map((l) => ({ x: new Date(l.ts).getTime(), y: l.temperatura })),
              borderColor: '#e65100',
              backgroundColor: 'rgba(230,81,0,0.08)',
              tension: 0.3,
              yAxisID: 'y',
            },
            {
              label: 'Humedad (%)',
              data: datos.map((l) => ({ x: new Date(l.ts).getTime(), y: l.humedad })),
              borderColor: '#1565c0',
              backgroundColor: 'rgba(21,101,192,0.08)',
              tension: 0.3,
              yAxisID: 'y1',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'time',
              time: { tooltipFormat: 'dd/MM HH:mm:ss' },
              ticks: { autoSkip: true, maxRotation: 0 },
            },
            y: { type: 'linear', position: 'left' },
            y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
          },
          plugins: {
            zoom: {
              pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                drag: { enabled: true, backgroundColor: 'rgba(230,81,0,0.15)' },
                mode: 'x',
              },
              limits: { x: { min: 'original', max: 'original' } },
            },
          },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.pollSub.unsubscribe();
    this.lecturasSub.unsubscribe();
    this.chart?.destroy();
  }

  private calcularRango(rango: RangoTiempo): { desde: string; hasta: string } {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - HORAS_POR_RANGO[rango] * 60 * 60 * 1000);
    return { desde: desde.toISOString(), hasta: hasta.toISOString() };
  }

  protected seleccionarNodo(codigo: string): void {
    this.nodoSeleccionado.set(codigo);
  }

  protected cambiarRango(rango: RangoTiempo): void {
    this.rango.set(rango);
  }

  protected resetZoom(): void {
    this.chart?.resetZoom();
  }

  protected cambiarUmbralForm(valor: string): void {
    const n = Number(valor);
    this.umbralForm.set(Number.isNaN(n) ? null : n);
  }

  protected guardarUmbral(): void {
    const codigo = this.nodoSeleccionado();
    const valor = this.umbralForm();
    if (!codigo || valor == null) return;

    this.guardandoUmbral.set(true);
    this.api.actualizarUmbralNodo(codigo, valor).subscribe({
      next: (nodo) => {
        this.nodos.update((list) =>
          list.map((n) => (n.codigo === codigo ? { ...n, umbral_alerta: nodo.umbral_alerta } : n)),
        );
        this.guardandoUmbral.set(false);
        this.snack.open('Umbral actualizado y enviado al nodo', '', { duration: 2500 });
      },
      error: () => {
        this.guardandoUmbral.set(false);
        this.snack.open('No se pudo actualizar el umbral', 'Cerrar', { duration: 4000 });
      },
    });
  }
}
