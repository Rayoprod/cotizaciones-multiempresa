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

  async ngOnInit() {
    await this.inicializarSesion();

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.refrescarInfoSesion();
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

  private refrescarInfoSesion() {
    this.usuarioActivo = sessionStorage.getItem('usuario_email') || 'Usuario';
    const rol = sessionStorage.getItem('usuario_rol');
    this.esAdmin = rol === 'admin' || rol === 'admin_empresa';
    const datosEmpresa = sessionStorage.getItem('empresa_activa');
    this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;
    this.cdr.detectChanges();
  }

  private async inicializarSesion() {
    // Si ya hay datos en sessionStorage, los usamos directamente
    const emailGuardado = sessionStorage.getItem('usuario_email');
    const rolGuardado = sessionStorage.getItem('usuario_rol');
    if (emailGuardado && rolGuardado) {
      this.usuarioActivo = emailGuardado;
      this.esAdmin = rolGuardado === 'admin' || rolGuardado === 'admin_empresa';
      const datosEmpresa = sessionStorage.getItem('empresa_activa');
      this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;
      this.cdr.detectChanges();
      return;
    }

    // Reintentar hasta obtener sesión y perfil (máx 3 intentos, 800ms entre ellos)
    let intentos = 0;
    const maxIntentos = 3;
    let perfil: any = null;
    let email: string | null = null;

    while (intentos < maxIntentos && !email) {
      try {
        const sesion = await this.supabaseSvc.obtenerSesion();
        const user = sesion?.data?.session?.user;
        if (user?.email) {
          email = user.email;
          sessionStorage.setItem('usuario_email', email);
          // Obtener perfil
          perfil = await this.supabaseSvc.obtenerPerfil();
          if (perfil?.rol) {
            sessionStorage.setItem('usuario_rol', perfil.rol);
            break;
          }
        }
      } catch (e) {
        // Silencioso, reintentar
      }
      intentos++;
      if (intentos < maxIntentos) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    if (email) {
      this.usuarioActivo = email;
      const rol = perfil?.rol || 'vendedor';
      this.esAdmin = rol === 'admin' || rol === 'admin_empresa';
      if (!sessionStorage.getItem('usuario_rol')) {
        sessionStorage.setItem('usuario_rol', rol);
      }
    } else {
      this.usuarioActivo = 'Usuario';
      this.esAdmin = false;
    }

    const datosEmpresa = sessionStorage.getItem('empresa_activa');
    this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;
    this.cdr.detectChanges();
  }
}