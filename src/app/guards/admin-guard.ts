import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  const esAdmin = await auth.isAdmin();
  if (esAdmin) return true;

  // Logueado pero no es admin → layout vendedor
  return router.createUrlTree(['/cotizador']);
};