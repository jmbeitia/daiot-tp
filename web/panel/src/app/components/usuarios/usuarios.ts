import {
  ChangeDetectionStrategy,
  Component,
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
import { Usuario } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { UsuarioDialogComponent } from './usuario-dialog';

@Component({
  selector: 'app-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TitleCasePipe,
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
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class UsuariosComponent {
  private api = inject(ApiService);
  protected auth = inject(AuthService);
  private dialog = inject(MatDialog);

  private sort = viewChild(MatSort);
  private paginator = viewChild(MatPaginator);

  protected dataSource = new MatTableDataSource<Usuario>([]);
  protected cargando = signal(true);

  protected buscarCtrl = new FormControl('');

  protected readonly columnas = ['nombre', 'email', 'rol', 'activo'];

  constructor() {
    this.dataSource.filterPredicate = (row: Usuario, filter: string) =>
      row.nombre.toLowerCase().includes(filter) || row.email.toLowerCase().includes(filter);

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
    this.api.getUsuarios().subscribe({
      next: (data) => { this.dataSource.data = data; this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  protected abrirNuevo(): void {
    this.dialog
      .open(UsuarioDialogComponent, { data: { usuario: null }, width: '440px' })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }

  protected abrirEditar(usuario: Usuario): void {
    this.dialog
      .open(UsuarioDialogComponent, { data: { usuario }, width: '440px' })
      .afterClosed()
      .subscribe((changed) => { if (changed) this.cargar(); });
  }
}
