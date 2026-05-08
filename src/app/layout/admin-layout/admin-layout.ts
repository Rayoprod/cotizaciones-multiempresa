import { Component, inject, HostListener, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DividerModule } from 'primeng/divider';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuthService } from '../../services/auth';

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
    this.auth.obtenerSesion().then(res => {
      const user = res?.data?.session?.user;
      this.usuarioNombre = user?.email ?? 'Admin';
      this.refrescarRol();
      this.cdr.detectChanges();
    });

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      this.refrescarInfoSesion();
      this.cerrarMenu();
    });

    // Pequeño retardo para que el router outlet cargue y luego ocultar spinner
    setTimeout(() => {
      this.cargandoAdmin.set(false);
      this.cdr.detectChanges();
    }, 400);
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
}