import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { SelectorComponent } from './components/selector-empresa/selector-empresa';
import { CotizadorComponent } from './components/cotizador/cotizador';
import { LayoutComponent } from './layout/layout.component';
import { HistorialComponent } from './components/historial/historial';

// Importamos a nuestro guardián
import { authGuard } from './guards/auth-guard'; 
import { ProductosComponent } from './components/productos/productos';
import { ClientesComponent } from './components/clientes/clientes';

export const routes: Routes = [
  // RUTAS PÚBLICAS (Sin candado)
  { path: 'login', component: LoginComponent },
  { path: 'selector', component: SelectorComponent },
  
  // EL SISTEMA (Rutas Privadas)
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard], // 🔒 AQUÍ ESTÁ EL CANDADO MAESTRO
    children: [
      { path: '', redirectTo: 'cotizador', pathMatch: 'full' },
      { path: 'cotizador', component: CotizadorComponent },
      { path: 'historial', component: HistorialComponent },
      { path: 'productos', component: ProductosComponent},
      { path: 'clientes', component: ClientesComponent},
    ]
  },

  { path: '**', redirectTo: 'selector' } 
];