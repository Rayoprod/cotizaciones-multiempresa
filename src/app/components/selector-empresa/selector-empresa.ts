import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';

@Component({
  selector: 'app-selector-empresa',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './selector-empresa.html',
  styleUrl: './selector-empresa.scss'
})
export class SelectorEmpresaComponent {
  
  // Lista estrictamente limitada a VDC y W&M
  empresas = [
    { 
      id: 1, 
      nombre: 'Virgen del Carmen', 
      alias: 'VDC',
      logo: 'pi pi-shield', 
      color: '#1e40af' // Azul corporativo
    },
    { 
      id: 2, 
      nombre: 'W&M', 
      alias: 'WM',
      logo: 'pi pi-building', 
      color: '#166534' // Verde corporativo
    }
  ];

  constructor(private router: Router) {}

  seleccionar(empresa: any) {
    // 1. Guardamos la configuración de la empresa en el almacenamiento local
    localStorage.setItem('empresa_activa', JSON.stringify(empresa));
    
    console.log('Empresa seleccionada para sesión:', empresa.nombre);
    
    // 2. NAVEGACIÓN REAL: Aquí es donde la app cambia de pantalla
    this.router.navigate(['/cotizador']);
  }
}