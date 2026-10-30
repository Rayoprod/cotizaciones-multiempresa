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
      modo_igv: 'sin_igv',
      descuento: 6,
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
    expect(comp.modoIgv).toBe('sin_igv');
    expect(comp.descuento).toBe(6);
    expect(comp.totalFinal).toBe(30);
    expect(sessionStorage.getItem(CLAVE_BORRADOR_COTIZADOR)).toBeNull();
  });

  it('envía el modo de IGV y el descuento elegidos', async () => {
    comp.modoIgv = 'incluido';
    comp.descuento = 5;
    comp.recalcularTodo();
    expect(comp.totalFinal).toBe(35);
    expect(comp.igvTotal).toBe(5.34);
    expect(comp.detalleTotal).toBe('Subtotal S/ 40.00 · Descuento -S/ 5.00 · Incluye IGV S/ 5.34');

    await comp.generarPDF();

    const enviado = supabase.crearCotizacion.mock.calls[0][0];
    expect(enviado.modoIgv).toBe('incluido');
    expect(enviado.descuento).toBe(5);
  });

  it('un descuento mayor al subtotal no se envía y dice qué falta', async () => {
    comp.descuento = 41;
    comp.recalcularTodo();
    expect(comp.descuentoValido).toBe(false);
    expect(comp.faltantes).toContain('un descuento que no supere el subtotal');

    await comp.generarPDF();

    expect(supabase.crearCotizacion).not.toHaveBeenCalled();
    expect(comp.mostrarFaltantes).toBe(true);
  });

  it('avisa si una revisión cambia de RUC o DNI', () => {
    sessionStorage.setItem(CLAVE_BORRADOR_COTIZADOR, JSON.stringify({
      modo: 'revision', origen_id: 'orig-1', folio_origen: 'VDC-00000045',
      cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789',
      modo_igv: 'sumar', descuento: 0,
      items: [{ descripcion: 'Arena', cantidad: 1, precio_unitario: 16, subtotal: 16 }]
    }));
    comp['cargarBorradorSiExiste']();

    expect(comp.clienteCambiadoEnRevision).toBe(false);
    comp.clienteDocumento = '20999999999';
    expect(comp.clienteCambiadoEnRevision).toBe(true);
    comp.borradorModo = 'duplicar';
    expect(comp.clienteCambiadoEnRevision).toBe(false);
  });

  it('el detalle del total depende del modo', () => {
    comp.modoIgv = 'sumar';
    comp.recalcularTodo();
    expect(comp.etiquetaTotal).toBe('Total con IGV');
    expect(comp.detalleTotal).toBe('Subtotal S/ 40.00 · IGV S/ 7.20');

    comp.modoIgv = 'incluido';
    comp.recalcularTodo();
    expect(comp.etiquetaTotal).toBe('Total, IGV incluido');
    expect(comp.detalleTotal).toBe('Incluye IGV S/ 6.10');

    comp.modoIgv = 'sin_igv';
    comp.recalcularTodo();
    expect(comp.etiquetaTotal).toBe('Total sin IGV');
    expect(comp.detalleTotal).toBe('');
  });

  it('al terminar, el formulario vuelve al modo de IGV de la empresa', async () => {
    comp.empresaActiva = { ...empresa, modo_igv: 'sin_igv' };
    comp.modoIgv = 'incluido';
    comp.descuento = 5;
    comp.recalcularTodo();
    await comp.generarPDF();
    expect(comp.modoIgv).toBe('sin_igv');
    expect(comp.descuento).toBeNull();
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

  it('un lugar heredado que ya no es opción de la empresa cae en la primera y lo avisa', () => {
    const { comp } = crear(['PUESTO EN CANTERA', 'PUESTO EN OBRA (CON FLETE)']);
    expect(comp.lugarYaNoDisponible).toBeNull();
    comp.lugarEntrega = 'CANTERA';
    expect(comp.lugarSeleccionado).toBe('PUESTO EN CANTERA');
    expect(comp.lugarYaNoDisponible).toBe('CANTERA');
  });
});


