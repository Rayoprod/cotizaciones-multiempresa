import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

// Importaciones de PrimeNG
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple'; // Para el efecto click premium

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
  // Tus variables exactas
  correo: string = '';
  contrasena: string = '';
  mensajeError: string = '';
  cargando: boolean = false; // <-- El toque extra para el feedback visual del botón

  // Tu constructor funcional
  constructor(private authService: AuthService, private router: Router) {}

  async iniciarSesion() {
    this.mensajeError = ''; 
    this.cargando = true; // Empieza a girar el botón

    if (!this.correo || !this.contrasena) {
      this.mensajeError = 'Por favor, ingresa tu correo y contraseña.';
      this.cargando = false;
      return;
    }

    try {
      // Tu lógica exacta y funcional conectada a AuthService
      const { data, error } = await this.authService.login(this.correo, this.contrasena);

      if (error) {
        this.mensajeError = 'Correo o contraseña incorrectos.';
        console.error('Error de Supabase:', error.message);
      } else {
        console.log('¡Login exitoso!', data);
        // GUARDA EL CORREO DEL USUARIO PARA LA HUELLA
        localStorage.setItem('usuario_conectado', this.correo); 
        
        // Viaje directo al selector
        this.router.navigate(['/selector']);
        // Viaje directo al selector de empresas que ya tenías configurado
        this.router.navigate(['/selector']);
      }
    } catch (err) {
      this.mensajeError = 'Ocurrió un error al intentar conectarse.';
    } finally {
      this.cargando = false; // Detiene el giro del botón
    }
  }
}