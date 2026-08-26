import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Unidad } from '../../models';
import { ApiService } from '../../services/api.service';
import { UnidadDialogComponent } from './unidad-dialog';

@Component({
  selector: 'app-unidades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    MatSnackBarModule,
  ],
  templateUrl: './unidades.html',
  styleUrl: './unidades.scss',
})
export class UnidadesComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  private sort = viewChild(MatSort);
  private paginator = viewChild(MatPaginator);

  protected dataSource = new MatTableDataSource<Unidad>([]);
  protected cargando = signal(true);
  protected eliminando = signal<number | null>(null);

  protected buscarCtrl = new FormControl('');

  protected readonly columnas = ['nombre', 'abreviacion', 'accion'];

  constructor() {
    this.dataSource.filterPredicate = (row: Unidad, filter: string) =>
      row.nombre.toLowerCase().includes(filter) ||
      (row.abreviacion ?? '').toLowerCase().includes(filter);

    this.buscarCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe((v) => {
      this.dataSource.filter = (v ?? '').toLowerCase().trim();
    });

    effect(() => { const p = this.paginator(); if (p) this.dataSource.paginator = p; });
    effect(() => { const s = this.sort(); if (s) this.dataSource.sort = s; });

    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.getUnidades().subscribe({
      next: (unidades) => {
        this.dataSource.data = unidades;
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  protected abrirNueva(): void {
    this.dialog
      .open(UnidadDialogComponent, { data: { unidad: null }, width: '400px' })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected abrirEditar(unidad: Unidad): void {
    this.dialog
      .open(UnidadDialogComponent, { data: { unidad }, width: '400px' })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected eliminar(unidad: Unidad): void {
    if (!confirm(`¿Eliminar la unidad "${unidad.nombre}"?`)) return;
    this.eliminando.set(unidad.id);
    this.api.deleteUnidad(unidad.id).subscribe({
      next: () => {
        this.snack.open(`"${unidad.nombre}" eliminada`, '', { duration: 2500 });
        this.eliminando.set(null);
        this.cargar();
      },
      error: (err) => {
        const msg =
          err?.error?.error ??
          err?.error?.message ??
          'Error al eliminar la unidad';
        this.snack.open(msg, 'Cerrar', { duration: 5000 });
        this.eliminando.set(null);
      },
    });
  }
}