describe('CotizadorComponent - Unidad y catálogo', () => {
  function crear(productos: any[] = [], guardarProducto = vi.fn(async (p: any) => ({ id: 'nuevo', ...p }))) {
    const empresa = { id: 'VDC', nombre_comercial: 'VDC', mostrar_cuentas: true };
    const supabase = {
      crearCotizacion: vi.fn(async (datos: any) => ({ id: 'nueva', folio: 'VDC-00000072', ...datos })),
      getClientes: vi.fn(async () => []),
      getProductos: vi.fn(async () => productos),
      guardarProducto
    };
    const mensajes = { add: vi.fn() };
    const comp: any = new CotizadorComponent(
      { markForCheck: () => {} } as any,
      supabase as any, { generarYDescargarCotizacion: vi.fn(async () => {}) } as any, {} as any,
      mensajes as any, {} as any, {} as any,
      { empresaActiva: () => empresa } as any
    );
    comp.empresaActiva = empresa;
    return { comp, supabase, mensajes };
  }
  const catalogo = [
    { codigo_sku: 'PRD-0001', descripcion: 'Arena gruesa', unidad: 'm3', precio_unitario_base: 80 },
    { codigo_sku: 'PRD-0007', descripcion: 'Bloqueta', unidad: 'und', precio_unitario_base: 3.5 }
  ];

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', almacenamientoEnMemoria());
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('una línea nueva abre con la unidad que más usa la empresa', async () => {
    const { comp } = crear([{ unidad: 'und' }, { unidad: 'und' }, { unidad: 'm3' }]);
    comp.agregarFila();
    expect(comp.carrito[0].unidad).toBe('m3');
    await comp.cargarDatosDesdeBD();
    expect(comp.carrito[0].unidad).toBe('und');
    comp.agregarFila();
    expect(comp.carrito[1].unidad).toBe('und');
  });

  it('nunca envía una línea sin unidad', async () => {
    const { comp, supabase } = crear();
    comp.clienteNombre = 'CLIENTE SAC';
    comp.clienteDocumento = '20123456789';
    comp.carrito = [{ sku: null, descripcion: 'Arena', unidad: '  ', cantidad: 1, precio_unitario: 16, subtotal: 16 }];
    await comp.generarPDF();
    expect(supabase.crearCotizacion.mock.calls[0][0].items[0].unidad).toBe('m3');
  });

  it('al revisar una línea vieja sin unidad, toma la de la empresa', () => {
    const { comp } = crear();
    comp['aplicarBorrador']({ items: [{ descripcion: 'Arena', unidad: '', cantidad: 1, precio_unitario: 16 }] });
    expect(comp.carrito[0].unidad).toBe('m3');
  });

  it('elegir un producto toma su unidad, aunque la línea ya tuviera otra', () => {
    const { comp } = crear();
    comp.productosBD = catalogo;
    const item: any = { sku: null, descripcion: 'Bloqueta', unidad: 'm3', cantidad: null, precio_unitario: null, subtotal: 0 };
    comp.carrito = [item];
    comp.alCambiarDescripcion(item);
    expect(item.unidad).toBe('und');
  });

  it('cambiar la unidad a mano se respeta si el producto no cambia', () => {
    const { comp } = crear();
    comp.productosBD = catalogo;
    const item: any = { sku: 'PRD-0001', descripcion: 'Arena gruesa', unidad: 'viaje', cantidad: 1, precio_unitario: 80, subtotal: 80 };
    comp.carrito = [item];
    comp.alCambiarDescripcion(item);
    expect(item.unidad).toBe('viaje');
  });

  it('ofrece la unidad de la línea aunque no sea de las comunes', () => {
    const { comp } = crear();
    expect(comp.unidadesDe({ unidad: 'cubo' }).map((u: any) => u.value)).toContain('cubo');
    expect(comp.unidadesDe({ unidad: 'm3' }).filter((u: any) => u.value === 'm3')).toHaveLength(1);
  });

  it('una línea escrita a mano se puede agregar al catálogo', async () => {
    const { comp, supabase } = crear();
    comp.productosBD = catalogo;
    const item: any = { sku: null, descripcion: '  Piedra   de base ', unidad: 'm3', cantidad: 2, precio_unitario: 98, subtotal: 196 };
    expect(comp.lineaFueraDeCatalogo(item)).toBe(true);

    await comp.agregarAlCatalogo(item);

    expect(supabase.guardarProducto).toHaveBeenCalledWith({
      codigo_sku: 'PRD-0008', descripcion: 'Piedra de base', unidad: 'm3', precio_unitario_base: 98, empresa_id: 'VDC'
    });
    expect(item.sku).toBe('PRD-0008');
    expect(item.descripcion).toBe('Piedra de base');
    expect(comp.lineaFueraDeCatalogo(item)).toBe(false);
    expect(comp.productosBD).toHaveLength(3);
  });

  it('una línea vacía o ya ligada no ofrece agregarse', () => {
    const { comp } = crear();
    expect(comp.lineaFueraDeCatalogo({ sku: null, descripcion: '   ' })).toBe(false);
    expect(comp.lineaFueraDeCatalogo({ sku: 'PRD-0001', descripcion: 'Arena gruesa' })).toBe(false);
  });

  it('si falla agregar al catálogo, avisa y la línea sigue igual', async () => {
    const { comp, mensajes } = crear([], vi.fn(async () => { throw new Error('sin permiso'); }));
    const item: any = { sku: null, descripcion: 'Piedra', unidad: 'm3', cantidad: 1, precio_unitario: 10, subtotal: 10 };

    await comp.agregarAlCatalogo(item);

    expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'sin permiso' }));
    expect(item.sku).toBeNull();
    expect(comp.agregandoAlCatalogo).toBeNull();
  });

  it('el título dice qué se está haciendo', () => {
    const { comp } = crear();
    expect(comp.tituloDocumento).toBe('Nueva cotización');
    comp.borradorFolioPadre = 'VDC-00000045';
    comp.borradorModo = 'revision';
    expect(comp.tituloDocumento).toBe('Revisión de VDC-00000045');
    comp.borradorModo = 'duplicar';
    expect(comp.tituloDocumento).toBe('Copia de VDC-00000045');
  });

  it('las condiciones visibles son las que saldrán en el PDF', () => {
    const { comp } = crear();
    comp.condiciones = { mostrarValidez: true, diasValidez: '30', mostrarCuentas: true, mostrarContacto: false, mostrarObservaciones: false };
    expect(comp.condicionesActivas.map((c: any) => c.texto)).toEqual(['Validez 30 días', 'Cuentas bancarias']);

    comp.empresaActiva = { ...comp.empresaActiva, mostrar_cuentas: false };
    comp.condiciones.mostrarValidez = false;
    expect(comp.condicionesActivas).toEqual([]);
  });

  it('los totales del resumen siguen el modo de IGV', () => {
    const { comp } = crear();
    comp.carrito = [{ sku: null, descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, subtotal: 1000 }];
    comp.modoIgv = 'sumar';
    comp.recalcularTodo();
    expect(comp.filasTotales).toEqual({ antes: [['Subtotal', 1000], ['IGV (18%)', 180]], despues: null });
    comp.modoIgv = 'incluido';
    comp.recalcularTodo();
    expect(comp.filasTotales).toEqual({ antes: [], despues: ['Incluye IGV (18%):', 152.54] });
  });
});


