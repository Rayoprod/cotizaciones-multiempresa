import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const adminGeneralGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  // Solo el admin general ve /admin/usuarios
  if (perfil.rol === 'admin') return true;

  return router.createUrlTree(['/admin/empresas']);
};
