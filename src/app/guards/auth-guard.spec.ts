import { describe, it, expect } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { authGuard } from './auth-guard';
import { adminGuard } from './admin-guard';
import { adminGeneralGuard } from './admin-general-guard';

function ejecutar(guard: any, perfil: { rol: string } | null) {
  const auth = {
    asegurarPerfil: async () => perfil,
    urlLogin: () => 'LOGIN'
  };
  const router = { createUrlTree: (ruta: string[]) => ruta.join('/') };
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router }
    ]
  });
  return runInInjectionContext(injector, () => guard({} as any, {} as any));
}

describe('guards', () => {
  it('sin perfil válido (sin sesión o cuenta desactivada) mandan al login', async () => {
    expect(await ejecutar(authGuard, null)).toBe('LOGIN');
    expect(await ejecutar(adminGuard, null)).toBe('LOGIN');
    expect(await ejecutar(adminGeneralGuard, null)).toBe('LOGIN');
  });

  it('authGuard deja pasar a cualquier cuenta activa', async () => {
    expect(await ejecutar(authGuard, { rol: 'vendedor' })).toBe(true);
  });

  it('adminGuard: admin y admin_empresa entran; vendedor va al cotizador', async () => {
    expect(await ejecutar(adminGuard, { rol: 'admin' })).toBe(true);
    expect(await ejecutar(adminGuard, { rol: 'admin_empresa' })).toBe(true);
    expect(await ejecutar(adminGuard, { rol: 'vendedor' })).toBe('/cotizador');
  });

  it('adminGeneralGuard: solo el admin general', async () => {
    expect(await ejecutar(adminGeneralGuard, { rol: 'admin' })).toBe(true);
    expect(await ejecutar(adminGeneralGuard, { rol: 'admin_empresa' })).toBe('/admin/empresas');
  });
});
