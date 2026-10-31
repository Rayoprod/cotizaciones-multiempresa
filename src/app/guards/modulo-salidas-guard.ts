import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionContextService } from '../services/session-context.service';

export const moduloSalidasGuard: CanActivateFn = () => {
  const session = inject(SessionContextService);
  const router  = inject(Router);

  return session.usaSalidas() ? true : router.createUrlTree(['/ventas']);
};
