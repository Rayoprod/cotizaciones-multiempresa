import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth';
import { IProfile } from '../models';

function crearEscenario(opciones: { sesion?: boolean; perfil?: IProfile | null | Error } = {}) {
  const { sesion = true, perfil = { id: 'u1', email: 'v@x.com', rol: 'vendedor', activo: true } } = opciones;

  let usuarioEnSesion: IProfile | null = null;
  const session = {
    usuario: () => usuarioEnSesion,
    setUsuario: vi.fn((u: IProfile) => { usuarioEnSesion = u; }),
    clearUsuario: vi.fn(() => { usuarioEnSesion = null; }),
    clearAll: vi.fn(() => { usuarioEnSesion = null; })
  };
  const supabase = {
    obtenerSesion: vi.fn(async () => ({
      data: { session: sesion ? { user: { id: 'u1', email: 'v@x.com' } } : null }
    })),
    obtenerPerfil: vi.fn(async () => {
      if (perfil instanceof Error) throw perfil;
      return perfil;
    }),
    cerrarSesion: vi.fn(async () => ({}))
  };
  const router = {
    createUrlTree: vi.fn((ruta: string[], extras: any) => ({ ruta, extras })),
    navigate: vi.fn()
  };

  const auth = new AuthService(supabase as any, router as any, session as any);
  return { auth, supabase, session, router };
}

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
