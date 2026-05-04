import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SupabaseService } from '../../services/supabase.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, ProgressSpinnerModule

  ],
  templateUrl: './selector-empresa.html'
})
export class SelectorComponent implements OnInit {

  nombreUsuario: string = '';
  empresas: any[] = [];
  cargando: boolean = true;

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    // Obtenemos el email desde Supabase Auth directamente
    const usuario = await this.supabaseSvc.obtenerUsuarioActual();
    const email = usuario?.email || localStorage.getItem('usuario_email') || '';
    this.nombreUsuario = email.split('@')[0];

    try {
      // Solo trae las empresas asignadas a este usuario
      this.empresas = await this.supabaseSvc.getEmpresasDelUsuario();

      // Si solo tiene una empresa asignada, lo saltamos directo al cotizador
      if (this.empresas.length === 1) {
        this.seleccionar(this.empresas[0]);
        return;
      }
    } catch (error) {
      console.error('Error al cargar empresas:', error);
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  seleccionar(empresa: any) {
    localStorage.setItem('empresa_activa', JSON.stringify(empresa));
    this.router.navigate(['/cotizador']);
  }
}