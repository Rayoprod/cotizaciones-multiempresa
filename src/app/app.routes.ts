import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { SelectorComponent } from './components/selector-empresa/selector-empresa';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';

export const routes: Routes = [

  { path: 'login', component: LoginComponent },

  { path: 'selector', component: SelectorComponent, canActivate: [authGuard] },

  // ── Panel Admin ───────────────────────────────────
  {
    path: 'admin',
    loadComponent: () =>
      import('./layout/admin-layout/admin-layout')
        .then(m => m.AdminLayoutComponent),
    canActivate: [adminGuard],
    children: [
      { path: '', redirectTo: 'cotizador', pathMatch: 'full' },
      { path: 'cotizador', loadComponent: () => import('./components/cotizador/cotizador').then(m => m.CotizadorComponent) },
      { path: 'historial', loadComponent: () => import('./components/historial/historial').then(m => m.HistorialComponent) },
      { path: 'productos', loadComponent: () => import('./components/productos/productos').then(m => m.ProductosComponent) },
      { path: 'clientes',  loadComponent: () => import('./components/clientes/clientes').then(m => m.ClientesComponent)  },
      { path: 'empresas',  loadComponent: () => import('./components/empresas/empresas').then(m => m.EmpresasComponent)  },
      { path: 'usuarios',  loadComponent: () => import('./components/usuarios/usuarios').then(m => m.UsuariosComponent)  },
    ]
  },

  // ── Panel Vendedor ────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./layout/layout.component')
        .then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'cotizador', pathMatch: 'full' },
      { path: 'cotizador', loadComponent: () => import('./components/cotizador/cotizador').then(m => m.CotizadorComponent) },
      { path: 'historial', loadComponent: () => import('./components/historial/historial').then(m => m.HistorialComponent) },
      { path: 'productos', loadComponent: () => import('./components/productos/productos').then(m => m.ProductosComponent) },
      { path: 'clientes',  loadComponent: () => import('./components/clientes/clientes').then(m => m.ClientesComponent)  },
    ]
  },

  { path: '**', redirectTo: 'login' }
];