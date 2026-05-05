import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DrawerModule } from 'primeng/drawer';
import { DividerModule } from 'primeng/divider';

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
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    AvatarModule,
    DrawerModule,
    DividerModule
  ],
  templateUrl: './admin-layout.html'
})
export class AdminLayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  sidebarAbierto = false;
  usuarioNombre = '';

  readonly navItems: NavItem[] = [
    { label: 'Empresas', icon: 'pi pi-building', path: '/admin/empresas' },
    { label: 'Usuarios', icon: 'pi pi-user-edit', path: '/admin/usuarios' }
  ];

  constructor() {
    this.auth.obtenerSesion().then(res => {
      const user = res?.data?.session?.user;
      this.usuarioNombre = user?.email ?? 'Admin';
    });

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.sidebarAbierto = false;
      });
  }

  toggleSidebar() {
    this.sidebarAbierto = !this.sidebarAbierto;
  }

  cerrarMenu() {
    this.sidebarAbierto = false;
  }

  operarEmpresa() {
    this.cerrarMenu();
    this.router.navigate(['/admin/selector']);
  }

  logout() {
    this.auth.logout();
  }
}