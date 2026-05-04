import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  return true;
  // ✅ Admin puede entrar al cotizador para operar — no lo bloqueamos
};