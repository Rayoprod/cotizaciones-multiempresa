import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const initialRedirectGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) {
    return router.createUrlTree(['/login']);
  }

  const rol = await auth.getRol(); // obtiene de sessionStorage o BD
  if (rol === 'admin') {
    return router.createUrlTree(['/admin/empresas']);
  }

  // Cualquier otro rol va al cotizador (luego cotizador redirige a selector si no hay empresa)
  return router.createUrlTree(['/cotizador']);
};