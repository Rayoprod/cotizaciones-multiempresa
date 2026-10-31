import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionContextService } from '../services/session-context.service';

/** El encargado trabaja en su pantalla. Aunque abra otra dirección, la BD no le daría nada. */
export const oficinaGuard: CanActivateFn = () => {
  const session = inject(SessionContextService);
  const router  = inject(Router);

  return session.esEncargado() ? router.createUrlTree(['/cantera']) : true;
};
