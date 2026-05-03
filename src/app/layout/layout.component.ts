import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// Importaciones estrictas de Ruteo
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar'; 

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule, AvatarModule],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  menuAbierto: boolean = false;
  usuarioActivo: string = '';
  
  // 👇 AQUÍ ESTÁ LA VARIABLE DECLARADA CORRECTAMENTE A NIVEL DE CLASE
  empresaActiva: any; 
  
  constructor(private router: Router) {}
  
  ngOnInit() {
    this.usuarioActivo = localStorage.getItem('usuario_conectado') || 'Usuario Desconocido';
    
    // Leemos la empresa que elegimos en el selector para mostrarla en el menú
    const datosEmpresa = localStorage.getItem('empresa_activa');
    this.empresaActiva = datosEmpresa ? JSON.parse(datosEmpresa) : null;
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