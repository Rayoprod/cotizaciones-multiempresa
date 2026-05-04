import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, AvatarModule],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  menuAbierto: boolean = false;
  usuarioActivo: string = '';
  empresaActiva: any;
  esAdmin: boolean = false;

  constructor(private router: Router, private supabaseSvc: SupabaseService) {}

  ngOnInit() {
    this.usuarioActivo = localStorage.getItem('usuario_email') || 'Usuario';
    this.esAdmin = localStorage.getItem('usuario_rol') === 'admin';
    const datosEmpresa = localStorage.getItem('empresa_activa');
    this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;
  }

  toggleMenu() { this.menuAbierto = !this.menuAbierto; }
  cerrarMenu()  { this.menuAbierto = false; }

  volverAlAdmin() {
    this.router.navigate(['/admin/empresas']);
  }

  async cerrarSesion() {
    await this.supabaseSvc.cerrarSesion();
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}