import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';

export const adminGuard: CanActivateFn = async () => {
  const auth    = inject(AuthService);
  const session = inject(SessionContextService);
  const router  = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  // ✅ admin Y admin_empresa entran al panel /admin
  const rol = session.usuario()?.rol;
  if (rol === 'admin' || rol === 'admin_empresa') return true;

  // vendedor → cotizador
  return router.createUrlTree(['/cotizador']);
};