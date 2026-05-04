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
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    RippleModule
  ],
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

      // Guardamos email para mostrar en UI
      localStorage.setItem('usuario_email', data.user?.email || '');

      // Consultamos el rol real desde la BD
      const perfil = await this.supabaseSvc.obtenerPerfil();
      const rol = perfil?.rol || 'vendedor';

      // Guardamos el rol en localStorage para usarlo en el layout
      localStorage.setItem('usuario_rol', rol);

      // Redirigimos según el rol
      if (rol === 'admin') {
        this.router.navigate(['/admin']);
      } else {
const rol = await this.authService.getRol();

if (rol === 'admin') {
  this.router.navigate(['/admin/cotizador']);
} else {
  this.router.navigate(['/selector']);
}      }

    } catch (err) {
      this.mensajeError = 'Ocurrió un error al intentar conectarse.';
    } finally {
      this.cargando = false;
    }
  }
}