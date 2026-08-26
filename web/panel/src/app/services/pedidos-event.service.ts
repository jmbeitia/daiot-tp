import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PedidosEventService {
  pedidoCreado$ = new Subject<void>();
}
