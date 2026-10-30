import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  // admin y admin_empresa entran al panel /admin
  if (perfil.rol === 'admin' || perfil.rol === 'admin_empresa') return true;

  // vendedor → cotizador
  return router.createUrlTree(['/cotizador']);
};
