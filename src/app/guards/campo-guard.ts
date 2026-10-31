import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { SessionContextService } from '../services/session-context.service';

export const campoGuard: CanActivateFn = async () => {
  const auth    = inject(AuthService);
  const session = inject(SessionContextService);
  const router  = inject(Router);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  return session.empresaActiva() ? true : router.createUrlTree(['/selector']);
};
