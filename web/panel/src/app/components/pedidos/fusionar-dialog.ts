import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { DatePipe } from '@angular/common';
import { Pedido, ClienteResumen } from '../../models';
import { ApiService } from '../../services/api.service';

interface DialogData {
  pedidos: Pedido[];
}

@Component({
  selector: 'app-fusionar-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './fusionar-dialog.html',
})
export class FusionarDialogComponent {
  protected data = inject<DialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<FusionarDialogComponent>);
  private api = inject(ApiService);

  protected clienteSeleccionadoId = signal<number | null>(
    this.data.pedidos[0]?.cliente?.id ?? null,
  );
  protected guardando = signal(false);

  protected clientesUnicos = (): ClienteResumen[] => {
    const map = new Map<number, ClienteResumen>();
    for (const p of this.data.pedidos) {
      if (p.cliente) map.set(p.cliente.id, p.cliente);
    }
    return Array.from(map.values());
  };

  protected fusionar(): void {
    const clienteId = this.clienteSeleccionadoId();
    if (!clienteId) return;
    this.guardando.set(true);
    const ids = this.data.pedidos.map((p) => p.id);
    this.api.fusionarPedidos(ids, clienteId).subscribe({
      next: () => this.dialogRef.close(true),
      error: () => this.guardando.set(false),
    });
  }

  protected cancelar(): void {
    this.dialogRef.close();
  }
}
