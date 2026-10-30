import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { SelectorComponent } from './components/selector-empresa/selector-empresa';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { adminGeneralGuard } from './guards/admin-general-guard';
import { initialRedirectGuard } from './guards/initial-redirect.guard';

export const routes: Routes = [

  // ── PÚBLICAS ──────────────────────────────────────
  { path: 'login', component: LoginComponent },

  // ── ELEGIR EMPRESA ────────────────────────────────
  {
    path: 'selector',
    component: SelectorComponent,
    canActivate: [authGuard]
  },

  // Direcciones del antiguo panel de administración (marcadores, PWA instalada)
  { path: 'admin', pathMatch: 'full', redirectTo: 'empresas' },
  { path: 'admin/empresas', redirectTo: 'empresas' },
  { path: 'admin/usuarios', redirectTo: 'usuarios' },
  { path: 'admin/selector', redirectTo: 'selector' },

  // ── APP: un solo layout para todos los roles ──────
  // El menú muestra la administración según el rol; los guards la protegen.
  {
    path: '',
    loadComponent: () =>
      import('./layout/layout.component')
        .then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      // Ruta vacía que redirige según el rol usando el guard
      { path: '', canActivate: [initialRedirectGuard], children: [] },
      {
        path: 'cotizador',
        loadComponent: () =>
          import('./components/cotizador/cotizador')
            .then(m => m.CotizadorComponent)
      },
      {
        path: 'historial',
        loadComponent: () =>
          import('./components/historial/historial')
            .then(m => m.HistorialComponent)
      },
      {
        path: 'ventas',
        loadComponent: () =>
          import('./components/ventas/ventas')
            .then(m => m.VentasComponent)
      },
      {
        path: 'por-cobrar',
        loadComponent: () =>
          import('./components/por-cobrar/por-cobrar')
            .then(m => m.PorCobrarComponent)
      },
      {
        path: 'productos',
        loadComponent: () =>
          import('./components/productos/productos')
            .then(m => m.ProductosComponent)
      },
      {
        path: 'clientes',
        loadComponent: () =>
          import('./components/clientes/clientes')
            .then(m => m.ClientesComponent)
      },
      {
        path: 'empresas',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./components/empresas/empresas')
            .then(m => m.EmpresasComponent)
      },
      {
        path: 'usuarios',
        canActivate: [adminGeneralGuard],
        loadComponent: () =>
          import('./components/usuarios/usuarios')
            .then(m => m.UsuariosComponent)
      }
    ]
  },

  { path: '**', redirectTo: 'login' }
];
