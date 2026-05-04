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
    return sesion?.data?.session !== null;
  }

  // ✅ Ahora lee el rol desde la tabla profiles (igual que el login)
  async isAdmin(): Promise<boolean> {
    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol === 'admin';
  }

  async getRol(): Promise<string | null> {
    const perfil = await this.supabase.obtenerPerfil();
    return perfil?.rol ?? null;
  }
}