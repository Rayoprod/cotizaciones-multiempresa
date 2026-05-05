import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DrawerModule } from 'primeng/drawer';
import { DividerModule } from 'primeng/divider';

import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ButtonModule,
    AvatarModule,
    DrawerModule,
    DividerModule
  ],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  menuAbierto = false;
  usuarioActivo = '';
  empresaActiva: any = null;
  esAdmin = false;

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService
  ) {}

  ngOnInit() {
    this.usuarioActivo =
      sessionStorage.getItem('usuario_email') ||
      localStorage.getItem('usuario_email') ||
      'Usuario';

    this.esAdmin =
      (sessionStorage.getItem('usuario_rol') ||
        localStorage.getItem('usuario_rol')) === 'admin';

    const datosEmpresa =
      sessionStorage.getItem('empresa_activa') ||
      localStorage.getItem('empresa_activa');

    this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.menuAbierto = false;
      });
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu() {
    this.menuAbierto = false;
  }

  volverAlAdmin() {
    this.cerrarMenu();
    this.router.navigate(['/admin/empresas']);
  }

  async cerrarSesion() {
    await this.supabaseSvc.cerrarSesion();
    sessionStorage.clear();
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}