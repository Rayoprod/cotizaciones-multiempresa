import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { SessionContextService } from '../services/session-context.service';

export const initialRedirectGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const session = inject(SessionContextService);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  // El celular de cantera abre directo en su pantalla, también sin señal.
  if (session.modoCampo()) return router.createUrlTree(['/cantera']);

  // El superadmin entra a Empresas; el resto cotiza (el cotizador lleva al
  // selector si aún no hay empresa activa).
  return router.createUrlTree([perfil.rol === 'admin' ? '/empresas' : '/cotizador']);
};
