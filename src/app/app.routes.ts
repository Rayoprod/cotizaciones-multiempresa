import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { SelectorEmpresaComponent } from './components/selector-empresa/selector-empresa';
import { CotizadorComponent } from './components/cotizador/cotizador';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'login', component: LoginComponent },
  { path: 'selector', component: SelectorEmpresaComponent },
  { path: 'cotizador', component: CotizadorComponent },
  { path: '**', redirectTo: '' }
];