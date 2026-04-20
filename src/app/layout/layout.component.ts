import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// ✅ Importaciones estrictas de Ruteo para que no haya pantallas blancas
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar'; 

@Component({
  selector: 'app-layout',
  standalone: true,
  // ✅ Agregamos RouterLink, RouterOutlet y RouterLinkActive
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, AvatarModule],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  menuAbierto: boolean = false;
  usuarioActivo: string = '';
  
  constructor(private router: Router) {}
  
  ngOnInit() {
    this.usuarioActivo = localStorage.getItem('usuario_conectado') || 'Usuario Desconocido';
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu() {
    this.menuAbierto = false;
  }

  cerrarSesion() {
    localStorage.removeItem('usuario_conectado');
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}