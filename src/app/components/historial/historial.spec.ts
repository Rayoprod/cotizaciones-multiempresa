import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistorialComponent } from './historial';
import { CLAVE_BORRADOR_COTIZADOR } from '../../models';

describe('HistorialComponent - Customer Name and Document Extraction', () => {
  let comp: any;

  beforeEach(() => {
    comp = new HistorialComponent({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('should extract client name from all quotation variations', () => {
    expect(comp.obtenerNombreCliente({ cliente_nombre: 'CLIENTE A' })).toBe('CLIENTE A');
    expect(comp.obtenerNombreCliente({ clientenombre: 'CLIENTE B' })).toBe('CLIENTE B');
    expect(comp.obtenerNombreCliente({ clienteNombre: 'CLIENTE C' })).toBe('CLIENTE C');
    expect(comp.obtenerNombreCliente({ nombre_razon_social: 'CLIENTE D' })).toBe('CLIENTE D');
    expect(comp.obtenerNombreCliente({ cliente_nombre: { nombre: 'CLIENTE E' } })).toBe('CLIENTE E');
  });

  it('should return "Sin nombre" if name is missing or invalid', () => {
    expect(comp.obtenerNombreCliente({})).toBe('Sin nombre');
    expect(comp.obtenerNombreCliente({ cliente_nombre: '[object Object]' })).toBe('Sin nombre');
    expect(comp.obtenerNombreCliente({ cliente_nombre: '' })).toBe('Sin nombre');
  });
});

describe('HistorialComponent - Revisiones y estados', () => {
  const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();
  const original = {
    id: 'orig-1', folio: 'VDC-00000045', empresa_id: 'VDC', estado: 'ANULADA', fecha: hace(3),
    cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789',
    subtotal: 100, igv: 18, total: 118, incluye_igv: true,
    condiciones: { diasValidez: 30 }, items: [{ descripcion: 'Arena', cantidad: 1, precio_unitario: 100, subtotal: 100 }]
  };
  const revision = { ...original, id: 'rev-1', folio: 'VDC-00000046', estado: 'PENDIENTE', cotizacion_origen_id: 'orig-1', tipo_origen: 'revision', folio_origen: 'VDC-00000045' };
  const vencida = { ...original, id: 'ven-1', folio: 'VDC-00000030', estado: 'PENDIENTE', fecha: hace(40), total: 50 };
  const aprobada = { ...original, id: 'apr-1', folio: 'VDC-00000020', estado: 'APROBADA', total: 200 };
  const conVenta = { ...original, id: 'ven-2', folio: 'VDC-00000021', estado: 'APROBADA', total: 300 };
  const oculta = { ...original, id: 'ocu-1', folio: 'VDC-00000010', estado: 'PENDIENTE', total: 900, oculta: true };
  let supabase: any;
  let router: any;
  let confirmar: any;
  let mensajes: any;
  let comp: any;
  let almacen: Map<string, string>;
  const etiquetas = (cot: any) => comp.accionesDe(cot).filter((a: any) => !a.separator).map((a: any) => a.label);

  beforeEach(async () => {
    almacen = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => { almacen.set(k, v); },
      removeItem: (k: string) => { almacen.delete(k); }
    });
    supabase = {
      getHistorial: vi.fn(async () => [original, revision, vencida, aprobada, conVenta, oculta]),
      getVentasDeCotizaciones: vi.fn(async () => [{ id: 'venta-1', folio: 'VDC-V-00000001', cotizacion_id: 'ven-2' }]),
      actualizarEstado: vi.fn(async (id: string, estado: string) => ({ id, estado, estado_cambiado_por_nombre: 'Ana Quispe', estado_cambiado_en: hace(0) })),
      actualizarVisibilidadCotizacion: vi.fn(async () => {})
    };
    router = { navigate: vi.fn() };
    confirmar = { confirm: vi.fn() };
    mensajes = { add: vi.fn() };
    comp = new HistorialComponent(
      supabase, mensajes, { generarYDescargarCotizacion: vi.fn(async () => {}) } as any, { markForCheck: () => {} } as any,
      confirmar, router, { empresaActiva: () => ({ id: 'VDC' }) } as any
    );
    await comp.cargarDatos();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sabe qué cotización fue reemplazada y por cuál', () => {
    expect(comp.reemplazadaPor(original)).toBe('VDC-00000046');
    expect(comp.reemplazadaPor(revision)).toBeNull();
  });

  it('solo se revisa lo Pendiente; aprobar es convertir en venta', () => {
    expect(etiquetas(revision)).toEqual(['Revisar', 'Duplicar', 'Convertir en venta', 'Anular', 'Ocultar']);
    expect(etiquetas(aprobada)).toEqual(['Duplicar', 'Registrar venta', 'Volver a Pendiente', 'Anular', 'Ocultar']);
    expect(etiquetas(original)).toEqual(['Duplicar', 'Ocultar']);
  });

  it('con una venta activa solo se ve la venta: el estado no se toca', () => {
    expect(comp.ventaDe(conVenta)).toEqual(expect.objectContaining({ folio: 'VDC-V-00000001' }));
    expect(etiquetas(conVenta)).toEqual(['Ver venta', 'Duplicar', 'Ocultar']);

    comp.accionesDe(conVenta).find((a: any) => a.label === 'Ver venta').command();
    expect(router.navigate).toHaveBeenCalledWith(['/ventas'], { queryParams: { venta: 'venta-1' } });
  });

  it('convertir abre la ventana, y al terminar lleva a la venta', () => {
    comp.dialogoConvertir = { abrir: vi.fn() };
    comp.accionesDe(revision).find((a: any) => a.label === 'Convertir en venta').command();
    expect(comp.dialogoConvertir.abrir).toHaveBeenCalledWith(revision);

    comp.alConvertir({ id: 'venta-2', folio: 'VDC-V-00000002' });
    expect(router.navigate).toHaveBeenCalledWith(['/ventas'], { queryParams: { venta: 'venta-2' } });
  });

  it('una vencida sigue siendo Pendiente: se puede vender o revisar', () => {
    expect(comp.getEstadoLabel(vencida)).toBe('Vencida');
    expect(etiquetas(vencida)).toContain('Revisar');
    expect(etiquetas(vencida)).toContain('Convertir en venta');
    expect(comp.detalleEstado(vencida)).toMatch(/^Venció el /);
    expect(comp.detalleEstado(revision)).toMatch(/^Vence el /);
  });

  it('revisar NO anula la original: solo prepara el borrador y abre el cotizador', () => {
    comp.abrirEnCotizador(revision, 'revision');

    expect(supabase.actualizarEstado).not.toHaveBeenCalled();
    expect(JSON.parse(almacen.get(CLAVE_BORRADOR_COTIZADOR)!)).toMatchObject({
      modo: 'revision', origen_id: 'rev-1', folio_origen: 'VDC-00000046',
      modo_igv: 'sumar', descuento: 0, condiciones: { diasValidez: 30 }
    });
    expect(router.navigate).toHaveBeenCalledWith(['/cotizador']);
  });

  it('el borrador conserva el modo de IGV y el descuento', () => {
    comp.abrirEnCotizador({ ...revision, precios_con_igv: true, descuento_global: 25 }, 'duplicar');
    expect(JSON.parse(almacen.get(CLAVE_BORRADOR_COTIZADOR)!)).toMatchObject({ modo: 'duplicar', modo_igv: 'incluido', descuento: 25 });
  });

  it('los cambios de estado piden confirmación antes de guardarse', async () => {
    comp.confirmarCambioEstado(revision, 'ANULADA');
    expect(supabase.actualizarEstado).not.toHaveBeenCalled();
    expect(confirmar.confirm.mock.calls[0][0].message).toContain('no se puede deshacer');

    await confirmar.confirm.mock.calls[0][0].accept();
    expect(supabase.actualizarEstado).toHaveBeenCalledWith('rev-1', 'ANULADA');
    const fila = comp.cotizaciones.find((c: any) => c.id === 'rev-1');
    expect(fila.estado).toBe('ANULADA');
    expect(comp.detalleEstado(fila)).toMatch(/^Ana Quispe · /);
  });

  it('muestra el motivo si el servidor rechaza el cambio de estado', async () => {
    supabase.actualizarEstado.mockRejectedValueOnce({ code: 'P0001', message: 'La cotización VDC-1 está anulada y no se puede reactivar.' });
    await comp.cambiarEstado(revision, 'ANULADA');
    expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'La cotización VDC-1 está anulada y no se puede reactivar.' }));
    expect(supabase.getHistorial).toHaveBeenCalledTimes(2);
  });

  it('por cerrar no cuenta vencidas ni ocultas, y el filtro de estado no cambia los KPI', () => {
    expect(comp.conteos).toEqual({ TODAS: 5, PENDIENTE: 1, VENCIDA: 1, APROBADA: 2, ANULADA: 1 });
    expect(comp.totalPorCerrar).toBe(118);
    expect(comp.totalAprobado).toBe(500);

    comp.elegirFiltroEstado('VENCIDA');

    expect(comp.cotizacionesFiltradas.map((c: any) => c.id)).toEqual(['ven-1']);
    expect(comp.totalPorCerrar).toBe(118);
    expect(comp.conteos.TODAS).toBe(5);
  });

  it('ocultar no pide confirmación y se puede ver después', async () => {
    await comp.alternarOculta(revision);
    expect(confirmar.confirm).not.toHaveBeenCalled();
    expect(supabase.actualizarVisibilidadCotizacion).toHaveBeenCalledWith('rev-1', true);
    expect(comp.cantidadOcultas).toBe(2);
    expect(comp.cotizacionesFiltradas.map((c: any) => c.id)).not.toContain('rev-1');

    comp.onToggleOcultas();
    expect(comp.cotizacionesFiltradas.map((c: any) => c.id)).toContain('rev-1');
  });

  it('al descargar, el PDF sabe qué revisión reemplazó a la anulada', async () => {
    await comp.descargarPDF(original);
    const llamada = comp['pdfSvc'].generarYDescargarCotizacion.mock.calls[0];
    expect(llamada[3]).toBe('VDC-00000046');
  });
});
