import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';

export const adminGeneralGuard: CanActivateFn = async () => {
  const auth    = inject(AuthService);
  const session = inject(SessionContextService);
  const router  = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  // ✅ Solo admin general ve /admin/usuarios
  if (session.esAdmin()) return true;

  return router.createUrlTree(['/admin/empresas']);
};