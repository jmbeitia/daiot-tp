import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { TabTraficoComponent } from './tab-trafico/tab-trafico';
import { TabProductosComponent } from './tab-productos/tab-productos';
import { TabClientesComponent } from './tab-clientes/tab-clientes';

@Component({
  selector: 'app-estadisticas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, TabTraficoComponent, TabProductosComponent, TabClientesComponent],
  templateUrl: './estadisticas.html',
  styleUrl: './estadisticas.scss',
})
export class EstadisticasComponent {}
