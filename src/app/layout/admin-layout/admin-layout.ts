import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss'
})
export class AdminLayoutComponent {

  private auth = inject(AuthService);
  sidebarAbierto = signal(false);

  readonly navItems: NavItem[] = [
    { label: 'Cotizador', icon: 'pi pi-calculator', path: '/admin/cotizador' },
    { label: 'Historial', icon: 'pi pi-clock',      path: '/admin/historial' },
    { label: 'Productos', icon: 'pi pi-box',         path: '/admin/productos' },
    { label: 'Clientes',  icon: 'pi pi-users',       path: '/admin/clientes'  },
    { label: 'Empresas',  icon: 'pi pi-building',    path: '/admin/empresas'  },
    { label: 'Usuarios',  icon: 'pi pi-user-edit',   path: '/admin/usuarios'  },
  ];

  usuarioNombre = signal<string>('');
usuarioRol    = signal<string>('');

constructor() {
  this.auth.obtenerSesion().then(res => {
    const user = res?.data?.session?.user;
    this.usuarioNombre.set(user?.user_metadata?.['nombre'] ?? user?.email ?? 'Admin');
    this.usuarioRol.set(user?.user_metadata?.['rol'] ?? 'admin');
  });
}

logout() { this.auth.logout(); }
}