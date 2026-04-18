import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  
  // Revisamos si el usuario tiene una sesión activa (o si eligió empresa)
  // Nota: Si en tu login guardas un 'token' o similar, cambia 'empresa_activa' por ese nombre.
  const sesionActiva = localStorage.getItem('empresa_activa'); 

  if (sesionActiva) {
    return true; // ¡Adelante, puedes pasar al sistema!
  } else {
    router.navigate(['/login']); // No hay sesión, patada al login
    return false;
  }
};