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

import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';
import { PwaUpdateService } from '../services/pwa-update.service';
import { EmpresasUsuarioService } from '../services/empresas-usuario.service';
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
  /** Desde que alguien usa el menú se anima; antes no, para que no se vea al cargar. */
  menuTocado = false;
  estaOnline = true;

  constructor(
    private router: Router,
    private empresasUsuario: EmpresasUsuarioService,
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

  get esAdminGeneral(): boolean {
    return this.session.esSuperadmin();
  }

  /** Admin de la empresa activa (sin ser superadmin): ve "Mi empresa". */
  get esAdminEmpresa(): boolean {
    return !this.session.esSuperadmin() && this.session.esAdminEmpresaActiva();
  }

  /** Rol con el que trabaja ahora: depende de la empresa activa. */
  get etiquetaRol(): string {
    if (this.esAdminGeneral) return 'Superadmin';
    return this.esAdminEmpresa ? 'Admin de la empresa' : 'Vendedor';
  }

  async ngOnInit() {
    await this.inicializarSesion();
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('layout-menu-open');
    }
  }

  private lastToggleTime = 0;

  @HostListener('window:resize')
  onResize() {
    if (window.innerWidth >= 1200 && this.menuAbierto) {
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
    const now = Date.now();
    if (now - this.lastToggleTime < 150) {
      return;
    }
    this.lastToggleTime = now;

    if (this.opCompany) {
      this.opCompany.hide();
    }
    this.menuTocado = true;
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
    // El guard ya verificó el perfil; esto solo cubre recargas de página.
    await this.auth.asegurarPerfil();

    // Refresca las empresas y la activa (la copia de sessionStorage puede
    // tener un rol o unas opciones que ya cambiaron). Si el selector las acaba
    // de cargar, se reutilizan sin otro pedido.
    if (this.session.usuario()) {
      try {
        const empresas = await this.empresasUsuario.obtener();
        const activa = this.session.empresaActiva();
        if (!activa || !empresas.some(e => e.id === activa.id)) {
          if (empresas.length > 0) {
            this.session.setEmpresaActiva(empresas[0]);
          } else {
            this.session.clearEmpresaActiva();
          }
        }
      } catch (e) {
        console.error('Error al refrescar las empresas del usuario:', e);
      }
    }

    this.cdr.markForCheck();
  }
}