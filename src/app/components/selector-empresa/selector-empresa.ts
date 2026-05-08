import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SupabaseService } from '../../services/supabase.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, ProgressSpinnerModule],
  templateUrl: './selector-empresa.html'
})
export class SelectorComponent implements OnInit {

  nombreUsuario: string = '';
  empresas: any[] = [];
  cargando: boolean = true;

  // Detecta si viene desde el panel admin para redirigir correctamente
  private vieneDeAdmin: boolean = false;

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {
    const url = this.router.url;
    this.vieneDeAdmin = url.includes('/admin/');
  }

  async ngOnInit() {
    const usuario = await this.supabaseSvc.obtenerUsuarioActual();
const email = usuario?.email || sessionStorage.getItem('usuario_email') || '';
    this.nombreUsuario = email.split('@')[0];

    try {
      this.empresas = await this.supabaseSvc.getEmpresasDelUsuario();

      // Si solo hay una empresa, la selecciona automáticamente
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
sessionStorage.setItem('empresa_activa', JSON.stringify(empresa));
    // Siempre navega al cotizador — tanto vendedor como admin operando
    this.router.navigate(['/cotizador']);
  }
}