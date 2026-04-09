import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async login(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
  }

  async obtenerSesion() {
    return await this.supabase.auth.getSession();
  }

  async logout() {
    await this.supabase.auth.signOut();
  }
}