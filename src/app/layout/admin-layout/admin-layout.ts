import { Component, inject, HostListener, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DividerModule } from 'primeng/divider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuthService } from '../../services/auth';
import { SupabaseService } from '../../services/supabase.service';

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
    ButtonModule, AvatarModule, DividerModule, ProgressSpinnerModule
  ],
  templateUrl: './admin-layout.html'
})
export class AdminLayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private supabase = inject(SupabaseService);

  sidebarAbierto = false;
  usuarioNombre = '';
  esAdminGeneral = false;
  cargandoAdmin = signal(true);

  readonly navItems: NavItem[] = [
    { label: 'Empresas', icon: 'pi pi-building', path: '/admin/empresas' },
    { label: 'Usuarios', icon: 'pi pi-user-edit', path: '/admin/usuarios' }
  ];

  get navItemsFiltrados(): NavItem[] {
    if (this.esAdminGeneral) return this.navItems;
    return this.navItems.filter(item => item.path !== '/admin/usuarios');
  }

  constructor() {
    this.inicializarSesionConReintentos();

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.refrescarInfoSesion();
      this.cerrarMenu();
    });
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 768 && this.sidebarAbierto) {
      this.sidebarAbierto = false;
      this.cdr.detectChanges();
    }
  }

  toggleSidebar() {
    this.sidebarAbierto = !this.sidebarAbierto;
    this.cdr.detectChanges();
  }

  cerrarMenu() {
    this.sidebarAbierto = false;
    this.cdr.detectChanges();
  }

  operarEmpresa() {
    this.cerrarMenu();
    this.router.navigate(['/admin/selector']);
  }

  logout() {
    this.auth.logout();
  }

  private refrescarRol() {
    const rol = sessionStorage.getItem('usuario_rol');
    this.esAdminGeneral = rol === 'admin';
  }

  private refrescarInfoSesion() {
    this.refrescarRol();
    const email = sessionStorage.getItem('usuario_email');
    if (email) this.usuarioNombre = email;
    this.cdr.detectChanges();
  }

  private async inicializarSesionConReintentos() {
    const emailGuardado = sessionStorage.getItem('usuario_email');
    const rolGuardado = sessionStorage.getItem('usuario_rol');
    if (emailGuardado && rolGuardado) {
      this.usuarioNombre = emailGuardado;
      this.esAdminGeneral = rolGuardado === 'admin';
      this.cargandoAdmin.set(false);
      this.cdr.detectChanges();
      return;
    }

    let intentos = 0;
    const maxIntentos = 3;
    let email: string | null = null;
    let rol: string | null = null;

    while (intentos < maxIntentos && !email) {
      try {
        const sesion = await this.supabase.obtenerSesion();
        const user = sesion?.data?.session?.user;
        if (user?.email) {
          email = user.email;
          sessionStorage.setItem('usuario_email', email);
          const perfil = await this.supabase.obtenerPerfil();
          if (perfil?.rol) {
            rol = perfil.rol;
            sessionStorage.setItem('usuario_rol', rol);
            break;
          }
        }
      } catch (e) {
        // Reintentar
      }
      intentos++;
      if (intentos < maxIntentos) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    this.usuarioNombre = email || 'Admin';
    this.esAdminGeneral = (rol === 'admin');
    this.cargandoAdmin.set(false);
    this.cdr.detectChanges();
  }
}