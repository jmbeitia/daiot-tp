import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { forkJoin } from 'rxjs';
import { Categoria, Producto } from '../../models';
import { ApiService } from '../../services/api.service';
import { CategoriaDialogComponent } from './categoria-dialog';

@Component({
  selector: 'app-categorias',
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
  templateUrl: './categorias.html',
  styleUrl: './categorias.scss',
})
export class CategoriasComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  private sort = viewChild(MatSort);
  private paginator = viewChild(MatPaginator);

  protected dataSource = new MatTableDataSource<Categoria>([]);
  protected productos = signal<Producto[]>([]);
  protected cargando = signal(true);

  protected buscarCtrl = new FormControl('');

  /** Set of category IDs that have at least one active product */
  protected catConProductosActivos = computed<Set<number>>(() => {
    const set = new Set<number>();
    for (const p of this.productos()) {
      if (p.activo && p.categoria_id != null) set.add(p.categoria_id);
    }
    return set;
  });

  protected readonly columnas = ['nombre', 'descripcion', 'activo', 'accion'];

  constructor() {
    this.dataSource.filterPredicate = (row: Categoria, filter: string) =>
      row.nombre.toLowerCase().includes(filter);

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
    forkJoin({
      categorias: this.api.getCategorias(),
      productos: this.api.getProductos(),
    }).subscribe({
      next: ({ categorias, productos }) => {
        this.dataSource.data = categorias;
        this.productos.set(productos);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  protected abrirNueva(): void {
    this.dialog
      .open(CategoriaDialogComponent, { data: { categoria: null }, width: '400px' })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected abrirEditar(categoria: Categoria): void {
    this.dialog
      .open(CategoriaDialogComponent, { data: { categoria }, width: '400px' })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected toggleActivo(categoria: Categoria): void {
    if (categoria.activo && this.catConProductosActivos().has(categoria.id)) {
      this.snack.open('No se puede desactivar: la categoría tiene productos activos', 'Cerrar', { duration: 4000 });
      return;
    }
    const nuevoValor = !categoria.activo;
    this.api.updateCategoria(categoria.id, { activo: nuevoValor }).subscribe({
      next: () => {
        this.snack.open(
          nuevoValor ? `"${categoria.nombre}" activada` : `"${categoria.nombre}" desactivada`,
          '',
          { duration: 2500 },
        );
        this.cargar();
      },
      error: () => this.snack.open('Error al actualizar la categoría', 'Cerrar', { duration: 4000 }),
    });
  }
}
