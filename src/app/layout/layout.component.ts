import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef, DestroyRef, inject, ChangeDetectionStrategy, ViewChild } from '@angular/core';
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
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { SupabaseService } from '../services/supabase.service';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';
import { PwaUpdateService } from '../services/pwa-update.service';
import { IEmpresa } from '../models/empresa.model';

import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet,
    ButtonModule, AvatarModule, DividerModule, OverlayPanelModule, TagModule, TooltipModule, InputTextModule, ToastModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit, OnDestroy {
  @ViewChild('opCompany') opCompany?: OverlayPanel;

  menuAbierto = false;
  estaOnline = true;

  constructor(
    private router: Router,
    private supabaseSvc: SupabaseService,
    private session: SessionContextService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private destroyRef: DestroyRef,
    private messageService: MessageService,
    public pwaUpdate: PwaUpdateService
  ) {
    this.estaOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.cerrarMenu();
        this.resetearScrollContenedor();
      });
  }

  private resetearScrollContenedor() {
    if (typeof document !== 'undefined') {
      const mainEl = document.querySelector('.layout-router-outlet');
      if (mainEl) {
        mainEl.scrollTop = 0;
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.menuAbierto) {
      this.cerrarMenu();
    }
  }

  @HostListener('window:online')
  onOnline() {
    this.estaOnline = true;
    this.messageService.add({
      severity: 'success',
      summary: 'Conexión restaurada',
      detail: 'El sistema vuelve a estar en línea.',
      life: 3000
    });
    this.cdr.markForCheck();
  }

  @HostListener('window:offline')
  onOffline() {
    this.estaOnline = false;
    this.messageService.add({
      severity: 'warn',
      summary: 'Sin conexión',
      detail: 'El sistema requiere conexión a internet para guardar cambios en tiempo real.',
      sticky: true
    });
    this.cdr.markForCheck();
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

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('layout-menu-open');
    }
  }

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 768 && this.menuAbierto) {
      this.cerrarMenu();
    }
  }

  toggleMenu(event?: Event) {
    if (event) {
      event.stopPropagation();
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }
    if (this.opCompany) {
      this.opCompany.hide();
    }
    this.menuAbierto = !this.menuAbierto;
    this.actualizarBodyLock();
    this.cdr.markForCheck();
  }

  cerrarMenu() {
    if (this.menuAbierto) {
      this.menuAbierto = false;
      this.actualizarBodyLock();
      this.cdr.markForCheck();
    }
  }

  private actualizarBodyLock() {
    if (typeof document !== 'undefined') {
      if (this.menuAbierto) {
        document.body.classList.add('layout-menu-open');
      } else {
        document.body.classList.remove('layout-menu-open');
      }
    }
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

  async instalarPwa() {
    await this.pwaUpdate.promptInstallPwa();
    this.cdr.markForCheck();
  }

  reloadPwaApp() {
    this.pwaUpdate.reloadApp();
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
            const perfil = await this.supabaseSvc.obtenerPerfil(user.id);
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