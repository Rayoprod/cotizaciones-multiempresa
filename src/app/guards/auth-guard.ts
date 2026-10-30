import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);

  const perfil = await auth.asegurarPerfil();
  return perfil ? true : auth.urlLogin();
};
