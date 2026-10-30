import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistorialComponent } from './historial';
import { CLAVE_BORRADOR_COTIZADOR } from '../../models';

describe('HistorialComponent - Customer Name and Document Extraction', () => {
  let comp: any;

  beforeEach(() => {
    comp = new HistorialComponent({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
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

describe('HistorialComponent - Revisiones', () => {
  const original = {
    id: 'orig-1', folio: 'VDC-00000045', empresa_id: 'VDC', estado: 'PENDIENTE',
    cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789',
    subtotal: 100, igv: 18, total: 118, incluye_igv: true,
    condiciones: { diasValidez: 30 }, items: [{ descripcion: 'Arena', cantidad: 1, precio_unitario: 100, subtotal: 100 }]
  };
  const revision = { ...original, id: 'rev-1', folio: 'VDC-00000046', cotizacion_origen_id: 'orig-1', tipo_origen: 'revision', folio_origen: 'VDC-00000045' };
  let supabase: any;
  let router: any;
  let comp: any;
  let almacen: Map<string, string>;

  beforeEach(() => {
    almacen = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => { almacen.set(k, v); },
      removeItem: (k: string) => { almacen.delete(k); }
    });
    vi.useFakeTimers();
    supabase = {
      getHistorial: vi.fn(async () => [original, revision]),
      getEmpresasDelUsuario: vi.fn(async () => []),
      actualizarEstado: vi.fn()
    };
    router = { navigate: vi.fn() };
    comp = new HistorialComponent(
      supabase, { add: vi.fn() } as any, {} as any, { markForCheck: () => {} } as any,
      { run: (fn: () => void) => fn() } as any, {} as any, router,
      { empresaActiva: () => ({ id: 'VDC' }), setEmpresaActiva: vi.fn() } as any
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sabe qué cotización fue reemplazada y por cuál', async () => {
    await comp.cargarDatos();
    expect(comp.reemplazadaPor(original)).toBe('VDC-00000046');
    expect(comp.reemplazadaPor(revision)).toBeNull();
  });

  it('abrir una revisión NO anula la original: solo prepara el borrador', async () => {
    await comp.cargarDatos();
    comp.cotizacionParaEditar = revision;
    comp.opcionEditar = { empresaOrigen: 'misma', empresaSeleccionadaId: 'VDC', accionOriginal: 'anular' };

    await comp.confirmarEdicion();

    expect(supabase.actualizarEstado).not.toHaveBeenCalled();
    const borrador = JSON.parse(almacen.get(CLAVE_BORRADOR_COTIZADOR)!);
    expect(borrador).toMatchObject({
      modo: 'revision', origen_id: 'rev-1', folio_origen: 'VDC-00000046',
      incluye_igv: true, condiciones: { diasValidez: 30 }
    });
    vi.runAllTimers();
    expect(router.navigate).toHaveBeenCalledWith(['/cotizador']);
  });

  it('una cotización ya reemplazada abre el modal en modo duplicar', async () => {
    await comp.cargarDatos();
    await comp.abrirModalEditar(original);
    expect(comp.opcionEditar.accionOriginal).toBe('mantener');
  });
});
