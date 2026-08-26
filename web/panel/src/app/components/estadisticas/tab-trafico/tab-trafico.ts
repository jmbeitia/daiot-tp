import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, Subscription, switchMap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

import { ApiService } from '../../../services/api.service';
import { TraficoPorHora } from '../../../models';
import { Periodo, Modo, periodoLabel } from '../../../utils/chartjs';

interface DiaItem { dow: number; label: string; esHoy: boolean }

const NOMBRES_DIA: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb',
};

@Component({
  selector: 'app-tab-trafico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatCardModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './tab-trafico.html',
  styleUrl: './tab-trafico.scss',
})
export class TabTraficoComponent implements OnDestroy {
  private api = inject(ApiService);

  protected periodo = signal<Periodo>(90);
  protected modo    = signal<Modo>('promedio');

  protected cargando = signal(true);
  protected error    = signal(false);
  protected datos    = signal<TraficoPorHora[]>([]);

  private hoy = new Date().getDay();
  protected diaSeleccionado = signal(this.hoy);
  protected hoveredHora     = signal<number | null>(null);

  protected periodoDesc = computed(() => periodoLabel(this.periodo()));

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

  protected readonly dias: DiaItem[] = [1, 2, 3, 4, 5, 6, 0].map(dow => ({
    dow, label: NOMBRES_DIA[dow], esHoy: dow === this.hoy,
  }));

  protected horasDelDia = computed(() => {
    const dow = this.diaSeleccionado();
    return Array.from({ length: 24 }, (_, hora) => {
      const e = this.datos().find(d => d.dow === dow && d.hora === hora);
      return { hora, total: e?.total ?? 0, promedio: e?.promedio ?? 0 };
    });
  });

  protected valor(h: { total: number; promedio: number }): number {
    return this.modo() === 'promedio' ? h.promedio : h.total;
  }

  protected maxValor = computed(() =>
    Math.max(...this.horasDelDia().map(h => this.valor(h)), 1),
  );

  protected resumenDelDia = computed(() =>
    this.fmt(this.horasDelDia().reduce((acc, h) => acc + this.valor(h), 0)),
  );

  protected horaPico = computed(() => {
    const max = this.maxValor();
    const pico = this.horasDelDia().find(h => this.valor(h) === max && max > 0);
    return pico ? `${String(pico.hora).padStart(2, '0')}:00` : '—';
  });

  protected alturaBarPct(h: { total: number; promedio: number }): string {
    return `${Math.round((this.valor(h) / this.maxValor()) * 100)}%`;
  }

  protected fmt(v: number): string {
    if (v === 0) return '0';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  protected hayDatos = computed(() => this.maxValor() > 0);

  protected seleccionarDia(dow: number): void {
    this.diaSeleccionado.set(dow);
    this.hoveredHora.set(null);
  }

  private sub: Subscription;

  constructor() {
    this.sub = toObservable(this.periodo)
      .pipe(
        switchMap(dias => {
          this.cargando.set(true);
          this.error.set(false);
          return this.api.getTraficoPedidos(dias).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe(resp => {
        if (resp) this.datos.set(resp.por_dia_hora);
        else this.error.set(true);
        this.cargando.set(false);
      });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }
}
