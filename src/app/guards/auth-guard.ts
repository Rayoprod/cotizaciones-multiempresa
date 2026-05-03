import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  
  // Ahora vigilamos que exista una sesión real (el correo del login)
  const sesionActiva = localStorage.getItem('usuario_conectado'); 

  if (sesionActiva) {
    return true; 
  } else {
    router.navigate(['/login']); 
    return false;
  }
};