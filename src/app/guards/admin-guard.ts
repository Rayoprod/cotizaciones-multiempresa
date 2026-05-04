import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const logueado = await auth.isLoggedIn();
  const esAdmin  = await auth.isAdmin();

  // ✅ Es admin → puede entrar
  if (logueado && esAdmin) return true;

  // 🔁 Logueado pero no es admin → al cotizador del vendedor
  if (logueado) return router.createUrlTree(['/cotizador']);

  // 🚪 No logueado → al login
  return router.createUrlTree(['/login']);
};