import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { SupabaseService } from '../../services/supabase.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, PasswordModule, RippleModule],
  templateUrl: './login.html'
})
export class LoginComponent {
  correo: string = '';
  contrasena: string = '';
  mensajeError: string = '';
  cargando: boolean = false;

  constructor(
    private authService: AuthService,
    private supabaseSvc: SupabaseService,
    private router: Router
  ) {}

  async iniciarSesion() {
    this.mensajeError = '';
    this.cargando = true;

    if (!this.correo || !this.contrasena) {
      this.mensajeError = 'Por favor, ingresa tu correo y contraseña.';
      this.cargando = false;
      return;
    }

    try {
      const { data, error } = await this.authService.login(this.correo, this.contrasena);

      if (error) {
        this.mensajeError = 'Correo o contraseña incorrectos.';
        return;
      }

      localStorage.setItem('usuario_email', data.user?.email || '');

      // Pequeña pausa para que Supabase confirme la sesión antes de consultarla
      await new Promise(resolve => setTimeout(resolve, 300));

      const perfil = await this.supabaseSvc.obtenerPerfil();
      const rol = perfil?.rol || 'vendedor';

      localStorage.setItem('usuario_rol', rol);

      // Admin general → panel de gestión | Admin_empresa/Vendedor → selector de empresa
      if (rol === 'admin') {
        this.router.navigate(['/admin/empresas']);
      } else if (rol === 'admin_empresa') {
        this.router.navigate(['/admin/empresas']);
      } else {
        this.router.navigate(['/selector']);
      }

    } catch (err) {
      this.mensajeError = 'Ocurrió un error al intentar conectarse.';
    } finally {
      this.cargando = false;
    }
  }
}