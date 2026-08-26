import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Cliente, ClienteConStats, Producto, Unidad } from '../../models';
import { ApiService } from '../../services/api.service';

interface DialogData {
  cliente: Cliente | ClienteConStats | null;
  productos: Producto[];
  unidades: Unidad[];
}

@Component({
  selector: 'app-cliente-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './cliente-dialog.html',
})
export class ClienteDialogComponent {
  protected data = inject<DialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ClienteDialogComponent>);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  protected esNuevo = this.data.cliente === null;
  protected guardando = signal(false);
  protected changed = signal(false);

  protected form = this.fb.group({
    nombre: new FormControl(this.data.cliente?.nombre ?? '', Validators.required),
    telefono: new FormControl(
      { value: this.data.cliente?.telefono ?? '', disabled: !this.esNuevo },
      [Validators.required],
    ),
    contact_id: new FormControl(this.data.cliente?.contact_id ?? ''),
    activo: new FormControl(this.data.cliente?.activo ?? true),
  });

  protected guardarDatos(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);
    const { nombre, telefono, contact_id, activo } = this.form.getRawValue();

    if (this.esNuevo) {
      this.api
        .createCliente({
          nombre: nombre!,
          telefono: telefono!,
          contact_id: contact_id || undefined,
        })
        .subscribe({
          next: () => this.dialogRef.close(true),
          error: () => this.guardando.set(false),
        });
    } else {
      this.api
        .updateCliente(this.data.cliente!.id, {
          nombre: nombre!,
          contact_id: contact_id || undefined,
          activo: activo ?? true,
        })
        .subscribe({
          next: () => { this.guardando.set(false); this.changed.set(true); },
          error: () => this.guardando.set(false),
        });
    }
  }

  protected gestionarPrecios(): void {
    this.dialogRef.close(this.changed() ? true : null);
    this.router.navigate(['/listas-precios', this.data.cliente!.id]);
  }

  protected verHistorial(): void {
    this.dialogRef.close({ action: 'historial', clienteId: this.data.cliente!.id, clienteNombre: this.data.cliente!.nombre });
  }

  protected cerrar(): void {
    this.dialogRef.close(this.changed() ? true : null);
  }
}
