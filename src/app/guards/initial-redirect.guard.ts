import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionContextService } from '../services/session-context.service';
import { AuthService } from '../services/auth';
import { SupabaseService } from '../services/supabase.service'; // ← agregar esto


export const initialRedirectGuard: CanActivateFn = async () => {
  const auth     = inject(AuthService);
  const session  = inject(SessionContextService);
  const supabase = inject(SupabaseService);
  const router   = inject(Router);

  const logueado = await auth.isLoggedIn();
  if (!logueado) return router.createUrlTree(['/login']);

  const rol = session.rol() ?? await auth.getRol();

  if (rol === 'admin') return router.createUrlTree(['/admin/empresas']);

  if (rol === 'admin_empresa') {
    const empresas = await supabase.getEmpresasDelUsuario();
    if (empresas.length === 1) return router.createUrlTree(['/admin/empresas']);
    return router.createUrlTree(['/selector']);
  }

  return router.createUrlTree(['/cotizador']);
};