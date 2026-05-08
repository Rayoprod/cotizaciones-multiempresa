import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async login(email: string, password: string) {
    return await this.supabase.iniciarSesion(email, password);
  }

  async obtenerSesion() {
    return await this.supabase.obtenerSesion();
  }

  async logout() {
    await this.supabase.cerrarSesion();
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  async isLoggedIn(): Promise<boolean> {
    const sesion = await this.obtenerSesion();
    // null explícito = sin sesión, undefined = error de red (consideramos logueado)
    return sesion?.data?.session !== null && sesion?.data?.session !== undefined;
  }

  async isAdmin(): Promise<boolean> {
const rolLocal = localStorage.getItem('usuario_rol');
    if (rolLocal) return rolLocal === 'admin' || rolLocal === 'admin_empresa';

    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol === 'admin' || perfil?.rol === 'admin_empresa';
  }

  async isAdminGeneral(): Promise<boolean> {
    const rolLocal = localStorage.getItem('usuario_rol');
    if (rolLocal) return rolLocal === 'admin';

    // Fallback: consulta la BD
    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol === 'admin';
  }

  async getRol(): Promise<string | null> {
    const rolLocal = localStorage.getItem('usuario_rol');
    if (rolLocal) return rolLocal;

    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol ?? null;
  }
}