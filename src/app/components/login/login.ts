import { Component, ChangeDetectorRef, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';

const MENSAJES_CIERRE: Record<string, string> = {
  desactivada: 'Tu cuenta está desactivada. Pide al administrador que la vuelva a activar.',
  sin_perfil: 'Tu usuario no tiene un perfil asignado. Contacta al administrador.'
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, PasswordModule, RippleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html'
})
export class LoginComponent implements OnInit {
  correo: string = '';
  contrasena: string = '';
  mensajeError: string = '';
  cargando: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const motivo = this.route.snapshot.queryParamMap.get('motivo');
    if (motivo && MENSAJES_CIERRE[motivo]) {
      this.mensajeError = MENSAJES_CIERRE[motivo];
    }
  }

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
      const { error } = await this.authService.login(this.correo, this.contrasena);

      if (error) {
        // Sin señal también vuelve con error, y no es que la contraseña esté mal.
        const sinConexion = !error.status || error.status >= 500;
        this.mensajeError = sinConexion ? 'No hay conexión. Para entrar necesitas señal.' : 'Correo o contraseña incorrectos.';
        return;
      }

      // Confirma que la cuenta tiene perfil y está activa; si no, cierra la sesión.
      const perfil = await this.authService.asegurarPerfil();
      if (!perfil) {
        const motivo = this.authService.consumirMotivoCierre();
        this.mensajeError = (motivo && MENSAJES_CIERRE[motivo]) || 'No se pudo verificar tu cuenta. Inténtalo de nuevo.';
        return;
      }

      if (perfil.rol === 'admin') {
        this.router.navigate(['/empresas']);
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
