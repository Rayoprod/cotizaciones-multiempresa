import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

// Importaciones de PrimeNG
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-login',
  standalone: true,
imports: [
    CommonModule, 
    FormsModule, 
    ButtonModule, 
    InputTextModule, 
    PasswordModule, 
    CardModule
],  templateUrl: './login.html'
})
export class LoginComponent {
  correo: string = '';
  contrasena: string = '';
  mensajeError: string = '';

  constructor(private authService: AuthService, private router: Router) {}

  async iniciarSesion() {
    this.mensajeError = ''; // Limpiamos errores previos al hacer clic

    if (!this.correo || !this.contrasena) {
      this.mensajeError = 'Por favor, ingresa tu correo y contraseña.';
      return;
    }

    try {
      const { data, error } = await this.authService.login(this.correo, this.contrasena);

      if (error) {
        this.mensajeError = 'Correo o contraseña incorrectos.';
        console.error('Error de Supabase:', error.message);
      } else {
        console.log('¡Login exitoso!', data);
        // Más adelante, aquí le diremos: "Si el login es correcto, llévame al selector de empresas"
        this.router.navigate(['/selector']);
      }
    } catch (err) {
      this.mensajeError = 'Ocurrió un error al intentar conectarse.';
    }
  }
}