import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SupabaseService } from '../../services/supabase.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SessionContextService } from '../../services/session-context.service';

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

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef,
    private session: SessionContextService
  ) {}

  async ngOnInit() {
    const usuario = await this.supabaseSvc.obtenerUsuarioActual();
    const email = this.session.usuario()?.email || usuario?.email || '';
    this.nombreUsuario = email.split('@')[0];

    try {
      this.empresas = await this.supabaseSvc.getEmpresasDelUsuario();

      if (this.empresas.length === 1) {
        this.seleccionar(this.empresas[0]);
        return;
      }
    } catch (error) {
      console.error('Error al cargar empresas:', error);
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  seleccionar(empresa: any) {
    this.session.setEmpresaActiva(empresa);
    this.router.navigate(['/cotizador']);
  }
}