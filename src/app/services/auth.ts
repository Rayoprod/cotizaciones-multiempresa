import { Injectable } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { SessionContextService } from './session-context.service';
import { EmpresasUsuarioService } from './empresas-usuario.service';
import { IProfile } from '../models';

/** Cada cuánto se vuelve a confirmar contra la BD que la cuenta sigue activa. */
const REVALIDAR_PERFIL_MS = 5 * 60 * 1000;

export type MotivoCierre = 'desactivada' | 'sin_perfil';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private perfilVerificadoEn = 0;
  private motivoCierre: MotivoCierre | null = null;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private session: SessionContextService,
    private empresasUsuario: EmpresasUsuarioService
  ) {}

  async login(email: string, password: string) {
    return await this.supabase.iniciarSesion(email, password);
  }

  async obtenerSesion() {
    return await this.supabase.obtenerSesion();
  }

  async logout() {
    await this.supabase.cerrarSesion();
    this.session.clearAll();
    this.empresasUsuario.invalidar();
    this.perfilVerificadoEn = 0;
    this.router.navigate(['/login']);
  }

  async isLoggedIn(): Promise<boolean> {
    const sesion = await this.obtenerSesion();
    return sesion?.data?.session !== null && sesion?.data?.session !== undefined;
  }

  /**
   * Perfil del usuario con sesión. Lo confirma contra la BD al abrir la app
   * (o una pestaña nueva) y luego cada 5 minutos. Si la cuenta fue
   * desactivada o no tiene perfil, cierra la sesión y devuelve null.
   * Sin conexión se conserva el perfil ya conocido: la BD igual bloquea a
   * un usuario desactivado.
   */
  async asegurarPerfil(): Promise<IProfile | null> {
    const { data } = await this.supabase.obtenerSesion();
    const usuario = data.session?.user;
    if (!usuario) {
      this.session.clearUsuario();
      return null;
    }

    const conocido = this.session.usuario();
    if (conocido?.id === usuario.id && Date.now() - this.perfilVerificadoEn < REVALIDAR_PERFIL_MS) {
      return conocido;
    }

    let perfil: IProfile | null;
    try {
      perfil = await this.supabase.obtenerPerfil(usuario.id);
    } catch {
      return conocido?.id === usuario.id ? conocido : null;
    }

    if (!perfil || perfil.activo === false) {
      this.motivoCierre = perfil ? 'desactivada' : 'sin_perfil';
      await this.supabase.cerrarSesion();
      this.session.clearAll();
      this.perfilVerificadoEn = 0;
      return null;
    }

    const actual: IProfile = {
      id: usuario.id,
      email: perfil.email || usuario.email || '',
      rol: perfil.rol || 'usuario',
      activo: true
    };
    this.session.setUsuario(actual);
    this.perfilVerificadoEn = Date.now();
    return actual;
  }

  /** Por qué asegurarPerfil() cerró la sesión; se borra al leerlo. */
  consumirMotivoCierre(): MotivoCierre | null {
    const motivo = this.motivoCierre;
    this.motivoCierre = null;
    return motivo;
  }

  /** Ruta al login, con el motivo si la sesión se cerró por la cuenta. */
  urlLogin(): UrlTree {
    const motivo = this.consumirMotivoCierre();
    return this.router.createUrlTree(['/login'], motivo ? { queryParams: { motivo } } : {});
  }
}
