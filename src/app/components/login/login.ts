import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { SupabaseService } from '../../services/supabase.service';
import { SessionContextService } from '../../services/session-context.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, PasswordModule, RippleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    private session: SessionContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async iniciarSesion() {
    this.mensajeError = '';
    this.cargando = true;
    this.cdr.markForCheck();

    if (!this.correo || !this.contrasena) {
      this.mensajeError = 'Por favor, ingresa tu correo y contraseña.';
      this.cargando = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      const { data, error } = await this.authService.login(this.correo, this.contrasena);

      if (error) {
        this.mensajeError = 'Correo o contraseña incorrectos.';
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const perfil = await this.supabaseSvc.obtenerPerfil();

      if (perfil) {
        this.session.setUsuario({
          id: data.user?.id ?? '',
          email: data.user?.email ?? '',
          rol: perfil.rol ?? 'vendedor',
          activo: true
        });
      }

      const rol = perfil?.rol ?? 'vendedor';

      if (rol === 'admin') {
        this.router.navigate(['/admin/empresas']);
      } else {
        this.router.navigate(['/selector']);
      }

    } catch (err) {
      this.mensajeError = 'Ocurrió un error al intentar conectarse.';
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }
}