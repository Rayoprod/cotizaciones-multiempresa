import { Component, OnInit, HostListener, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DividerModule } from 'primeng/divider';
import { OverlayPanelModule, OverlayPanel } from 'primeng/overlaypanel';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { SupabaseService } from '../services/supabase.service';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';
import { IEmpresa } from '../models/empresa.model';

import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet,
    ButtonModule, AvatarModule, DividerModule, OverlayPanelModule, TagModule, TooltipModule, InputTextModule
  ],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  menuAbierto = false;

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService,
    private session: SessionContextService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.cerrarMenu());
  }

  busquedaEmpresa = '';

  get usuarioActivo(): string {
    return this.session.usuario()?.email ?? 'Usuario';
  }

  get empresaActiva(): IEmpresa | null {
    return this.session.empresaActiva();
  }

  get empresasDisponibles(): IEmpresa[] {
    return this.session.empresas();
  }

  get empresasFiltradas(): IEmpresa[] {
    const q = this.busquedaEmpresa.trim().toLowerCase();
    if (!q) return this.empresasDisponibles;
    return this.empresasDisponibles.filter(e =>
      (e.nombre_comercial && e.nombre_comercial.toLowerCase().includes(q)) ||
      (e.ruc && e.ruc.includes(q))
    );
  }

  get esAdmin(): boolean {
    return this.session.esAdminEmpresa(); // admin o admin_empresa
  }

  get esAdminGeneral(): boolean {
    return this.session.esAdmin(); // solo admin
  }

  get esAdminEmpresa(): boolean {
    return this.session.usuario()?.rol === 'admin_empresa';
  }

  async ngOnInit() {
    await this.inicializarSesion();
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 768 && this.menuAbierto) {
      this.menuAbierto = false;
      this.cdr.markForCheck();
    }
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
    this.cdr.markForCheck();
  }

  cerrarMenu() {
    this.menuAbierto = false;
    this.cdr.markForCheck();
  }

  volverAlAdmin() {
    this.cerrarMenu();
    this.router.navigate(['/admin/empresas']);
  }

  // ✅ Abre modal de edición de la empresa activa (para admin_empresa)
  configurarEmpresa() {
    this.cerrarMenu();
    this.router.navigate(['/admin/empresas']);
  }

  seleccionarEmpresaRapida(empresa: IEmpresa, op?: OverlayPanel) {
    if (op) {
      op.hide();
    }
    this.session.setEmpresaActiva(empresa);
    this.cdr.markForCheck();
    
    // Recargar vista actual de forma fluida (SPA navigation)
    const currentUrl = this.router.url;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([currentUrl]);
    });
  }

  irASelector(op?: OverlayPanel) {
    if (op) {
      op.hide();
    }
    this.cerrarMenu();
    this.router.navigate(['/selector']);
  }

  async cerrarSesion() {
    await this.auth.logout(); // ✅ ya llama session.clearAll() internamente
  }

  private async inicializarSesion() {
    // Si ya hay usuario y empresa en el service, solo notifica a Angular
    if (!this.session.usuario()) {
      // Fallback: reconstruir si se recargó la página
      let intentos = 0;
      while (intentos < 3) {
        try {
          const sesion = await this.supabaseSvc.obtenerSesion();
          const user = sesion?.data?.session?.user;
          if (user?.email) {
            const perfil = await this.supabaseSvc.obtenerPerfil();
            if (perfil?.rol) {
              this.session.setUsuario({
                id: user.id,
                email: user.email,
                rol: perfil.rol,
                activo: true
              });
              break;
            }
          }
        } catch { /* reintentar */ }

        intentos++;
        if (intentos < 3) await new Promise(r => setTimeout(r, 800));
      }
    }

    // Si la empresa activa aún es null, intentar cargarla del usuario
    if (!this.session.empresaActiva() && this.session.usuario()) {
      try {
        const empresas = await this.supabaseSvc.getEmpresasDelUsuario();
        if (empresas && empresas.length > 0) {
          this.session.setEmpresas(empresas);
          this.session.setEmpresaActiva(empresas[0]);
        }
      } catch (e) {
        console.error('Error al auto-seleccionar empresa activa:', e);
      }
    }

    this.cdr.markForCheck();
  }
}