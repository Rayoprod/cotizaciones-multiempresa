import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CotizadorComponent } from './cotizador';
import { CLAVE_BORRADOR_COTIZADOR } from '../../models';

function almacenamientoEnMemoria() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => datos.clear()
  };
}

describe('CotizadorComponent - Guardar cotización', () => {
  const empresa = { id: 'VDC', nombre_comercial: 'VDC', mostrar_cuentas: true };
  let supabase: any;
  let pdf: any;
  let mensajes: any;
  let comp: any;

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', almacenamientoEnMemoria());
    vi.stubGlobal('navigator', { onLine: true });
    supabase = {
      crearCotizacion: vi.fn(async (datos: any) => ({ id: 'nueva', folio: 'VDC-00000072', ...datos })),
      getClientes: vi.fn(async () => [])
    };
    pdf = { generarYDescargarCotizacion: vi.fn(async () => {}) };
    mensajes = { add: vi.fn() };
    comp = new CotizadorComponent(
      { markForCheck: () => {} } as any,
      supabase, pdf, {} as any, mensajes, {} as any, {} as any,
      { empresaActiva: () => empresa } as any
    );
    comp.empresaActiva = empresa;
    comp.clienteNombre = 'CLIENTE SAC';
    comp.clienteDocumento = '20123456789';
    comp.carrito = [
      { sku: null, descripcion: 'Arena', unidad: 'm3', cantidad: 2.5, precio_unitario: 16, subtotal: 40 },
      { sku: null, descripcion: '', unidad: '', cantidad: null, precio_unitario: null, subtotal: 0 }
    ];
  });

  afterEach(() => vi.unstubAllGlobals());

  it('envía solo ítems válidos y deja el folio y los totales al servidor', async () => {
    await comp.generarPDF();

    const enviado = supabase.crearCotizacion.mock.calls[0][0];
    expect(enviado.empresaId).toBe('VDC');
    expect(enviado.items).toEqual([{ sku: null, descripcion: 'Arena', unidad: 'm3', cantidad: 2.5, precio_unitario: 16 }]);
    expect(enviado).not.toHaveProperty('folio');
    expect(enviado).not.toHaveProperty('total');
    expect(enviado.condiciones).toEqual({ mostrarValidez: true, diasValidez: 15, mostrarCuentas: true, mostrarContacto: false });
    expect(enviado.origen).toBeNull();
    expect(enviado.guardarCliente).toBe(true);
    // El PDF se arma con lo que devolvió el servidor
    expect(pdf.generarYDescargarCotizacion.mock.calls[0][0].folio).toBe('VDC-00000072');
    // Y el formulario queda listo para la siguiente
    expect(comp.clienteNombre).toBe('');
    expect(comp.carrito).toHaveLength(1);
  });

  it('las observaciones solo se envían si el campo está activado', async () => {
    comp.clienteObservaciones = 'Entrega en la mañana';
    await comp.generarPDF();
    expect(supabase.crearCotizacion.mock.calls[0][0].observaciones).toBeNull();
  });

  it('una revisión manda su origen; la anulación la hace el servidor al guardar', async () => {
    comp.borradorModo = 'revision';
    comp.borradorOrigenId = 'orig-1';
    await comp.generarPDF();
    expect(supabase.crearCotizacion.mock.calls[0][0].origen).toEqual({ id: 'orig-1', tipo: 'revision' });
  });

  it('si el servidor rechaza, muestra su motivo y no borra el formulario', async () => {
    supabase.crearCotizacion.mockRejectedValueOnce({ code: 'P0001', message: 'La cotización VDC-1 ya fue reemplazada por la revisión VDC-2.' });
    await comp.generarPDF();

    expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error', detail: 'La cotización VDC-1 ya fue reemplazada por la revisión VDC-2.'
    }));
    expect(pdf.generarYDescargarCotizacion).not.toHaveBeenCalled();
    expect(comp.clienteNombre).toBe('CLIENTE SAC');
  });

  it('sin conexión no intenta guardar', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await comp.generarPDF();
    expect(supabase.crearCotizacion).not.toHaveBeenCalled();
  });

  it('rechaza una validez fuera de 1 a 365 días antes de llamar al servidor', async () => {
    comp.condiciones.diasValidez = '0';
    await comp.generarPDF();
    expect(supabase.crearCotizacion).not.toHaveBeenCalled();
  });

  it('el borrador del historial limpia notas y códigos viejos', () => {
    sessionStorage.setItem(CLAVE_BORRADOR_COTIZADOR, JSON.stringify({
      modo: 'revision', origen_id: 'orig-1', folio_origen: 'VDC-00000045',
      cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789',
      observaciones: '[Revisión de VDC-00000040] Precio puesto en obra',
      condiciones: { diasValidez: 30, mostrarCuentas: false },
      incluye_igv: false,
      items: [{ sku: 'VAR-1234', descripcion: 'Arena', cantidad: 1, precio_unitario: 16, subtotal: 16 },
              { sku: 'PRD-0001', descripcion: 'Piedra', cantidad: 1, precio_unitario: 20, subtotal: 20 }]
    }));

    expect(comp['cargarBorradorSiExiste']()).toBe(true);
    expect(comp.borradorOrigenId).toBe('orig-1');
    expect(comp.borradorFolioPadre).toBe('VDC-00000045');
    expect(comp.clienteObservaciones).toBe('Precio puesto en obra');
    expect(comp.condiciones.mostrarObservaciones).toBe(true);
    expect(comp.condiciones.diasValidez).toBe('30');
    expect(comp.condiciones.mostrarCuentas).toBe(false);
    expect(comp.carrito.map((i: any) => i.sku)).toEqual([null, 'PRD-0001']);
    expect(comp.totalFinal).toBe(36);
    expect(sessionStorage.getItem(CLAVE_BORRADOR_COTIZADOR)).toBeNull();
  });
});

