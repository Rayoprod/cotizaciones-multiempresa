import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule],
  templateUrl: './selector-empresa.html'
})
export class SelectorComponent implements OnInit {
  
  usuarioActivo: string = '';
  nombreUsuario: string = '';

  // Definimos las empresas con sus estilos corporativos
  empresas = [
    {
      id: 'WM',
      nombre: 'W&M',
      razonSocial: 'Electro Ferretero W&M E.I.R.L.',
      ruc: '20608657364',
      color: '#1e40af', // Azul oscuro elegante
      bgClass: 'bg-blue-50',
      borderHover: 'hover:border-blue-500',
      textClass: 'text-blue-800',
      icon: 'pi pi-bolt'
    },
    {
      id: 'VDC',
      nombre: 'VDC',
      razonSocial: 'Virgen del Carmen (Mitma Torres)',
      ruc: '10215770635',
      color: '#c2410c', // Naranja/Óxido elegante
      bgClass: 'bg-orange-50',
      borderHover: 'hover:border-orange-500',
      textClass: 'text-orange-800',
      icon: 'pi pi-star-fill'
    }
  ];

  constructor(private router: Router) {}

  ngOnInit() {
    this.usuarioActivo = localStorage.getItem('usuario_conectado') || 'Administrador';
    // Si es un correo, extraemos la primera parte para un saludo amigable (ej: ryan@admin.com -> ryan)
    this.nombreUsuario = this.usuarioActivo.split('@')[0];
  }

  seleccionar(empresa: any) {
    // Guardamos la elección con los datos necesarios para el cotizador
    localStorage.setItem('empresa_activa', JSON.stringify({
      nombre: empresa.nombre,
      color: empresa.color,
      logo: empresa.icon
    }));
    
    // Viaje al cotizador
    this.router.navigate(['/cotizador']);
  }
}