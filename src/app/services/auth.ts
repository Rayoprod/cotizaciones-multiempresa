import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  // ── Autenticación ─────────────────────────────────

  async login(email: string, password: string) {
    return await this.supabase.iniciarSesion(email, password);
  }

  async obtenerSesion() {
    return await this.supabase.obtenerSesion();
  }

  async logout() {
    await this.supabase.cerrarSesion();
    this.router.navigate(['/login']);
  }

  // ── Estado de sesión ──────────────────────────────

  async isLoggedIn(): Promise<boolean> {
    const sesion = await this.obtenerSesion();
    return sesion?.data?.session !== null;
  }

  async isAdmin(): Promise<boolean> {
    const sesion = await this.obtenerSesion();
    const user = sesion?.data?.session?.user;
    return user?.user_metadata?.['rol'] === 'admin';
  }

  async getRol(): Promise<string | null> {
    const sesion = await this.obtenerSesion();
    const user = sesion?.data?.session?.user;
    return user?.user_metadata?.['rol'] ?? null;
  }

}