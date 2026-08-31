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
import { catchError, interval, of, startWith, Subscription, switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { NodoIot, LecturaAmbiental } from '../../models';
import { Chart } from '../../utils/chartjs';

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
          this.seleccionarNodo(nodos[0].codigo);
        }
      });

    effect(() => {
      const nodo = this.nodoActual();
      if (nodo) this.umbralForm.set(nodo.umbral_alerta);
    });

    effect(() => {
      const datos = this.lecturas();
      const canvas = this.canvasSerie()?.nativeElement;
      if (!canvas) return;

      this.chart?.destroy();
      this.chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: datos.map((l) =>
            new Date(l.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          ),
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: datos.map((l) => l.temperatura),
              borderColor: '#e65100',
              backgroundColor: 'rgba(230,81,0,0.08)',
              tension: 0.3,
              yAxisID: 'y',
            },
            {
              label: 'Humedad (%)',
              data: datos.map((l) => l.humedad),
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
            y: { type: 'linear', position: 'left' },
            y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
          },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.pollSub.unsubscribe();
    this.chart?.destroy();
  }

  protected seleccionarNodo(codigo: string): void {
    this.nodoSeleccionado.set(codigo);
    this.cargandoLecturas.set(true);
    this.api
      .getLecturasNodo(codigo)
      .pipe(catchError(() => of([] as LecturaAmbiental[])))
      .subscribe((lecturas) => {
        this.lecturas.set(lecturas);
        this.cargandoLecturas.set(false);
      });
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
