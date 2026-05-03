import { Component, OnInit, ChangeDetectorRef } from '@angular/core'; // 1. Agregamos ChangeDetectorRef aquí
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SupabaseService } from '../../services/supabase.service'; // Asegúrate de tener esta ruta correcta

@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule],
  templateUrl: './selector-empresa.html'
})
export class SelectorComponent implements OnInit {
  
  usuarioActivo: string = '';
  nombreUsuario: string = '';
  empresas: any[] = []; // ¡Adiós datos quemados! Empezamos con una lista vacía.

  constructor(private router: Router, private supabaseSvc: SupabaseService,private cdr: ChangeDetectorRef) {}

  // Reemplaza tu ngOnInit por este mucho más limpio:
async ngOnInit() {
  this.usuarioActivo = localStorage.getItem('usuario_conectado') || 'Administrador';
  this.nombreUsuario = this.usuarioActivo.split('@')[0];

  try {
    // Descargamos las empresas y las usamos TAL CUAL vienen de la base de datos
    this.empresas = await this.supabaseSvc.getEmpresas();
    this.cdr.detectChanges(); 
  } catch (error) {
    console.error("Error al cargar las empresas", error);
  }
}

seleccionar(empresa: any) {
  // Guardamos el objeto original de la base de datos
  localStorage.setItem('empresa_activa', JSON.stringify(empresa));
  this.router.navigate(['/cotizador']);
}
} 