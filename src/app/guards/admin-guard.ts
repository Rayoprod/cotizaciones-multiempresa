import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { EmpresasUsuarioService } from '../services/empresas-usuario.service';

export const adminGuard: CanActivateFn = async () => {
  const auth     = inject(AuthService);
  const empresasUsuario = inject(EmpresasUsuarioService);
  const router   = inject(Router);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  // Entran el superadmin y quien sea admin en al menos una de sus empresas.
  if (perfil.rol === 'admin') return true;
  const empresas = await empresasUsuario.obtener();
  if (empresas.some(e => e.mi_rol === 'admin')) return true;

  return router.createUrlTree(['/cotizador']);
};
