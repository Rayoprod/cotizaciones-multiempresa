import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColaCampoService, NuevaSalida, conLimite } from './cola-campo.service';
import { IDatosCantera, ISalidaDeHoy, ISalidaLocal } from '../models';

const NUEVA: NuevaSalida = {
  venta_id: 'v1', venta_item_id: 'l1', folio_venta: 'V-1', cliente: 'CLIENTE', producto_id: null,
  material: 'Arena', unidad: 'm3', cantidad: 25, placa: 'abc-123', chofer: null, guia: null
};

const DATOS: IDatosCantera = { capacidad_m3: 25, ventas: [], vehiculos: [], materiales: [], salidas_hoy: [] };

/** IndexedDB de mentira: guarda copias, como la de verdad. */
function almacenFalso() {
  const tablas: Record<string, Map<string, any>> = { salidas: new Map(), fotos: new Map() };
  const copia = <T>(valor: T): T => JSON.parse(JSON.stringify(valor));
  return {
    tablas,
    falla: false,
    async guardar(tabla: string, fila: any) {
      if (this.falla) throw new Error('Disco lleno');
      tablas[tabla].set(fila.id ?? fila.empresa_id, copia(fila));
    },
    async listar(tabla: string) { return [...tablas[tabla].values()].map(copia); },
    async leer(tabla: string, clave: string) {
      const fila = tablas[tabla].get(clave);
      return fila ? copia(fila) : null;
    },
    async borrar(tabla: string, clave: string) { tablas[tabla].delete(clave); }
  };
}

const SIN_SENAL = () => Promise.reject(new TypeError('Failed to fetch'));
const TOKEN_VENCIDO = () => Promise.reject({ code: '42501', message: 'permission denied for function registrar_salida' });
const RECHAZO = (message: string) => () => Promise.reject({ code: '22023', message });

