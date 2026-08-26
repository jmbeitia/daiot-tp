import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Usuario } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface DialogData {
  usuario: Usuario | null;
}

@Component({
  selector: 'app-usuario-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './usuario-dialog.html',
})
export class UsuarioDialogComponent {
  protected data = inject<DialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<UsuarioDialogComponent>);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  protected guardando = signal(false);
  protected mostrarPassword = signal(false);
  protected tipoPassword = computed(() => this.mostrarPassword() ? 'text' : 'password');

  get esEdicion(): boolean {
    return this.data.usuario !== null;
  }

  get puedeEditarPassword(): boolean {
    if (!this.esEdicion) return true;
    return this.auth.getRol() === 'admin' || this.auth.getId() === this.data.usuario?.id;
  }

  protected form = this.fb.group({
    nombre: new FormControl(this.data.usuario?.nombre ?? '', Validators.required),
    email: new FormControl(this.data.usuario?.email ?? '', [Validators.required, Validators.email]),
    password: new FormControl('', this.esEdicion ? [] : [Validators.required, Validators.minLength(6)]),
    rol: new FormControl(this.data.usuario?.rol ?? 'readonly', Validators.required),
    activo: new FormControl(this.data.usuario?.activo ?? true),
  });

  protected guardar(): void {
    if (this.form.invalid) return;
    this.guardando.set(true);

    const { nombre, email, password, rol, activo } = this.form.value;

    const updateData: Parameters<ApiService['updateUsuario']>[1] = {
      nombre: nombre!,
      email: email!,
      rol: rol!,
      activo: activo ?? true,
    };
    if (this.puedeEditarPassword && password) updateData.password = password;

    const obs = this.esEdicion
      ? this.api.updateUsuario(this.data.usuario!.id, updateData)
      : this.api.createUsuario({
          nombre: nombre!,
          email: email!,
          password: password!,
          rol: rol!,
        });

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: () => this.guardando.set(false),
    });
  }

  protected cancelar(): void {
    this.dialogRef.close();
  }
}
