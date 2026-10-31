import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionContextService } from './session-context.service';
import { IEmpresa } from '../models';

const empresa = (id: string, mi_rol?: 'admin' | 'vendedor' | 'encargado', modulos?: string[]): IEmpresa =>
  ({ id, nombre_comercial: id, ruc: '20000000001', color: '#000000', mi_rol, modulos });

function almacen() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear()
  };
}

describe('SessionContextService - modo cantera', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', almacen());
    vi.stubGlobal('localStorage', almacen());
  });

  afterEach(() => vi.unstubAllGlobals());

  // Al cerrar la app se pierde sessionStorage; lo demás sigue en el celular.
  const reabrir = () => {
    vi.stubGlobal('sessionStorage', almacen());
    return new SessionContextService();
  };

  function conSesion() {
    const session = new SessionContextService();
    session.setUsuario({ id: 'u1', rol: 'usuario', activo: true });
    session.setEmpresaActiva({ ...empresa('VDC', 'vendedor'), cuentas_bancarias: [{ banco: 'BCP', tipo_cuenta: 'Corriente', moneda: 'PEN', numero: '1' }] } as IEmpresa);
    return session;
  }

  it('sin activarlo, al cerrar la app se pierde la sesión, como siempre', () => {
    conSesion();
    const nueva = reabrir();
    expect(nueva.modoCampo()).toBe(false);
    expect(nueva.usuario()).toBeNull();
    expect(nueva.empresaActiva()).toBeNull();
  });

  it('activado, al abrir de nuevo recupera la cuenta y la empresa', () => {
    conSesion().activarModoCampo();
    const nueva = reabrir();
    expect(nueva.modoCampo()).toBe(true);
    expect(nueva.usuario()?.id).toBe('u1');
    expect(nueva.empresaActiva()?.id).toBe('VDC');
  });

  it('no guarda las cuentas bancarias en el celular', () => {
    conSesion().activarModoCampo();
    expect(reabrir().empresaActiva()?.cuentas_bancarias).toBeUndefined();
  });

  it('salir de la prueba y cerrar sesión borran la copia', () => {
    const uno = conSesion();
    uno.activarModoCampo();
    uno.salirModoCampo();
    expect(uno.modoCampo()).toBe(false);
    expect(reabrir().usuario()).toBeNull();

    const dos = conSesion();
    dos.activarModoCampo();
    dos.clearAll();
    expect(dos.modoCampo()).toBe(false);
    expect(reabrir().empresaActiva()).toBeNull();
  });

  it('sin usuario o sin empresa no se activa', () => {
    const session = new SessionContextService();
    session.activarModoCampo();
    expect(session.modoCampo()).toBe(false);
  });

  it('lo de sessionStorage manda sobre la copia', () => {
    const session = conSesion();
    session.activarModoCampo();
    session.setEmpresaActiva(empresa('WM', 'vendedor'));
    expect(new SessionContextService().empresaActiva()?.id).toBe('WM');
  });
});

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
  it('es encargado según su rol en la empresa activa', () => {
    const session = new SessionContextService();
    session.setUsuario({ id: 'u1', rol: 'usuario' });
    session.setEmpresaActiva(empresa('VDC', 'encargado'));
    expect(session.esEncargado()).toBe(true);
    session.setEmpresaActiva(empresa('WM', 'vendedor'));
    expect(session.esEncargado()).toBe(false);
  });

  it('el superadmin nunca queda como encargado', () => {
    const session = new SessionContextService();
    session.setUsuario({ id: 'u1', rol: 'admin' });
    session.setEmpresaActiva(empresa('VDC', 'encargado'));
    expect(session.esEncargado()).toBe(false);
  });

  it('usa Salidas si la empresa activa tiene el módulo', () => {
    const session = new SessionContextService();
    session.setEmpresaActiva(empresa('VDC', 'admin', ['salidas']));
    expect(session.usaSalidas()).toBe(true);
    session.setEmpresaActiva(empresa('WM', 'admin', []));
    expect(session.usaSalidas()).toBe(false);
    session.setEmpresaActiva(empresa('RAYO', 'admin'));
    expect(session.usaSalidas()).toBe(false);
  });
});