describe('ColaCampoService', () => {
  let almacen: ReturnType<typeof almacenFalso>;
  let supabase: any;
  let empresas: any;
  let session: any;
  let cola: ColaCampoService;
  let usuario: any;

  const filas = () => [...almacen.tablas.salidas.values()] as ISalidaLocal[];
  /** Deja terminar lo que se lanzó sin esperar. */
  const asentar = async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
    for (let i = 0; i < 40; i++) await Promise.resolve();
  };

  beforeEach(() => {
    almacen = almacenFalso();
    supabase = {
      registrarSalida: vi.fn(async () => {}),
      anularSalida: vi.fn(async () => ({})),
      datosCantera: vi.fn(async () => DATOS)
    };
    empresas = { obtener: vi.fn(async () => []) };
    usuario = { id: 'u1', email: 'enc@demo.test' };
    session = {
      usuario: () => usuario,
      empresaActiva: () => ({ id: 'VDC' }),
      modoCampo: () => true,
      activarModoCampo: vi.fn()
    };
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' });
    vi.stubGlobal('crypto', { randomUUID: (() => { let n = 0; return () => `id-${++n}`; })() });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    cola = new ColaCampoService(almacen as any, supabase, session, empresas);
  });

  afterEach(async () => {
    cola.detener();
    await asentar();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('anotar sin señal', () => {
    beforeEach(() => { supabase.registrarSalida.mockImplementation(SIN_SENAL); });

    it('queda guardada en el celular, con la placa normalizada y por enviar', async () => {
      const salida = await cola.registrar(NUEVA);
      expect(filas()[0]).toMatchObject({ id: salida.id, placa: 'ABC123', envio: 'pendiente', usuario_id: 'u1', empresa_id: 'VDC' });
      expect(cola.locales()).toHaveLength(1);
      await asentar();
      expect(cola.porEnviar()).toBe(1);
      expect(cola.fallo()).toBe(true);
    });

    it('si el celular no deja guardar, avisa y no la da por guardada', async () => {
      almacen.falla = true;
      await expect(cola.registrar(NUEVA)).rejects.toThrow('Disco lleno');
      expect(cola.locales()).toEqual([]);
    });

    it('sigue ahí al volver a abrir la app', async () => {
      await cola.registrar(NUEVA);
      await asentar();
      const otra = new ColaCampoService(almacen as any, supabase, session, empresas);
      await otra.iniciar();
      otra.detener();
      expect(otra.locales()).toHaveLength(1);
      expect(otra.porEnviar()).toBe(1);
    });

    it('al primer corte no intenta las siguientes: fallarían igual', async () => {
      await cola.registrar(NUEVA);
      await cola.registrar(NUEVA);
      await cola.registrar(NUEVA);
      await asentar();
      supabase.registrarSalida.mockClear();
      await cola.sincronizar(true);
      expect(supabase.registrarSalida).toHaveBeenCalledTimes(1);
    });

    it('sin red no gasta batería intentando', async () => {
      await cola.registrar(NUEVA);
      await asentar();
      supabase.registrarSalida.mockClear();
      vi.stubGlobal('navigator', { onLine: false });
      await cola.sincronizar();
      expect(supabase.registrarSalida).not.toHaveBeenCalled();
    });

    it('un token vencido sin señal no es un rechazo: se reintenta', async () => {
      supabase.registrarSalida.mockImplementation(TOKEN_VENCIDO);
      await cola.registrar(NUEVA);
      await asentar();
      expect(filas()[0].envio).toBe('pendiente');
      expect(cola.fallo()).toBe(true);
    });

    it('un pedido colgado no traba la cola', async () => {
      await expect(conLimite(new Promise(() => {}), 5)).rejects.toThrow('tardó demasiado');
    });
  });

  describe('al volver la señal', () => {
    it('envía en orden, marca cada una y baja la copia', async () => {
      supabase.registrarSalida.mockImplementation(SIN_SENAL);
      await cola.registrar({ ...NUEVA, placa: 'AAA111' });
      await cola.registrar({ ...NUEVA, placa: 'BBB222' });
      await asentar();

      const enviadas: string[] = [];
      supabase.registrarSalida.mockImplementation(async (s: ISalidaLocal) => { enviadas.push(s.placa); });
      supabase.datosCantera.mockClear();
      await cola.sincronizar(true);

      expect(enviadas).toEqual(['AAA111', 'BBB222']);
      expect(filas().every(f => f.envio === 'enviada' && !!f.enviada_en)).toBe(true);
      expect(cola.porEnviar()).toBe(0);
      expect(cola.fallo()).toBe(false);
      expect(supabase.datosCantera).toHaveBeenCalledWith('VDC');
      expect(cola.foto()?.datos).toEqual(DATOS);
    });

    it('un rechazo queda marcado y no detiene a las demás', async () => {
      supabase.registrarSalida.mockImplementation(SIN_SENAL);
      await cola.registrar({ ...NUEVA, placa: 'MALA11' });
      await cola.registrar({ ...NUEVA, placa: 'BUEN22' });
      await asentar();

      supabase.registrarSalida.mockImplementation(async (s: ISalidaLocal) => {
        if (s.placa === 'MALA11') throw { code: '22023', message: 'Escribe la placa del volquete.' };
      });
      await cola.sincronizar(true);

      const [mala, buena] = filas();
      expect(mala).toMatchObject({ envio: 'con_problema', problema: 'Escribe la placa del volquete.' });
      expect(buena.envio).toBe('enviada');
      expect(cola.conProblema()).toBe(1);
      expect(cola.porEnviar()).toBe(0);
      expect(cola.fallo()).toBe(false);
    });

    it('lo rechazado no se reintenta solo, pero se puede pedir', async () => {
      supabase.registrarSalida.mockImplementation(RECHAZO('No'));
      await cola.registrar(NUEVA);
      await asentar();
      expect(filas()[0].envio).toBe('con_problema');

      supabase.registrarSalida.mockClear();
      await cola.sincronizar(true);
      expect(supabase.registrarSalida).not.toHaveBeenCalled();

      supabase.registrarSalida.mockImplementation(async () => {});
      await cola.reintentar(filas()[0].id);
      await asentar();
      expect(filas()[0]).toMatchObject({ envio: 'enviada' });
      expect(filas()[0].problema).toBeUndefined();
    });

    it('si se corta a la mitad, sigue desde la que falta y no repite las enviadas', async () => {
      supabase.registrarSalida.mockImplementation(SIN_SENAL);
      await cola.registrar({ ...NUEVA, placa: 'AAA111' });
      await cola.registrar({ ...NUEVA, placa: 'BBB222' });
      await asentar();

      let intentos = 0;
      supabase.registrarSalida.mockImplementation(async () => {
        if (++intentos === 2) throw new TypeError('Failed to fetch');
      });
      await cola.sincronizar(true);
      expect(filas().map(f => f.envio)).toEqual(['enviada', 'pendiente']);

      supabase.registrarSalida.mockClear();
      supabase.registrarSalida.mockImplementation(async () => {});
      await cola.sincronizar(true);
      expect(supabase.registrarSalida).toHaveBeenCalledTimes(1);
      expect(filas().map(f => f.envio)).toEqual(['enviada', 'enviada']);
    });

    it('lo anotado mientras se enviaba sale en la vuelta siguiente', async () => {
      let soltar: () => void = () => {};
      supabase.registrarSalida.mockImplementationOnce(() => new Promise<void>(r => { soltar = r; }));
      await cola.registrar({ ...NUEVA, placa: 'AAA111' });
      await asentar();
      await cola.registrar({ ...NUEVA, placa: 'BBB222' });
      soltar();
      await asentar();
      expect(filas().map(f => f.envio)).toEqual(['enviada', 'enviada']);
    });

    it('si no se puede bajar la copia, lo enviado queda enviado', async () => {
      supabase.datosCantera.mockImplementation(SIN_SENAL);
      await cola.registrar(NUEVA);
      await asentar();
      expect(filas()[0].envio).toBe('enviada');
      expect(cola.fallo()).toBe(true);
    });

    it('refresca la empresa y la copia de modo cantera: el rol o el módulo pudieron cambiar', async () => {
      await cola.sincronizar(true);
      expect(empresas.obtener).toHaveBeenCalledWith(true);
      expect(session.activarModoCampo).toHaveBeenCalled();
    });

    it('sin nada que enviar y con la copia fresca, no pide nada', async () => {
      await cola.sincronizar(true);
      supabase.datosCantera.mockClear();
      await cola.sincronizar();
      expect(supabase.datosCantera).not.toHaveBeenCalled();
    });
  });

  describe('anular', () => {
    it('una que no se envió: se envían las dos cosas, en orden', async () => {
      supabase.registrarSalida.mockImplementation(SIN_SENAL);
      const salida = await cola.registrar(NUEVA);
      await asentar();
      await cola.anular(salida.id, 'Me equivoqué');
      await asentar();
      expect(filas()[0].anulacion).toMatchObject({ motivo: 'Me equivoqué', envio: 'pendiente' });
      expect(cola.porEnviar()).toBe(1);

      const orden: string[] = [];
      supabase.registrarSalida.mockImplementation(async () => { orden.push('registrar'); });
      supabase.anularSalida.mockImplementation(async () => { orden.push('anular'); return {}; });
      await cola.sincronizar(true);
      expect(orden).toEqual(['registrar', 'anular']);
      expect(filas()[0].anulacion?.envio).toBe('enviada');
      expect(cola.porEnviar()).toBe(0);
    });

    it('lleva la hora a la que se anuló en el celular', async () => {
      const salida = await cola.registrar(NUEVA);
      await asentar();
      await cola.anular(salida.id, 'Mal');
      await asentar();
      expect(supabase.anularSalida).toHaveBeenCalledWith(salida.id, 'Mal', filas()[0].anulacion?.anulada_en);
    });

    it('anularla justo mientras se envía no pierde la anulación', async () => {
      let soltar: () => void = () => {};
      supabase.registrarSalida.mockImplementationOnce(() => new Promise<void>(r => { soltar = r; }));
      const salida = await cola.registrar(NUEVA);
      await asentar();
      await cola.anular(salida.id, 'Justo a tiempo');
      soltar();
      await asentar();
      expect(filas()[0]).toMatchObject({ envio: 'enviada' });
      expect(filas()[0].anulacion).toMatchObject({ motivo: 'Justo a tiempo', envio: 'enviada' });
      expect(supabase.anularSalida).toHaveBeenCalledTimes(1);
    });

    it('si el servidor rechaza registrarla, no intenta anularla', async () => {
      supabase.registrarSalida.mockImplementation(SIN_SENAL);
      const salida = await cola.registrar(NUEVA);
      await asentar();
      await cola.anular(salida.id, 'Mal');
      await asentar();
      supabase.registrarSalida.mockImplementation(RECHAZO('No'));
      await cola.sincronizar(true);
      expect(supabase.anularSalida).not.toHaveBeenCalled();
      expect(filas()[0].envio).toBe('con_problema');
    });

    it('un rechazo de la anulación queda marcado', async () => {
      const salida = await cola.registrar(NUEVA);
      await asentar();
      supabase.anularSalida.mockImplementation(RECHAZO('Solo se anula el mismo día.'));
      await cola.anular(salida.id, 'Tarde');
      await asentar();
      expect(filas()[0].anulacion).toMatchObject({ envio: 'con_problema', problema: 'Solo se anula el mismo día.' });
      expect(cola.conProblema()).toBe(1);
    });

    it('una que llegó de otro celular se copia aquí para enviar la anulación', async () => {
      const delServidor: ISalidaDeHoy = {
        id: 'otra', venta_id: 'v1', venta_item_id: 'l1', folio_venta: 'V-1', cliente: 'C', material: 'Arena', unidad: 'm3', cantidad: 20,
        placa: 'DEF456', chofer: null, guia: null, fecha: '2026-10-31', registrada_en: '2026-10-31T09:00:00.000Z', estado: 'ACTIVA',
        creado_por: 'u1', creado_por_nombre: 'Yo', motivo_anulacion: null
      };
      supabase.anularSalida.mockImplementation(SIN_SENAL);
      await cola.anular('otra', 'Mal', delServidor);
      await asentar();
      expect(filas()[0]).toMatchObject({ id: 'otra', envio: 'enviada' });
      expect(filas()[0].anulacion?.envio).toBe('pendiente');
      expect(supabase.registrarSalida).not.toHaveBeenCalled();
    });

    it('anular dos veces conserva el primer motivo', async () => {
      const salida = await cola.registrar(NUEVA);
      await cola.anular(salida.id, 'Primero');
      await cola.anular(salida.id, 'Segundo');
      expect(filas()[0].anulacion?.motivo).toBe('Primero');
    });
  });

  describe('quién y de qué empresa', () => {
    beforeEach(() => { supabase.registrarSalida.mockImplementation(SIN_SENAL); });

    it('no se envían las de otra cuenta: quedarían a nombre de quien entró', async () => {
      await cola.registrar(NUEVA);
      await asentar();

      usuario = { id: 'u2', email: 'otro@demo.test' };
      supabase.registrarSalida.mockClear();
      supabase.registrarSalida.mockImplementation(async () => {});
      await cola.iniciar();
      await asentar();

      expect(supabase.registrarSalida).not.toHaveBeenCalled();
      expect(cola.locales()).toEqual([]);
      expect(filas()[0].envio).toBe('pendiente');
    });

    it('se envían las de la misma cuenta en otra empresa', async () => {
      await cola.registrar(NUEVA);
      await asentar();

      session.empresaActiva = () => ({ id: 'WM' });
      supabase.registrarSalida.mockImplementation(async () => {});
      await cola.iniciar();
      await asentar();

      expect(filas()[0].envio).toBe('enviada');
      expect(cola.locales()).toEqual([]);
    });
  });

  describe('limpieza', () => {
    const vieja = (extra: Partial<ISalidaLocal>): ISalidaLocal => ({
      id: 'vieja', empresa_id: 'VDC', usuario_id: 'u1', venta_id: null, venta_item_id: null, folio_venta: null, cliente: 'C', producto_id: null,
      material: 'Arena', unidad: 'm3', cantidad: 1, placa: 'ABC123', chofer: null, guia: null, fecha: '2020-01-01',
      registrada_en: '2020-01-01T10:00:00.000Z', envio: 'enviada', ...extra
    });

    it('borra lo enviado de hace días', async () => {
      await almacen.guardar('salidas', vieja({}));
      await cola.iniciar();
      expect(almacen.tablas.salidas.size).toBe(0);
    });

    it('nunca borra lo que falta enviar, por vieja que sea', async () => {
      supabase.registrarSalida.mockImplementation(SIN_SENAL);
      await almacen.guardar('salidas', vieja({ envio: 'pendiente' }));
      await almacen.guardar('salidas', vieja({ id: 'problema', envio: 'con_problema', problema: 'x' }));
      await almacen.guardar('salidas', vieja({ id: 'anulada', anulacion: { motivo: 'x', anulada_en: '', envio: 'pendiente' } }));
      await cola.iniciar();
      await asentar();
      expect(almacen.tablas.salidas.size).toBe(3);
    });
  });
});
