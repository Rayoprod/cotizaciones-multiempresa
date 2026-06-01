import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = async () => {
  const auth    = inject(AuthService);
  const router  = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  return true;
};