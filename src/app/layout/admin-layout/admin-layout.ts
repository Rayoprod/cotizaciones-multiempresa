import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';
import { AvatarModule } from 'primeng/avatar';
interface NavItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, AvatarModule
    
  ],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss'
})
export class AdminLayoutComponent {

  private auth   = inject(AuthService);
  private router = inject(Router);

  sidebarAbierto = signal(false);
  usuarioNombre  = signal<string>('');

  readonly navItems: NavItem[] = [
    { label: 'Empresas', icon: 'pi pi-building',  path: '/admin/empresas' },
    { label: 'Usuarios', icon: 'pi pi-user-edit', path: '/admin/usuarios' },
  ];

  constructor() {
    this.auth.obtenerSesion().then(res => {
      const user = res?.data?.session?.user;
      this.usuarioNombre.set(user?.email ?? 'Admin');
    });
  }

  toggleSidebar() { this.sidebarAbierto.update(v => !v); }
  cerrarMenu()    { this.sidebarAbierto.set(false); }
  operarEmpresa() { this.router.navigate(['/admin/selector']); }
  logout()        { this.auth.logout(); }
}