import { paletaDeAcento } from './tema';
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

  readonly esSuperadmin = computed(() => this._usuario()?.rol === 'admin');

  /** Puede editar la ficha, cuentas, logos y lugares de la empresa activa. */
  readonly esAdminEmpresaActiva = computed(() =>
    this.esSuperadmin() || this._empresaActiva()?.mi_rol === 'admin'
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
      const raiz = document.documentElement.style;
      raiz.setProperty('--company-accent-color', activeColor);
      for (const [variable, valor] of Object.entries(paletaDeAcento(activeColor))) {
        raiz.setProperty(variable, valor);
      }
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