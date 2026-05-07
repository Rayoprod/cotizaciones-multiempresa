import { Component, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DividerModule } from 'primeng/divider';

import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterLink, RouterLinkActive, RouterOutlet,
    ButtonModule, AvatarModule, DividerModule,
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
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.usuarioActivo = sessionStorage.getItem('usuario_email') || localStorage.getItem('usuario_email') || 'Usuario';
    const rol = sessionStorage.getItem('usuario_rol') || localStorage.getItem('usuario_rol');
    this.esAdmin = rol === 'admin' || rol === 'admin_empresa';
    const datosEmpresa = sessionStorage.getItem('empresa_activa') || localStorage.getItem('empresa_activa');
    this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.cerrarMenu();
    });
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 768 && this.menuAbierto) {
      this.menuAbierto = false;
      this.cdr.detectChanges();
    }
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
    this.cdr.detectChanges();
  }

  cerrarMenu() {
    this.menuAbierto = false;
    this.cdr.detectChanges();
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