import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClienteConStats, Producto, Unidad } from '../../models';
import { ApiService } from '../../services/api.service';
import { ClienteDialogComponent } from './cliente-dialog';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-clientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss',
})
export class ClientesComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  private sort = viewChild(MatSort);
  private paginator = viewChild(MatPaginator);

  protected dataSource = new MatTableDataSource<ClienteConStats>([]);
  protected productos = signal<Producto[]>([]);
  protected unidades = signal<Unidad[]>([]);
  protected cargando = signal(true);

  protected buscarCtrl = new FormControl('');

  protected readonly columnas = ['nombre', 'telefono', 'total_pedidos', 'suma_total', 'ultimo_pedido', 'activo'];

  constructor() {
    effect(() => { const p = this.paginator(); if (p) this.dataSource.paginator = p; });
    effect(() => { const s = this.sort(); if (s) this.dataSource.sort = s; });

    this.dataSource.filterPredicate = (row: ClienteConStats, filter: string) => {
      return (
        row.nombre.toLowerCase().includes(filter) ||
        row.telefono.includes(filter)
      );
    };

    this.buscarCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe((v) => {
      this.dataSource.filter = (v ?? '').toLowerCase().trim();
    });

    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    forkJoin({
      clientes: this.api.getClientes(),
      productos: this.api.getProductos(),
      unidades: this.api.getUnidades(),
    }).subscribe({
      next: ({ clientes, productos, unidades }) => {
        this.dataSource.data = clientes.data;
        this.productos.set(productos);
        this.unidades.set(unidades);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  protected abrirNuevo(): void {
    this.dialog
      .open(ClienteDialogComponent, {
        data: { cliente: null, productos: this.productos(), unidades: this.unidades() },
        width: '640px',
        maxHeight: '90vh',
      })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected abrirEditar(cliente: ClienteConStats): void {
    this.dialog
      .open(ClienteDialogComponent, {
        data: { cliente, productos: this.productos(), unidades: this.unidades() },
        width: '640px',
        maxHeight: '90vh',
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        if (result === true) {
          this.cargar();
        } else if (result?.action === 'historial') {
          this.router.navigate(['/pedidos'], {
            queryParams: { cliente_id: result.clienteId, cliente_nombre: result.clienteNombre },
          });
        }
      });
  }
}
