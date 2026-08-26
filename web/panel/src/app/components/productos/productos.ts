import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Categoria, Producto, Unidad } from '../../models';
import { ApiService } from '../../services/api.service';
import { ProductoDialogComponent } from './producto-dialog';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-productos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TitleCasePipe,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatCheckboxModule,
  ],
  templateUrl: './productos.html',
  styleUrl: './productos.scss',
})
export class ProductosComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private host = inject(ElementRef);

  private sort = viewChild(MatSort);
  private paginator = viewChild(MatPaginator);

  protected dataSource = new MatTableDataSource<Producto>([]);
  protected categorias = signal<Categoria[]>([]);
  protected unidades = signal<Unidad[]>([]);
  protected cargando = signal(true);
  protected categoriaFiltro = signal<string>('todas');
  protected mostrarInactivos = signal(false);

  // Import / Export CSV de precios base
  protected exportando = signal(false);
  protected importando = signal(false);

  protected buscarCtrl = new FormControl('');

  protected categoriaOpciones = computed(() => {
    const nombres = this.dataSource.data
      .map((p) => p.categoria?.nombre ?? null)
      .filter((n): n is string => n !== null);
    return ['todas', ...Array.from(new Set(nombres)).sort()];
  });

  protected readonly columnas = ['nombre', 'categoria', 'unidad', 'precios', 'activo', 'acciones'];

  constructor() {
    this.dataSource.filterPredicate = (row: Producto, filter: string) => {
      const parts = filter.split('|');
      const q = parts[0] ?? '';
      const cat = parts[1] ?? 'todas';
      const showInactivos = parts[2] === 'true';
      const textMatch = row.nombre.toLowerCase().includes(q);
      const catMatch = cat === 'todas' || row.categoria?.nombre === cat;
      const activoMatch = showInactivos || row.activo;
      return textMatch && catMatch && activoMatch;
    };

    this.buscarCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(() => this.aplicarFiltro());

    effect(() => { const p = this.paginator(); if (p) this.dataSource.paginator = p; });
    effect(() => { const s = this.sort(); if (s) this.dataSource.sort = s; });

    this.cargar();

    afterEveryRender({
      mixedReadWrite: () => {
        const cells: NodeListOf<HTMLElement> =
          this.host.nativeElement.querySelectorAll('.precios-cell');
        cells.forEach((cell) => {
          cell.classList.toggle('has-overflow', cell.scrollWidth > cell.clientWidth);
        });
      },
    });
  }

  private aplicarFiltro(): void {
    const q = (this.buscarCtrl.value ?? '').toLowerCase().trim();
    const cat = this.categoriaFiltro();
    const inactivos = this.mostrarInactivos();
    this.dataSource.filter = `${q}|${cat}|${inactivos}`;
  }

  protected onCategoriaChange(cat: string): void {
    this.categoriaFiltro.set(cat);
    this.aplicarFiltro();
  }

  protected onMostrarInactivosChange(checked: boolean): void {
    this.mostrarInactivos.set(checked);
    this.aplicarFiltro();
  }

  protected toggleActivo(producto: Producto, checked: boolean): void {
    this.api.updateProducto(producto.id, { activo: checked }).subscribe({
      next: (updated) => {
        this.dataSource.data = this.dataSource.data.map((p) => (p.id === updated.id ? updated : p));
        this.aplicarFiltro();
      },
    });
  }

  protected eliminarProducto(id: number, event: Event): void {
    event.stopPropagation();
    if (!confirm('¿Estás seguro de que querés eliminar este producto?')) return;
    this.api.deleteProducto(id).subscribe({
      next: (resp) => {
        this.snack.open(resp.message, '', { duration: 5000 });
        this.cargar();
      },
      error: () => this.snack.open('Error al eliminar el producto', '', { duration: 3000 }),
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    forkJoin({
      productos: this.api.getProductos(null, null, true),
      categorias: this.api.getCategorias(),
      unidades: this.api.getUnidades(),
    }).subscribe({
      next: ({ productos, categorias, unidades }) => {
        this.dataSource.data = productos;
        this.categorias.set(categorias);
        this.unidades.set(unidades);
        this.aplicarFiltro();
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  protected abrirNuevo(): void {
    this.dialog
      .open(ProductoDialogComponent, {
        data: { producto: null, productos: this.dataSource.data, categorias: this.categorias(), unidades: this.unidades() },
        width: '560px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected abrirEditar(producto: Producto): void {
    this.dialog
      .open(ProductoDialogComponent, {
        data: { producto, productos: this.dataSource.data, categorias: this.categorias(), unidades: this.unidades() },
        width: '560px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected formatPrecio(valor: string | null): string {
    if (!valor) return '—';
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(parseFloat(valor));
  }

  // ── Import / Export CSV de precios base ───────────────

  protected exportar(): void {
    if (this.exportando()) return;
    this.exportando.set(true);
    this.api.exportPreciosDefault().subscribe({
      next: (resp) => {
        const url = URL.createObjectURL(resp.body ?? new Blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = 'precios_base.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.exportando.set(false);
      },
      error: () => {
        this.exportando.set(false);
        this.snack.open('No se pudieron exportar los precios', 'Cerrar', { duration: 4000 });
      },
    });
  }

  protected onArchivoImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const contenido = String(reader.result ?? '');
      this.importando.set(true);
      this.api.importPreciosDefault(contenido).subscribe({
        next: (r) => {
          this.importando.set(false);
          this.snack.open(
            `Importado: ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.eliminados} eliminados, ${r.sin_cambios} sin cambios`,
            '',
            { duration: 5000 },
          );
          this.cargar();
        },
        error: (err) => {
          this.importando.set(false);
          const errores: string[] | undefined = err?.error?.errores;
          const mensaje: string = err?.error?.error ?? 'Error al importar el archivo';
          if (errores?.length) {
            alert(`${mensaje}:\n\n` + errores.join('\n'));
          } else {
            this.snack.open(mensaje, 'Cerrar', { duration: 5000 });
          }
        },
      });
    };
    reader.onerror = () => this.snack.open('No se pudo leer el archivo', 'Cerrar', { duration: 4000 });
    reader.readAsText(file);
  }
}