describe('CotizadorComponent - Customer Name Logic', () => {
  let comp: any;

  beforeEach(() => {
    comp = new CotizadorComponent(
      { markForCheck: () => {} } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('should resolve plain string customer names', () => {
    expect(comp.obtenerNombreClienteTexto('CONSTRUCTORA SAC')).toBe('CONSTRUCTORA SAC');
    expect(comp.obtenerNombreClienteTexto('  EMPRESA ABC  ')).toBe('EMPRESA ABC');
  });

  it('should resolve object customer names with different property keys', () => {
    expect(comp.obtenerNombreClienteTexto({ nombre_razon_social: 'CORP 1' })).toBe('CORP 1');
    expect(comp.obtenerNombreClienteTexto({ cliente_nombre: 'CORP 2' })).toBe('CORP 2');
    expect(comp.obtenerNombreClienteTexto({ clientenombre: 'CORP 3' })).toBe('CORP 3');
    expect(comp.obtenerNombreClienteTexto({ clienteNombre: 'CORP 4' })).toBe('CORP 4');
    expect(comp.obtenerNombreClienteTexto({ nombre: 'CORP 5' })).toBe('CORP 5');
    expect(comp.obtenerNombreClienteTexto({ label: 'CORP 6' })).toBe('CORP 6');
  });

  it('should filter out [object Object] or empty objects safely', () => {
    expect(comp.obtenerNombreClienteTexto('[object Object]')).toBe('');
    expect(comp.obtenerNombreClienteTexto({})).toBe('');
    expect(comp.obtenerNombreClienteTexto(null)).toBe('');
  });

  it('should not overwrite custom or cleared price when recalculating item', () => {
    comp.productosBD = [
      { codigo_sku: 'PRD-0001', descripcion: 'Bloque 15x20x40', unidad: 'und', precio_unitario_base: 4.50 }
    ];

    const item: any = {
      sku: 'PRD-0001',
      descripcion: 'Bloque 15x20x40',
      unidad: 'und',
      cantidad: 10,
      precio_unitario: 4.50,
      subtotal: 45
    };
    comp.carrito = [item];

    // User clears price input (backspace -> null)
    item.precio_unitario = null;
    comp.recalcularItem(item);

    // Price should remain null during editing and subtotal should be 0
    expect(item.precio_unitario).toBeNull();
    expect(item.subtotal).toBe(0);

    // User types new custom price (e.g. 3.80)
    item.precio_unitario = 3.80;
    comp.recalcularItem(item);
    expect(item.precio_unitario).toBe(3.80);
    expect(item.subtotal).toBe(38.00);

    // User types 0 (bonus/free sample)
    item.precio_unitario = 0;
    comp.recalcularItem(item);
    expect(item.precio_unitario).toBe(0);
    expect(item.subtotal).toBe(0);
  });

  it('should set base price when selecting suggestion or matching description from empty state', () => {
    comp.productosBD = [
      { codigo_sku: 'PRD-0001', descripcion: 'Bloque 15x20x40', unidad: 'und', precio_unitario_base: 4.50 }
    ];

    const item: any = {
      sku: '',
      descripcion: 'Bloque 15x20x40',
      unidad: '',
      cantidad: null,
      precio_unitario: null,
      subtotal: 0
    };
    comp.carrito = [item];

    comp.alCambiarDescripcion(item);
    expect(item.sku).toBe('PRD-0001');
    expect(item.unidad).toBe('und');
    expect(item.precio_unitario).toBe(4.50);
    expect(item.cantidad).toBe(1);
    expect(item.subtotal).toBe(4.50);
  });
});


describe('CotizadorComponent - Lugar de entrega por empresa', () => {
  function crear(lugares: string[]) {
    const empresa = { id: 'VDC', nombre_comercial: 'VDC', mostrar_cuentas: true, lugares_entrega: lugares };
    const supabase = {
      crearCotizacion: vi.fn(async (datos: any) => ({ id: 'nueva', folio: 'VDC-00000072', ...datos })),
      getClientes: vi.fn(async () => [])
    };
    const comp: any = new CotizadorComponent(
      { markForCheck: () => {} } as any,
      supabase as any, { generarYDescargarCotizacion: vi.fn(async () => {}) } as any, {} as any,
      { add: vi.fn() } as any, {} as any, {} as any,
      { empresaActiva: () => empresa } as any
    );
    comp.empresaActiva = empresa;
    comp.clienteNombre = 'CLIENTE SAC';
    comp.clienteDocumento = '20123456789';
    comp.carrito = [{ sku: null, descripcion: 'Arena', unidad: 'm3', cantidad: 1, precio_unitario: 16, subtotal: 16 }];
    return { comp, supabase };
  }

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', almacenamientoEnMemoria());
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('si la empresa no usa lugares, no hay opciones y no se envía lugar', async () => {
    const { comp, supabase } = crear([]);
    expect(comp.opcionesLugar()).toEqual([]);
    await comp.generarPDF();
    expect(supabase.crearCotizacion.mock.calls[0][0].lugarEntrega).toBeNull();
  });

  it('preselecciona la primera opción de la empresa', async () => {
    const { comp, supabase } = crear(['PUESTO EN CANTERA', 'PUESTO EN OBRA (CON FLETE)']);
    expect(comp.lugarSeleccionado).toBe('PUESTO EN CANTERA');
    await comp.generarPDF();
    expect(supabase.crearCotizacion.mock.calls[0][0].lugarEntrega).toBe('PUESTO EN CANTERA');
  });

  it('envía la opción que eligió el vendedor', async () => {
    const { comp, supabase } = crear(['PUESTO EN CANTERA', 'PUESTO EN OBRA (CON FLETE)']);
    comp.lugarEntrega = 'PUESTO EN OBRA (CON FLETE)';
    await comp.generarPDF();
    expect(supabase.crearCotizacion.mock.calls[0][0].lugarEntrega).toBe('PUESTO EN OBRA (CON FLETE)');
  });

  it('un lugar heredado que ya no es opción de la empresa cae en la primera', () => {
    const { comp } = crear(['PUESTO EN CANTERA', 'PUESTO EN OBRA (CON FLETE)']);
    comp.lugarEntrega = 'CANTERA';
    expect(comp.lugarSeleccionado).toBe('PUESTO EN CANTERA');
  });
});
