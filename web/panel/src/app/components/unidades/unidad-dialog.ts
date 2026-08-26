import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Unidad } from '../../models';
import { ApiService } from '../../services/api.service';

interface DialogData {
  unidad: Unidad | null;
}

@Component({
  selector: 'app-unidad-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './unidad-dialog.html',
})
export class UnidadDialogComponent {
  protected data = inject<DialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<UnidadDialogComponent>);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  protected guardando = signal(false);
  protected errorMsg = signal<string | null>(null);

  get esEdicion(): boolean {
    return this.data.unidad !== null;
  }

  protected form = this.fb.group({
    nombre: new FormControl(this.data.unidad?.nombre ?? '', Validators.required),
    abreviacion: new FormControl(this.data.unidad?.abreviacion ?? ''),
  });

  protected guardar(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);
    this.errorMsg.set(null);

    const { nombre, abreviacion } = this.form.value;
    const payload = { nombre: nombre!, abreviacion: abreviacion || undefined };

    const obs = this.esEdicion
      ? this.api.updateUnidad(this.data.unidad!.id, payload)
      : this.api.createUnidad(payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.guardando.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Error al guardar la unidad');
      },
    });
  }

  protected cancelar(): void {
    this.dialogRef.close();
  }
}
