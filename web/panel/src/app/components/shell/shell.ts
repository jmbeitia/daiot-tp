import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter, map as rmap } from 'rxjs/operators';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';

import { AuthService } from '../../services/auth.service';
import { NotificacionesService } from '../../services/notificaciones.service';
import { PedidosEventService } from '../../services/pedidos-event.service';
import { CrearPedidoDialogComponent } from '../pedidos/crear-pedido-dialog';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: boolean;
  badgeErrores?: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent {
  protected auth = inject(AuthService);
  protected notif = inject(NotificacionesService);
  private breakpoints = inject(BreakpointObserver);
  private dialog = inject(MatDialog);
  private pedidosEvent = inject(PedidosEventService);
  private router = inject(Router);

  private ruta$ = this.router.events.pipe(
    filter((e) => e instanceof NavigationEnd),
    rmap((e) => (e as NavigationEnd).urlAfterRedirects),
  );
  protected enPedidos = toSignal(
    this.ruta$.pipe(rmap((url) => url.startsWith('/pedidos') || url.startsWith('/dashboard'))),
    { initialValue: false },
  );

  protected sidenav = viewChild.required<MatSidenav>('sidenav');

  private isMobile$ = this.breakpoints
    .observe(Breakpoints.Handset)
    .pipe(map((r) => r.matches));
  protected isMobile = toSignal(this.isMobile$, { initialValue: false });

  protected sidenavMode = computed(() => (this.isMobile() ? 'over' : 'side') as 'over' | 'side');
  protected sidenavOpened = computed(() => !this.isMobile());

  protected mainNavItems = computed<NavItem[]>(() => [
    { label: 'Resumen', icon: 'dashboard', route: '/dashboard', badgeErrores: true },
    { label: 'Pedidos', icon: 'receipt_long', route: '/pedidos', badge: true },
    { label: 'Productos', icon: 'inventory_2', route: '/productos' },
    { label: 'Clientes', icon: 'people', route: '/clientes' },
    { label: 'Listas de precios', icon: 'sell', route: '/listas-precios' },
    { label: 'Estadísticas', icon: 'bar_chart', route: '/estadisticas' },
    { label: 'Monitoreo ambiental', icon: 'thermostat', route: '/monitoreo' },
  ]);

  protected adminNavItems = computed<NavItem[]>(() => {
    if (this.auth.getRol() !== 'admin') return [];
    return [
      { label: 'Usuarios', icon: 'manage_accounts', route: '/usuarios' },
      { label: 'Categorías', icon: 'category', route: '/categorias' },
      { label: 'Unidades', icon: 'square_foot', route: '/unidades' },
    ];
  });

  protected isAdmin = computed(() => this.auth.getRol() === 'admin');

  protected badgeFor(item: NavItem): number | null {
    if (item.badgeErrores) {
      const total = this.notif.badgeTotal();
      return total > 0 ? total : null;
    }
    if (item.badge) {
      const n = this.notif.noVistos();
      return n > 0 ? n : null;
    }
    return null;
  }

  protected logout(): void {
    this.auth.logout();
  }

  protected closeSidenavIfMobile(): void {
    if (this.isMobile()) this.sidenav().close();
  }

  protected abrirCrearPedido(): void {
    this.dialog
      .open(CrearPedidoDialogComponent, { width: '560px', maxHeight: '90vh' })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) this.pedidosEvent.pedidoCreado$.next();
      });
  }
}
