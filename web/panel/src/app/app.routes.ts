import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { LoginComponent } from './components/login/login';
import { ShellComponent } from './components/shell/shell';
import { DashboardComponent } from './components/dashboard/dashboard';
import { PedidosComponent } from './components/pedidos/pedidos';
import { ProductosComponent } from './components/productos/productos';
import { ClientesComponent } from './components/clientes/clientes';
import { UsuariosComponent } from './components/usuarios/usuarios';
import { CategoriasComponent } from './components/categorias/categorias';
import { UnidadesComponent } from './components/unidades/unidades';
import { EstadisticasComponent } from './components/estadisticas/estadisticas';
import { ListasPrecioComponent } from './components/listas-precio/listas-precio';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'pedidos', component: PedidosComponent },
      { path: 'productos', component: ProductosComponent },
      { path: 'clientes', component: ClientesComponent },
      { path: 'listas-precios', component: ListasPrecioComponent },
      { path: 'listas-precios/:clienteId', component: ListasPrecioComponent },
      { path: 'estadisticas', component: EstadisticasComponent },
      {
        path: 'usuarios',
        component: UsuariosComponent,
        canActivate: [authGuard, adminGuard],
      },
      {
        path: 'categorias',
        component: CategoriasComponent,
        canActivate: [authGuard, adminGuard],
      },
      {
        path: 'unidades',
        component: UnidadesComponent,
        canActivate: [authGuard, adminGuard],
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
