import { Component, OnInit, HostListener, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DividerModule } from 'primeng/divider';

import { SupabaseService } from '../services/supabase.service';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';

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

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService,
    private session: SessionContextService, // ✅ nuevo
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.cerrarMenu());
  }

  // ✅ Todo desde signals — sin propiedades locales duplicadas
  get usuarioActivo(): string {
    return this.session.usuario()?.email ?? 'Usuario';
  }

  get empresaActiva() {
    return this.session.empresaActiva();
  }

  get esAdmin(): boolean {
    return this.session.esAdminEmpresa(); // admin o admin_empresa
  }

  get esAdminGeneral(): boolean {
    return this.session.esAdmin(); // solo admin
  }

  get esAdminEmpresa(): boolean {
    return this.session.usuario()?.rol === 'admin_empresa';
  }

  async ngOnInit() {
    await this.inicializarSesion();
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 768 && this.menuAbierto) {
      this.menuAbierto = false;
      this.cdr.markForCheck();
    }
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
    this.cdr.markForCheck();
  }

  cerrarMenu() {
    this.menuAbierto = false;
    this.cdr.markForCheck();
  }

  volverAlAdmin() {
    this.cerrarMenu();
    this.router.navigate(['/admin/empresas']);
  }

  // ✅ Abre modal de edición de la empresa activa (para admin_empresa)
  configurarEmpresa() {
  this.cerrarMenu();
  this.router.navigate(['/admin/empresas']);
}

  async cerrarSesion() {
    await this.auth.logout(); // ✅ ya llama session.clearAll() internamente
  }

  private async inicializarSesion() {
    // Si ya hay usuario y empresa en el service, solo notifica a Angular
    if (!this.session.usuario()) {
      // Fallback: reconstruir si se recargó la página
      let intentos = 0;
      while (intentos < 3) {
        try {
          const sesion = await this.supabaseSvc.obtenerSesion();
          const user = sesion?.data?.session?.user;
          if (user?.email) {
            const perfil = await this.supabaseSvc.obtenerPerfil();
            if (perfil?.rol) {
              this.session.setUsuario({
                id: user.id,
                email: user.email,
                rol: perfil.rol,
                activo: true
              });
              break;
            }
          }
        } catch { /* reintentar */ }

        intentos++;
        if (intentos < 3) await new Promise(r => setTimeout(r, 800));
      }
    }

    // Si la empresa activa aún es null, intentar cargarla del usuario
    if (!this.session.empresaActiva() && this.session.usuario()) {
      try {
        const empresas = await this.supabaseSvc.getEmpresasDelUsuario();
        if (empresas && empresas.length > 0) {
          this.session.setEmpresas(empresas);
          this.session.setEmpresaActiva(empresas[0]);
        }
      } catch (e) {
        console.error('Error al auto-seleccionar empresa activa:', e);
      }
    }

    this.cdr.markForCheck();
  }
}