import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth';
import { EmpresasUsuarioService } from '../../services/empresas-usuario.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SessionContextService } from '../../services/session-context.service';

@Component({
  selector: 'app-selector',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, ProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selector-empresa.html'
})
export class SelectorComponent implements OnInit {

  nombreUsuario: string = '';
  empresas: any[] = [];
  cargando: boolean = true;

  get esAdmin(): boolean {
    return this.session.esSuperadmin();
  }

  constructor(
    private router: Router,
    private auth: AuthService,
    private empresasUsuario: EmpresasUsuarioService,
    private cdr: ChangeDetectorRef,
    private session: SessionContextService
  ) {}

  async ngOnInit() {
    this.nombreUsuario = (this.session.usuario()?.email || '').split('@')[0];

    try {
      this.empresas = await this.empresasUsuario.obtener();

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
    this.router.navigate([this.session.esEncargado() ? '/cantera' : '/cotizador']);
  }

  async cerrarSesion() {
    await this.auth.logout();
  }
}