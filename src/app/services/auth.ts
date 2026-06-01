import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { SessionContextService } from './session-context.service';

@Injectable({ providedIn: 'root' })
export class AuthService {

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private session: SessionContextService
  ) {}

  async login(email: string, password: string) {
    return await this.supabase.iniciarSesion(email, password);
  }

  async obtenerSesion() {
    return await this.supabase.obtenerSesion();
  }

  async logout() {
    await this.supabase.cerrarSesion();
    this.session.clearAll(); // ✅ reemplaza localStorage.clear()
    this.router.navigate(['/login']);
  }

  async isLoggedIn(): Promise<boolean> {
    const sesion = await this.obtenerSesion();
    return sesion?.data?.session !== null && sesion?.data?.session !== undefined;
  }

  async isAdmin(): Promise<boolean> {
    const rol = this.session.rol(); // ✅ desde signal
    if (rol) return rol === 'admin' || rol === 'admin_empresa';
    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol === 'admin' || perfil?.rol === 'admin_empresa';
  }

  async isAdminGeneral(): Promise<boolean> {
    const rol = this.session.rol(); // ✅ desde signal
    if (rol) return rol === 'admin';
    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol === 'admin';
  }

  async getRol(): Promise<string | null> {
    const rol = this.session.rol(); // ✅ desde signal
    if (rol) return rol;
    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol ?? null;
  }
}