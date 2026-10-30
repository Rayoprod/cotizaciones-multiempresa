import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const initialRedirectGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  // El superadmin entra a Empresas; el resto cotiza (el cotizador lleva al
  // selector si aún no hay empresa activa).
  return router.createUrlTree([perfil.rol === 'admin' ? '/empresas' : '/cotizador']);
};
