import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-selector-empresa',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './selector-empresa.html'
})
export class SelectorEmpresaComponent {
  
  empresas = [
    { 
      nombre: 'W&M E.I.R.L.', 
      alias: 'W&M', 
      color: '#2f5e3e', 
      logo: 'pi pi-building',
      // PON LA URL DE SUPABASE AQUÍ
      rutaLogo: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logowym.png'
    },
    { 
      nombre: 'Virgen del Carmen', 
      alias: 'VDC', 
      color: '#1e40af', 
      logo: 'pi pi-shopping-cart',
      // PON LA URL DE SUPABASE AQUÍ (Si aún no hay logo de VDC, déjalo vacío '')
      rutaLogo: '' 
    }
  ];

  constructor(private router: Router) {}

  seleccionar(empresa: any) {
    localStorage.setItem('empresa_activa', JSON.stringify(empresa));
    this.router.navigate(['/cotizador']);
  }
}