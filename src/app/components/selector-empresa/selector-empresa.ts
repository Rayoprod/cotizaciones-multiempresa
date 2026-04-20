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

  // Datos corporativos reales con URLs de Supabase
  empresas = [
    {
      id: 'WM',
      nombre: 'W&M E.I.R.L.',
      razonSocial: 'W&M E.I.R.L.', // Usamos el nombre comercial ya que en BD era null
      ruc: '20608657364',
      color: '#2563eb', // Azul
      bgClass: 'bg-blue-50',
      borderHover: 'hover:border-blue-500',
      textClass: 'text-blue-800',
      icon: 'pi pi-bolt',
      direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
      telefonos: '959098427 - 914828235',
      correo: 'wymvdc1509@gmail.com',
      logoUrl: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logowym.png',
      rutaFirma: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/FIRMA_WANTUIL.jpeg'
    },
    {
      id: 'VDC',
      nombre: 'ELECTROFERR. VIRGEN DEL CARMEN',
      razonSocial: 'MITMA TORRES MARIA LUZ',
      ruc: '10215770635',
      color: '#1e40af', // Azul oscuro corporativo
      bgClass: 'bg-indigo-50',
      borderHover: 'hover:border-indigo-500',
      textClass: 'text-indigo-800',
      icon: 'pi pi-star-fill',
      direccion: 'CALLE LOS SAUCES MZA. 20 LOTE 1A\nCHALA - CARAVELI - AREQUIPA',
      telefonos: '959098427 - 914828235',
      correo: 'wymvdc1509@gmail.com',
      logoUrl: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/logovdc.jpeg',
      rutaFirma: 'https://rgnebklwuxpuuzappavx.supabase.co/storage/v1/object/public/recursos/FIRMA_MARIALUZ.png'
    }
  ];

  constructor(private router: Router) {}

  ngOnInit() {
    this.usuarioActivo = localStorage.getItem('usuario_conectado') || 'Administrador';
    // Extraemos la parte antes del @ para el saludo (Ej: irene@... -> irene)
    this.nombreUsuario = this.usuarioActivo.split('@')[0];
  }

  seleccionar(empresa: any) {
    // Guardamos el paquete completo de la empresa seleccionada.
    // Esto es el "combustible" que usará el PDF Service para no tener que consultar la BD de nuevo.
    localStorage.setItem('empresa_activa', JSON.stringify({
      nombre: empresa.nombre,
      razonSocial: empresa.razonSocial,
      ruc: empresa.ruc,
      color: empresa.color,
      logo: empresa.icon,
      rutaLogo: empresa.logoUrl,
      rutaFirma: empresa.rutaFirma,
      direccion: empresa.direccion,
      telefonos: empresa.telefonos,
      correo: empresa.correo
    }));
    
    // Viajamos al cotizador
    this.router.navigate(['/cotizador']);
  }
}