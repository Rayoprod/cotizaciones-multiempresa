import { paletaDeAcento } from './tema';
import { Injectable, signal, computed } from '@angular/core';
import { IEmpresa } from '../models/empresa.model';
import { IProfile } from '../models/auth.model';
import { MODULO_SALIDAS } from '../models/salida.model';

const KEYS = {
  empresa: 'empresa_activa',
  empresaId: 'empresa_activa_id',
  usuario: 'session_usuario',
  rol: 'session_rol'
} as const;

/**
 * localStorage: lo que el celular de cantera necesita para abrir sin señal. La
 * sesión normal va en sessionStorage, que se pierde al cerrar la app.
 */
const CLAVE_MODO_CAMPO = 'modo_campo';

interface ICopiaCampo {
  usuario: IProfile;
  empresa: IEmpresa;
}

@Injectable({ providedIn: 'root' })
export class SessionContextService {

  // ── Signals reactivos ──────────────────────────────────────────
  private _empresaActiva = signal<IEmpresa | null>(this.leerEmpresa());
  private _usuario       = signal<IProfile | null>(this.leerUsuario());
  private _empresas      = signal<IEmpresa[]>([]);
  private _modoCampo     = signal<boolean>(this.leerCopiaCampo() !== null);

  // ── Públicos (solo lectura) ────────────────────────────────────
  readonly empresaActiva  = this._empresaActiva.asReadonly();
  readonly usuario        = this._usuario.asReadonly();
  readonly empresas       = this._empresas.asReadonly();
  /** Este celular trabaja en la cantera: abre con lo guardado, sin esperar a la red. */
  readonly modoCampo      = this._modoCampo.asReadonly();

  readonly rol = computed(() => this._usuario()?.rol ?? null);
  readonly empresaId = computed(() => this._empresaActiva()?.id ?? null);
  readonly tieneEmpresa = computed(() => !!this._empresaActiva());
  readonly empresaColor = computed(() => this._empresaActiva()?.color || '#0284c7');

  readonly esSuperadmin = computed(() => this._usuario()?.rol === 'admin');

  /** Puede editar la ficha, cuentas, logos y lugares de la empresa activa. */
  readonly esAdminEmpresaActiva = computed(() =>
    this.esSuperadmin() || this._empresaActiva()?.mi_rol === 'admin'
  );

  /** En la empresa activa solo trabaja en la cantera: no ve nada de oficina. */
  readonly esEncargado = computed(() =>
    !this.esSuperadmin() && this._empresaActiva()?.mi_rol === 'encargado'
  );

  readonly usaSalidas = computed(() => this._empresaActiva()?.modulos?.includes(MODULO_SALIDAS) ?? false);

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

  // ── Modo cantera ───────────────────────────────────────────────

  /** Guarda en el celular la cuenta y la empresa, sin los datos bancarios. */
  activarModoCampo(): void {
    const usuario = this._usuario();
    const empresa = this._empresaActiva();
    if (!usuario || !empresa) return;
    const { cuentas_bancarias: _, ...sinCuentas } = empresa;
    const copia: ICopiaCampo = { usuario, empresa: sinCuentas };
    localStorage.setItem(CLAVE_MODO_CAMPO, JSON.stringify(copia));
    this._modoCampo.set(true);
  }

  salirModoCampo(): void {
    this.borrarCopiaCampo();
    this._modoCampo.set(false);
  }

  private borrarCopiaCampo(): void {
    try {
      localStorage.removeItem(CLAVE_MODO_CAMPO);
    } catch { /* sin almacenamiento no hay copia que borrar */ }
  }

  private leerCopiaCampo(): ICopiaCampo | null {
    try {
      const raw = localStorage.getItem(CLAVE_MODO_CAMPO);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ── Empresas disponibles ───────────────────────────────────────

  setEmpresas(lista: IEmpresa[]): void {
    this._empresas.set(lista);
  }

  // ── Cerrar sesión completa ─────────────────────────────────────

  clearAll(): void {
    sessionStorage.clear();
    this.salirModoCampo();
    this._empresaActiva.set(null);
    this._usuario.set(null);
    this._empresas.set([]);
  }

  // ── Lectura inicial desde sessionStorage o la copia de cantera ─

  private leerEmpresa(): IEmpresa | null {
    try {
      const raw = sessionStorage.getItem(KEYS.empresa);
      return raw ? JSON.parse(raw) : this.leerCopiaCampo()?.empresa ?? null;
    } catch { return null; }
  }

  private leerUsuario(): IProfile | null {
    try {
      const raw = sessionStorage.getItem(KEYS.usuario);
      return raw ? JSON.parse(raw) : this.leerCopiaCampo()?.usuario ?? null;
    } catch { return null; }
  }
}