describe('CotizadorComponent - Venta directa y ajuste', () => {
  const empresa = { id: 'VDC', nombre_comercial: 'VDC', mostrar_cuentas: true };

  function crear() {
    const supabase = {
      crearCotizacion: vi.fn(),
      crearVenta: vi.fn(async () => ({ id: 'v1', folio: 'VDC-V-00000001' })),
      ajustarVenta: vi.fn(async () => ({ id: 'v1', folio: 'VDC-V-00000001' })),
      getClientes: vi.fn(async () => [])
    };
    const router = { navigate: vi.fn() };
    const mensajes = { add: vi.fn() };
    const pdf = { generarYDescargarCotizacion: vi.fn(async () => {}) };
    const comp: any = new CotizadorComponent(
      { markForCheck: () => {} } as any,
      supabase as any, pdf as any, router as any, mensajes as any, {} as any, {} as any,
      { empresaActiva: () => empresa } as any
    );
    comp.empresaActiva = empresa;
    comp.clienteNombre = 'CLIENTE SAC';
    comp.clienteDocumento = '20123456789';
    comp.carrito = [{ sku: null, descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, subtotal: 1000 }];
    comp.modoIgv = 'sin_igv';
    comp.recalcularTodo();
    return { comp, supabase, router, mensajes, pdf };
  }

  beforeEach(() => {
    vi.stubGlobal('sessionStorage', almacenamientoEnMemoria());
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('registra la venta y lleva a su detalle, sin generar PDF', async () => {
    const { comp, supabase, router, pdf } = crear();
    comp.elegirTipo('venta');
    expect(comp.tituloDocumento).toBe('Nueva venta');
    expect(comp.textoGuardar).toBe('Registrar venta');

    comp.datosVenta.condicionPago = 'CREDITO';
    comp.datosVenta.diasCredito = 30;
    comp.datosVenta.adelantoMonto = 200;
    comp.datosVenta.adelantoMetodo = 'TRANSFERENCIA';
    await comp.guardar();

    const enviado = supabase.crearVenta.mock.calls[0][0];
    expect(enviado.items).toEqual([{ sku: null, descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100 }]);
    expect(enviado.datosVenta).toMatchObject({ condicionPago: 'CREDITO', diasCredito: 30, adelantoMonto: 200 });
    expect(enviado.condiciones).toEqual({ mostrarCuentas: true });
    expect(supabase.crearCotizacion).not.toHaveBeenCalled();
    expect(pdf.generarYDescargarCotizacion).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/ventas'], { queryParams: { venta: 'v1' } });
    expect(comp.clienteNombre).toBe('');
    expect(comp.datosVenta.adelantoMonto).toBeNull();
  });

  it('una venta exige un RUC o DNI válido; una cotización no', async () => {
    const { comp, supabase } = crear();
    comp.clienteDocumento = '123';
    expect(comp.faltantes).toEqual([]);

    comp.elegirTipo('venta');
    expect(comp.faltantes).toEqual(['un RUC de 11 dígitos o un DNI de 8']);

    await comp.guardar();
    expect(supabase.crearVenta).not.toHaveBeenCalled();
    expect(comp.mostrarFaltantes).toBe(true);
  });

  it('el adelanto no puede superar el total y necesita cómo se recibió', () => {
    const { comp } = crear();
    comp.elegirTipo('venta');
    comp.datosVenta.adelantoMonto = 1000.01;
    comp.datosVenta.adelantoMetodo = 'EFECTIVO';
    expect(comp.faltantes).toEqual(['un monto recibido que no supere el total']);
    comp.datosVenta.adelantoMonto = 100;
    comp.datosVenta.adelantoMetodo = null;
    expect(comp.faltantes).toEqual(['cómo se recibió el pago']);
  });

  it('en una venta no salen validez ni contacto de aprobación', () => {
    const { comp } = crear();
    comp.condiciones = { mostrarValidez: true, diasValidez: '15', mostrarCuentas: false, mostrarContacto: true, mostrarObservaciones: false };
    expect(comp.condicionesActivas.map((c: any) => c.texto)).toEqual(['Validez 15 días', 'Contacto de aprobación']);
    comp.elegirTipo('venta');
    expect(comp.condicionesActivas).toEqual([]);
  });

  it('si el servidor rechaza la venta, muestra su motivo y no borra nada', async () => {
    const { comp, supabase, mensajes, router } = crear();
    supabase.crearVenta.mockRejectedValueOnce({ code: '22023', message: 'La fecha de la venta no puede ser futura.' });
    comp.elegirTipo('venta');
    await comp.guardar();

    expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'La fecha de la venta no puede ser futura.' }));
    expect(router.navigate).not.toHaveBeenCalled();
    expect(comp.clienteNombre).toBe('CLIENTE SAC');
    expect(comp.guardando).toBe(false);
  });

  describe('ajuste', () => {
    function conAjuste() {
      const creado = crear();
      sessionStorage.setItem(CLAVE_BORRADOR_COTIZADOR, JSON.stringify({
        modo: 'ajuste', origen_id: 'v1', folio_origen: 'VDC-V-00000001',
        cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789',
        modo_igv: 'sin_igv', descuento: 0, pagado: 300,
        datos_venta: { fecha: '2026-10-01', condicionPago: 'CREDITO', diasCredito: 30 },
        items: [{ id: 'linea-1', sku: 'PRD-0001', descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, subtotal: 1000 }]
      }));
      creado.comp['cargarBorradorSiExiste']();
      return creado;
    }

    it('abre como venta, sin selector, con el folio en el título y lo pagado', () => {
      const { comp } = conAjuste();
      expect(comp.esVenta).toBe(true);
      expect(comp.puedeElegirTipo).toBe(false);
      expect(comp.tituloDocumento).toBe('Ajustar VDC-V-00000001');
      expect(comp.textoGuardar).toBe('Guardar ajuste');
      expect(comp.pagadoDeLaVenta).toBe(300);
      expect(comp.datosVenta).toMatchObject({ fecha: '2026-10-01', condicionPago: 'CREDITO', diasCredito: 30 });
    });

    it('pide motivo y no deja bajar de lo pagado', () => {
      const { comp } = conAjuste();
      expect(comp.faltantes).toEqual(['el motivo del ajuste']);
      comp.motivoAjuste = 'Pidió menos';
      comp.carrito[0].cantidad = 2;
      comp.recalcularItem(comp.carrito[0]);
      expect(comp.faltantes).toEqual(['un total de al menos S/ 300.00, lo que ya se pagó']);
    });

    it('conserva el id de las líneas que siguen y vuelve a la venta', async () => {
      const { comp, supabase, router } = conAjuste();
      comp.motivoAjuste = 'Pidió 5 m³ más';
      comp.carrito[0].cantidad = 15;
      comp.recalcularItem(comp.carrito[0]);
      comp.agregarFila();
      Object.assign(comp.carrito[1], { descripcion: 'Flete', cantidad: 1, precio_unitario: 50 });

      await comp.guardar();

      const enviado = supabase.ajustarVenta.mock.calls[0][0];
      expect(enviado.ventaId).toBe('v1');
      expect(enviado.motivo).toBe('Pidió 5 m³ más');
      expect(enviado.items.map((i: any) => i.id)).toEqual(['linea-1', null]);
      expect(enviado.datosVenta.fecha).toBe('2026-10-01');
      expect(router.navigate).toHaveBeenCalledWith(['/ventas'], { queryParams: { venta: 'v1' } });
      // El formulario queda limpio para lo siguiente, y como cotización
      expect(comp.esVenta).toBe(false);
      expect(comp.borradorModo).toBeNull();
      expect(comp.pagadoDeLaVenta).toBe(0);
    });
  });

  it('lo que se estaba armando se recupera con su tipo y sus datos de venta', () => {
    const { comp } = crear();
    comp.elegirTipo('venta');
    comp.datosVenta.diasCredito = 45;
    comp.datosVenta.condicionPago = 'CREDITO';
    comp['guardarEnCurso']();

    comp.tipoRegistro = 'cotizacion';
    comp.datosVenta = {};
    expect(comp['recuperarEnCurso']()).toBe(true);
    expect(comp.tipoRegistro).toBe('venta');
    expect(comp.datosVenta).toMatchObject({ condicionPago: 'CREDITO', diasCredito: 45 });
  });
});
