import { Component, inject, HostListener, ChangeDetectorRef, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DividerModule } from 'primeng/divider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../../services/auth';
import { SupabaseService } from '../../services/supabase.service';
import { SessionContextService } from '../../services/session-context.service';
import { PwaUpdateService } from '../../services/pwa-update.service';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, RouterLinkActive,
    ButtonModule, AvatarModule, DividerModule, ProgressSpinnerModule,
    TagModule, TooltipModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.html'
})
export class AdminLayoutComponent {
  private auth       = inject(AuthService);
  private router     = inject(Router);
  private cdr        = inject(ChangeDetectorRef);
  private supabase   = inject(SupabaseService);
  private session    = inject(SessionContextService);
  private destroyRef = inject(DestroyRef);
  public pwaUpdate   = inject(PwaUpdateService);

  sidebarAbierto = false;
  cargandoAdmin  = true;

  readonly navItems: NavItem[] = [
    { label: 'Empresas', icon: 'pi pi-building',   path: '/admin/empresas' },
    { label: 'Usuarios', icon: 'pi pi-user-edit',  path: '/admin/usuarios' }
  ];

  // ✅ Solo admin general ve "Usuarios"
  get navItemsFiltrados(): NavItem[] {
    return this.session.esAdmin()
      ? this.navItems
      : this.navItems.filter(i => i.path !== '/admin/usuarios');
  }

  // ✅ Datos del usuario desde signals — sin sessionStorage
  get usuarioNombre(): string {
    return this.session.usuario()?.email ?? 'Admin';
  }

  get esAdminGeneral(): boolean {
    return this.session.esAdmin();
  }

  get tituloPagina(): string {
    const url = this.router.url;
    if (url.includes('/admin/empresas')) return 'Gestión de Empresas Corporativas';
    if (url.includes('/admin/usuarios')) return 'Gestión de Usuarios y Permisos';
    if (url.includes('/admin/selector')) return 'Selector General de Operación';
    return 'Panel de Administración';
  }

  constructor() {
    this.inicializarSesion();

    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.cerrarMenu());
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 768 && this.sidebarAbierto) {
      this.sidebarAbierto = false;
      this.cdr.markForCheck();
    }
  }

  toggleSidebar() {
    this.sidebarAbierto = !this.sidebarAbierto;
    this.cdr.markForCheck();
  }

  cerrarMenu() {
    this.sidebarAbierto = false;
    this.cdr.markForCheck();
  }

  operarEmpresa() {
    this.cerrarMenu();
    if (this.session.tieneEmpresa()) {
      this.router.navigate(['/cotizador']);
    } else {
      this.router.navigate(['/admin/selector']);
    }
  }

  async instalarPwa() {
    await this.pwaUpdate.promptInstallPwa();
    this.cdr.markForCheck();
  }

  reloadPwaApp() {
    this.pwaUpdate.reloadApp();
  }

  logout() {
    this.auth.logout();
  }

  // ✅ Si ya hay sesión en el service, no necesita reintentar
  private async inicializarSesion() {
    if (this.session.usuario()) {
      this.cargandoAdmin = false;
      this.cdr.markForCheck();
      return;
    }

    // Fallback: reconstruir sesión si se recargó la página
    let intentos = 0;
    while (intentos < 3) {
      try {
        const sesion = await this.supabase.obtenerSesion();
        const user = sesion?.data?.session?.user;
        if (user?.email) {
          const perfil = await this.supabase.obtenerPerfil();
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

    this.cargandoAdmin = false;
    this.cdr.markForCheck();
  }
}