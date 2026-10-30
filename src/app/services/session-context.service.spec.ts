import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionContextService } from './session-context.service';
import { IEmpresa } from '../models';

const empresa = (id: string, mi_rol?: 'admin' | 'vendedor'): IEmpresa =>
  ({ id, nombre_comercial: id, ruc: '20000000001', color: '#000000', mi_rol });

describe('SessionContextService - rol en la empresa activa', () => {
  let session: SessionContextService;

  beforeEach(() => {
    const datos = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => { datos.set(k, v); },
      removeItem: (k: string) => { datos.delete(k); },
      clear: () => datos.clear()
    });
    session = new SessionContextService();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('la misma cuenta es admin en una empresa y vendedor en otra', () => {
    session.setUsuario({ id: 'u1', rol: 'usuario', activo: true });

    session.setEmpresaActiva(empresa('VDC', 'admin'));
    expect(session.esAdminEmpresaActiva()).toBe(true);

    session.setEmpresaActiva(empresa('WM', 'vendedor'));
    expect(session.esAdminEmpresaActiva()).toBe(false);
  });

  it('el superadmin es admin en cualquier empresa', () => {
    session.setUsuario({ id: 'u0', rol: 'admin', activo: true });
    session.setEmpresaActiva(empresa('WM'));
    expect(session.esSuperadmin()).toBe(true);
    expect(session.esAdminEmpresaActiva()).toBe(true);
  });

  it('sin empresa activa nadie más que el superadmin es admin', () => {
    session.setUsuario({ id: 'u1', rol: 'usuario', activo: true });
    expect(session.esAdminEmpresaActiva()).toBe(false);
  });
});
