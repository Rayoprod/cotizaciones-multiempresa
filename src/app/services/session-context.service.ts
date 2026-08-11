import { Injectable, signal, computed } from '@angular/core';
import { IEmpresa } from '../models/empresa.model';
import { IProfile } from '../models/auth.model';

const KEYS = {
  empresa: 'empresa_activa',
  empresaId: 'empresa_activa_id',
  usuario: 'session_usuario',
  rol: 'session_rol'
} as const;

@Injectable({ providedIn: 'root' })
export class SessionContextService {

  // ── Signals reactivos ──────────────────────────────────────────
  private _empresaActiva = signal<IEmpresa | null>(this.leerEmpresa());
  private _usuario       = signal<IProfile | null>(this.leerUsuario());
  private _empresas      = signal<IEmpresa[]>([]);

  // ── Públicos (solo lectura) ────────────────────────────────────
  readonly empresaActiva  = this._empresaActiva.asReadonly();
  readonly usuario        = this._usuario.asReadonly();
  readonly empresas       = this._empresas.asReadonly();

  readonly rol = computed(() => this._usuario()?.rol ?? null);
  readonly empresaId = computed(() => this._empresaActiva()?.id ?? null);
  readonly tieneEmpresa = computed(() => !!this._empresaActiva());
  readonly empresaColor = computed(() => this._empresaActiva()?.color || '#0284c7');

  readonly esAdmin = computed(() =>
    this._usuario()?.rol === 'admin'
  );
  readonly esAdminEmpresa = computed(() =>
    this._usuario()?.rol === 'admin' || this._usuario()?.rol === 'admin_empresa'
  );

  constructor() {
    this.aplicarTemaEmpresa(this._empresaActiva()?.color);
  }

  // ── Empresa activa ─────────────────────────────────────────────

  setEmpresaActiva(empresa: IEmpresa): void {
    sessionStorage.setItem(KEYS.empresa, JSON.stringify(empresa));
    sessionStorage.setItem(KEYS.empresaId, empresa.id);
    this._empresaActiva.set(empresa);
    this.aplicarTemaEmpresa(empresa.color);
  }

  clearEmpresaActiva(): void {
    sessionStorage.removeItem(KEYS.empresa);
    sessionStorage.removeItem(KEYS.empresaId);
    this._empresaActiva.set(null);
    this.aplicarTemaEmpresa(null);
  }

  private aplicarTemaEmpresa(color?: string | null): void {
    if (typeof document !== 'undefined') {
      const activeColor = color && color.trim() ? color.trim() : '#0284c7';
      document.documentElement.style.setProperty('--company-accent-color', activeColor);
    }
  }

  // ── Usuario ────────────────────────────────────────────────────

  setUsuario(usuario: IProfile): void {
    sessionStorage.setItem(KEYS.usuario, JSON.stringify(usuario));
    this._usuario.set(usuario);
  }

  clearUsuario(): void {
    sessionStorage.removeItem(KEYS.usuario);
    sessionStorage.removeItem(KEYS.rol);
    this._usuario.set(null);
  }

  // ── Empresas disponibles ───────────────────────────────────────

  setEmpresas(lista: IEmpresa[]): void {
    this._empresas.set(lista);
  }

  // ── Cerrar sesión completa ─────────────────────────────────────

  clearAll(): void {
    sessionStorage.clear();
    this._empresaActiva.set(null);
    this._usuario.set(null);
    this._empresas.set([]);
  }

  // ── Lectura inicial desde sessionStorage ──────────────────────

  private leerEmpresa(): IEmpresa | null {
    try {
      const raw = sessionStorage.getItem(KEYS.empresa);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private leerUsuario(): IProfile | null {
    try {
      const raw = sessionStorage.getItem(KEYS.usuario);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}