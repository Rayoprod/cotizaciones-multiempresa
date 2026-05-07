import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const adminGeneralGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  const esAdminGeneral = await auth.isAdminGeneral();
  if (esAdminGeneral) return true;

  return router.createUrlTree(['/admin/empresas']);
};
