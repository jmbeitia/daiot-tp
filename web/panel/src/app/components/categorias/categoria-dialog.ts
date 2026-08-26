import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Categoria } from '../../models';
import { ApiService } from '../../services/api.service';

interface DialogData {
  categoria: Categoria | null;
}

@Component({
  selector: 'app-categoria-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './categoria-dialog.html',
})
export class CategoriaDialogComponent {
  protected data = inject<DialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<CategoriaDialogComponent>);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  protected guardando = signal(false);

  get esEdicion(): boolean {
    return this.data.categoria !== null;
  }

  protected form = this.fb.group({
    nombre: new FormControl(this.data.categoria?.nombre ?? '', Validators.required),
    descripcion: new FormControl(this.data.categoria?.descripcion ?? ''),
  });

  protected guardar(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);

    const { nombre, descripcion } = this.form.value;
    const payload = { nombre: nombre!, descripcion: descripcion || undefined };

    const obs = this.esEdicion
      ? this.api.updateCategoria(this.data.categoria!.id, payload)
      : this.api.createCategoria(payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: () => this.guardando.set(false),
    });
  }

  protected cancelar(): void {
    this.dialogRef.close();
  }
}
