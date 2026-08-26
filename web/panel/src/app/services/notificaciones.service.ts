import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, interval, of, startWith, switchMap } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private api = inject(ApiService);

  private tick = interval(30000).pipe(startWith(0));

  private metricas = toSignal(
    this.tick.pipe(
      switchMap(() => this.api.getMetricasHoy().pipe(catchError(() => of(null)))),
    ),
    { initialValue: null },
  );

  private erroresData = toSignal(
    this.tick.pipe(
      switchMap(() => this.api.getErroresImpresion().pipe(catchError(() => of([])))),
    ),
    { initialValue: [] },
  );

  noVistos = computed(() => this.metricas()?.pedidos_no_vistos ?? 0);
  erroresImpresion = computed(() => this.erroresData().length);
  badgeTotal = computed(() => this.noVistos() + this.erroresImpresion());
}
