import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth';
import { IProfile } from '../models';

function crearEscenario(opciones: { sesion?: boolean; perfil?: IProfile | null | Error; campo?: IProfile; errorSesion?: unknown } = {}) {
  const { sesion = true, perfil = { id: 'u1', email: 'v@x.com', rol: 'vendedor', activo: true } } = opciones;

  let usuarioEnSesion: IProfile | null = opciones.campo ?? null;
  const session = {
    modoCampo: () => !!opciones.campo,
    usuario: () => usuarioEnSesion,
    setUsuario: vi.fn((u: IProfile) => { usuarioEnSesion = u; }),
    clearUsuario: vi.fn(() => { usuarioEnSesion = null; }),
    clearAll: vi.fn(() => { usuarioEnSesion = null; })
  };
  const supabase = {
    obtenerSesion: vi.fn(async () => ({
      data: { session: sesion ? { user: { id: 'u1', email: 'v@x.com' } } : null },
      error: opciones.errorSesion ?? null
    })),
    obtenerPerfil: vi.fn(async () => {
      if (perfil instanceof Error) throw perfil;
      return perfil;
    }),
    cerrarSesion: vi.fn(async () => ({}))
  };
  const router = {
    createUrlTree: vi.fn((ruta: string[], extras: any) => ({ ruta, extras })),
    navigate: vi.fn(),
    navigateByUrl: vi.fn()
  };

  const auth = new AuthService(supabase as any, router as any, session as any, { invalidar: vi.fn() } as any);
  return { auth, supabase, session, router };
}

describe('AuthService en la cantera', () => {
  const guardado: IProfile = { id: 'u1', email: 'e@x.com', rol: 'usuario', activo: true };
  // La confirmación corre aparte: se le da tiempo a terminar.
  const dejarTerminar = () => new Promise(resolve => setTimeout(resolve));

  it('abre con lo guardado aunque la red no conteste nunca', async () => {
    const { auth, supabase } = crearEscenario({ campo: guardado });
    supabase.obtenerSesion.mockImplementation(() => new Promise(() => {}) as any);
    expect(await auth.asegurarPerfil()).toEqual(guardado);
  });

  it('sin señal no cierra la sesión', async () => {
    const { auth, supabase, session } = crearEscenario({ campo: guardado, sesion: false, errorSesion: new Error('Failed to fetch') });
    await auth.asegurarPerfil();
    await dejarTerminar();
    expect(supabase.cerrarSesion).not.toHaveBeenCalled();
    expect(session.clearAll).not.toHaveBeenCalled();
  });

  it('con la sesión válida pero sin poder leer el perfil tampoco la cierra', async () => {
    const { auth, supabase } = crearEscenario({ campo: guardado, perfil: new Error('Failed to fetch') });
    await auth.asegurarPerfil();
    await dejarTerminar();
    expect(supabase.cerrarSesion).not.toHaveBeenCalled();
  });

  it('si la sesión de verdad terminó, lleva al login', async () => {
    const { auth, session, router } = crearEscenario({ campo: guardado, sesion: false });
    await auth.asegurarPerfil();
    await dejarTerminar();
    expect(session.clearAll).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalled();
  });

  it('si la cuenta se desactivó, cierra y lo explica', async () => {
    const { auth, supabase, router } = crearEscenario({ campo: guardado, perfil: { id: 'u1', activo: false } });
    await auth.asegurarPerfil();
    await dejarTerminar();
    expect(supabase.cerrarSesion).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith({ ruta: ['/login'], extras: { queryParams: { motivo: 'desactivada' } } });
  });

  it('no consulta la red más de una vez cada 5 minutos', async () => {
    const { auth, supabase } = crearEscenario({ campo: guardado });
    await auth.asegurarPerfil();
    await dejarTerminar();
    await auth.asegurarPerfil();
    await dejarTerminar();
    expect(supabase.obtenerSesion).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService.asegurarPerfil', () => {
  beforeEach(() => vi.useRealTimers());

  it('sin sesión devuelve null', async () => {
    const { auth, supabase } = crearEscenario({ sesion: false });
    expect(await auth.asegurarPerfil()).toBeNull();
    expect(supabase.obtenerPerfil).not.toHaveBeenCalled();
  });

  it('con cuenta activa guarda el perfil real en la sesión', async () => {
    const { auth, session } = crearEscenario({ perfil: { id: 'u1', email: 'v@x.com', rol: 'admin_empresa', activo: true } });
    const perfil = await auth.asegurarPerfil();
    expect(perfil).toEqual({ id: 'u1', email: 'v@x.com', rol: 'admin_empresa', activo: true });
    expect(session.setUsuario).toHaveBeenCalledWith(perfil);
  });

  it('cuenta desactivada: cierra la sesión y lo explica en el login', async () => {
    const { auth, supabase, session, router } = crearEscenario({ perfil: { id: 'u1', rol: 'vendedor', activo: false } });
    expect(await auth.asegurarPerfil()).toBeNull();
    expect(supabase.cerrarSesion).toHaveBeenCalled();
    expect(session.clearAll).toHaveBeenCalled();
    auth.urlLogin();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], { queryParams: { motivo: 'desactivada' } });
  });

  it('usuario sin perfil: cierra la sesión con su propio motivo', async () => {
    const { auth, supabase } = crearEscenario({ perfil: null });
    expect(await auth.asegurarPerfil()).toBeNull();
    expect(supabase.cerrarSesion).toHaveBeenCalled();
    expect(auth.consumirMotivoCierre()).toBe('sin_perfil');
    expect(auth.consumirMotivoCierre()).toBeNull();
  });

  it('no vuelve a consultar la BD antes de 5 minutos', async () => {
    vi.useFakeTimers();
    const { auth, supabase } = crearEscenario();
    await auth.asegurarPerfil();
    await auth.asegurarPerfil();
    expect(supabase.obtenerPerfil).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await auth.asegurarPerfil();
    expect(supabase.obtenerPerfil).toHaveBeenCalledTimes(2);
  });

  it('sin conexión conserva el perfil ya conocido en vez de expulsar al usuario', async () => {
    vi.useFakeTimers();
    const escenario = crearEscenario();
    await escenario.auth.asegurarPerfil();
    escenario.supabase.obtenerPerfil.mockRejectedValueOnce(new Error('Failed to fetch'));

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const perfil = await escenario.auth.asegurarPerfil();
    expect(perfil?.id).toBe('u1');
    expect(escenario.supabase.cerrarSesion).not.toHaveBeenCalled();
  });
});
