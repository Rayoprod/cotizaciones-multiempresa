import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { SupabaseService } from '../services/supabase.service';

export const initialRedirectGuard: CanActivateFn = async () => {
  const auth     = inject(AuthService);
  const supabase = inject(SupabaseService);
  const router   = inject(Router);

  const perfil = await auth.asegurarPerfil();
  if (!perfil) return auth.urlLogin();

  if (perfil.rol === 'admin') return router.createUrlTree(['/admin/empresas']);

  if (perfil.rol === 'admin_empresa') {
    const empresas = await supabase.getEmpresasDelUsuario();
    if (empresas.length === 1) return router.createUrlTree(['/admin/empresas']);
    return router.createUrlTree(['/selector']);
  }

  return router.createUrlTree(['/cotizador']);
};
