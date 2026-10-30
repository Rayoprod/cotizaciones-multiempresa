import { describe, it, expect } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { EmpresasUsuarioService } from '../services/empresas-usuario.service';
import { authGuard } from './auth-guard';
import { adminGuard } from './admin-guard';
import { adminGeneralGuard } from './admin-general-guard';
import { initialRedirectGuard } from './initial-redirect.guard';

function ejecutar(guard: any, perfil: { rol: string } | null, rolesEnEmpresas: string[] = []) {
  const auth = {
    asegurarPerfil: async () => perfil,
    urlLogin: () => 'LOGIN'
  };
  const empresasUsuario = {
    obtener: async () => rolesEnEmpresas.map((mi_rol, i) => ({ id: `E${i}`, mi_rol }))
  };
  const router = { createUrlTree: (ruta: string[]) => ruta.join('/') };
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: EmpresasUsuarioService, useValue: empresasUsuario },
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
    expect(await ejecutar(initialRedirectGuard, null)).toBe('LOGIN');
  });

  it('authGuard deja pasar a cualquier cuenta activa', async () => {
    expect(await ejecutar(authGuard, { rol: 'usuario' })).toBe(true);
  });

  it('adminGuard: entran el superadmin y quien es admin en alguna empresa', async () => {
    expect(await ejecutar(adminGuard, { rol: 'admin' })).toBe(true);
    expect(await ejecutar(adminGuard, { rol: 'usuario' }, ['vendedor', 'admin'])).toBe(true);
  });

  it('adminGuard: quien solo es vendedor va al cotizador', async () => {
    expect(await ejecutar(adminGuard, { rol: 'usuario' }, ['vendedor', 'vendedor'])).toBe('/cotizador');
    expect(await ejecutar(adminGuard, { rol: 'usuario' }, [])).toBe('/cotizador');
  });

  it('adminGeneralGuard: solo el superadmin', async () => {
    expect(await ejecutar(adminGeneralGuard, { rol: 'admin' })).toBe(true);
    expect(await ejecutar(adminGeneralGuard, { rol: 'usuario' })).toBe('/cotizador');
  });

  it('initialRedirectGuard: superadmin al panel, el resto al cotizador', async () => {
    expect(await ejecutar(initialRedirectGuard, { rol: 'admin' })).toBe('/empresas');
    expect(await ejecutar(initialRedirectGuard, { rol: 'usuario' })).toBe('/cotizador');
  });
});
