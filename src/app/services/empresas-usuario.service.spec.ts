import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmpresasUsuarioService } from './empresas-usuario.service';
import { SessionContextService } from './session-context.service';

describe('EmpresasUsuarioService', () => {
  let session: SessionContextService;
  let supabase: { getEmpresasDelUsuario: ReturnType<typeof vi.fn> };
  let servicio: EmpresasUsuarioService;

  beforeEach(() => {
    const datos = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => { datos.set(k, v); },
      removeItem: (k: string) => { datos.delete(k); },
      clear: () => datos.clear()
    });
    session = new SessionContextService();
    session.setUsuario({ id: 'u1', rol: 'usuario', activo: true });
    supabase = {
      getEmpresasDelUsuario: vi.fn(async () => [
        { id: 'VDC', nombre_comercial: 'VDC', ruc: '1', color: '#000', mi_rol: 'admin', lugares_entrega: ['EN OBRA'] }
      ])
    };
    servicio = new EmpresasUsuarioService(supabase as any, session);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('dos pedidos simultáneos comparten una sola consulta', async () => {
    const [a, b] = await Promise.all([servicio.obtener(), servicio.obtener()]);
    expect(a).toBe(b);
    expect(supabase.getEmpresasDelUsuario).toHaveBeenCalledTimes(1);
  });

  it('reutiliza la carga reciente y vuelve a consultar al invalidar', async () => {
    await servicio.obtener();
    await servicio.obtener();
    expect(supabase.getEmpresasDelUsuario).toHaveBeenCalledTimes(1);
    servicio.invalidar();
    await servicio.obtener();
    expect(supabase.getEmpresasDelUsuario).toHaveBeenCalledTimes(2);
  });

  it('si cambia el usuario no le devuelve las empresas del anterior', async () => {
    await servicio.obtener();
    session.setUsuario({ id: 'u2', rol: 'usuario', activo: true });
    await servicio.obtener();
    expect(supabase.getEmpresasDelUsuario).toHaveBeenCalledTimes(2);
  });

  it('actualiza la empresa activa con la versión recién cargada (rol, lugares)', async () => {
    session.setEmpresaActiva({ id: 'VDC', nombre_comercial: 'VDC', ruc: '1', color: '#000' });
    await servicio.obtener();
    expect(session.empresaActiva()?.mi_rol).toBe('admin');
    expect(session.empresaActiva()?.lugares_entrega).toEqual(['EN OBRA']);
  });
});
