import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VentasComponent, cumpleFiltroVenta } from './ventas';
import { DialogoConvertirComponent } from './dialogo-convertir';
import { IVenta, fechaIso } from '../../models';

const venta = (extra: Partial<IVenta> = {}): IVenta => ({
  id: 'v1', folio: 'WM-V-00000001', fecha: '2026-10-01', empresa_id: 'WM', estado: 'ACTIVA', estado_entrega: 'PENDIENTE',
  cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789', subtotal: 100, descuento_global: 0, igv: 18, total: 118,
  incluye_igv: true, precios_con_igv: false, pagado: 0, saldo: 118, condicion_pago: 'CONTADO',
  venta_items: [], pagos: [], venta_comprobantes: [], ...extra
});

const hace = (dias: number) => fechaIso(new Date(Date.now() - dias * 86400000));

describe('cumpleFiltroVenta', () => {
  const hoy = new Date(2026, 9, 30);

  it('separa cobro y entrega: una venta puede estar en los dos', () => {
    const v = venta();
    expect(cumpleFiltroVenta(v, 'POR_COBRAR', hoy)).toBe(true);
    expect(cumpleFiltroVenta(v, 'POR_ENTREGAR', hoy)).toBe(true);
  });

  it('lo anulado no cuenta ni por cobrar ni por entregar', () => {
    const v = venta({ estado: 'ANULADA' });
    expect(cumpleFiltroVenta(v, 'POR_COBRAR', hoy)).toBe(false);
    expect(cumpleFiltroVenta(v, 'POR_ENTREGAR', hoy)).toBe(false);
    expect(cumpleFiltroVenta(v, 'ANULADAS', hoy)).toBe(true);
    expect(cumpleFiltroVenta(v, 'TODAS', hoy)).toBe(true);
  });

  it('pagada y entregada sale de ambos filtros', () => {
    const v = venta({ pagado: 118, saldo: 0, estado_entrega: 'ENTREGADA' });
    expect(cumpleFiltroVenta(v, 'POR_COBRAR', hoy)).toBe(false);
    expect(cumpleFiltroVenta(v, 'POR_ENTREGAR', hoy)).toBe(false);
  });

  it('una entrega parcial sigue por entregar', () => {
    expect(cumpleFiltroVenta(venta({ estado_entrega: 'PARCIAL' }), 'POR_ENTREGAR', hoy)).toBe(true);
  });

  it('por facturar es lo que tiene IGV y aún no se factura todo', () => {
    const comprobante: any = { numero: 'F001-1', monto: 118, anulado: false };
    expect(cumpleFiltroVenta(venta(), 'POR_FACTURAR', hoy)).toBe(true);
    expect(cumpleFiltroVenta(venta({ venta_comprobantes: [{ ...comprobante, monto: 18 }] }), 'POR_FACTURAR', hoy)).toBe(true);
    expect(cumpleFiltroVenta(venta({ venta_comprobantes: [comprobante] }), 'POR_FACTURAR', hoy)).toBe(false);
    expect(cumpleFiltroVenta(venta({ incluye_igv: false }), 'POR_FACTURAR', hoy)).toBe(false);
    expect(cumpleFiltroVenta(venta({ estado: 'ANULADA' }), 'POR_FACTURAR', hoy)).toBe(false);
  });

  it('vencida es con saldo y fecha pasada', () => {
    expect(cumpleFiltroVenta(venta({ vence_el: '2026-10-29' }), 'VENCIDAS', hoy)).toBe(true);
    expect(cumpleFiltroVenta(venta({ vence_el: '2026-10-30' }), 'VENCIDAS', hoy)).toBe(false);
  });
});

describe('VentasComponent', () => {
  const ventas = [
    venta({ id: 'a', folio: 'WM-V-3', fecha: hace(1), cliente_nombre: 'ANDINA SAC', total: 1000, pagado: 400, saldo: 600 }),
    venta({ id: 'b', folio: 'WM-V-2', fecha: hace(5), cliente_nombre: 'PACIFICO', cliente_documento: '44556677', total: 500, pagado: 500, saldo: 0, estado_entrega: 'ENTREGADA', venta_comprobantes: [{ numero: 'F001-77', tipo: 'FACTURA', monto: 500, anulado: false } as any] }),
    venta({ id: 'c', folio: 'WM-V-1', fecha: hace(40), cliente_nombre: 'ATRASADO', total: 300, saldo: 300, vence_el: hace(10) }),
    venta({ id: 'd', folio: 'WM-V-0', fecha: hace(50), cliente_nombre: 'ANULADO', total: 9999, saldo: 9999, estado: 'ANULADA' })
  ];
  let supabase: any;
  let router: any;
  let ruta: any;
  let comp: any;

  beforeEach(async () => {
    supabase = { getVentas: vi.fn(async () => ventas) };
    router = { navigate: vi.fn() };
    ruta = { snapshot: { queryParamMap: new Map() } };
    comp = new VentasComponent(
      supabase, { add: vi.fn() } as any, { markForCheck: () => {} } as any, router, ruta,
      { empresaActiva: () => ({ id: 'WM', nombre_comercial: 'WM' }) } as any
    );
    comp.acciones = { verDetalle: vi.fn(), menuDe: vi.fn(() => [{ label: 'Ver detalle' }]) };
    await comp.cargarDatos();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('los KPI no suman lo anulado', () => {
    expect(comp.totalVendido).toBe(1800);
    expect(comp.totalCobrado).toBe(900);
    expect(comp.totalPorCobrar).toBe(900);
    expect(comp.conteos).toEqual({ TODAS: 4, POR_COBRAR: 2, VENCIDAS: 1, POR_ENTREGAR: 2, POR_FACTURAR: 2, ANULADAS: 1 });
  });

  it('elegir un filtro no cambia los KPI', () => {
    comp.elegirFiltro('VENCIDAS');
    expect(comp.ventasFiltradas.map((v: IVenta) => v.id)).toEqual(['c']);
    expect(comp.totalVendido).toBe(1800);
    expect(comp.conteos.TODAS).toBe(4);
  });

  it('busca por folio, cliente, documento y factura', () => {
    const buscar = (texto: string) => {
      comp.terminoBusqueda = texto;
      comp.aplicarFiltros();
      return comp.ventasFiltradas.map((v: IVenta) => v.id);
    };
    expect(buscar('wm-v-3')).toEqual(['a']);
    expect(buscar('atrasado')).toEqual(['c']);
    expect(buscar('44556677')).toEqual(['b']);
    expect(buscar('f001-77')).toEqual(['b']);
  });

  it('filtra por fecha de la venta', () => {
    comp.fechaDesde = hace(10);
    comp.aplicarFiltros();
    expect(comp.ventasFiltradas.map((v: IVenta) => v.id)).toEqual(['a', 'b']);
    comp.limpiarFiltros();
    comp.fechaHasta = hace(10);
    comp.aplicarFiltros();
    expect(comp.ventasFiltradas.map((v: IVenta) => v.id)).toEqual(['c', 'd']);
  });

  it('una venta actualizada reemplaza a la de la lista y mueve los KPI', () => {
    comp.alActualizar({ ...ventas[0], pagado: 1000, saldo: 0 });
    expect(comp.totalPorCobrar).toBe(300);
    expect(comp.totalCobrado).toBe(1500);
  });

  it('dice cuánto debe y hasta cuándo', () => {
    expect(comp.detalleCobro(venta({ saldo: 0 }))).toBe('');
    expect(comp.detalleCobro(venta({ estado: 'ANULADA' }))).toBe('');
    expect(comp.detalleCobro(venta({ saldo: 600 }))).toBe('Debe S/ 600.00');
    expect(comp.detalleCobro(venta({ saldo: 600, vence_el: hace(1) }))).toBe('Debe S/ 600.00, venció hace 1 día');
    expect(comp.detalleCobro(venta({ saldo: 600, vence_el: hace(3) }))).toBe('Debe S/ 600.00, venció hace 3 días');
    expect(comp.detalleCobro(venta({ saldo: 600, vence_el: '2999-12-31' }))).toBe('Debe S/ 600.00, vence el 31/12/2999');
  });

  it('?venta=id abre su detalle y limpia la dirección', () => {
    ruta.snapshot.queryParamMap = new Map([['venta', 'b']]);
    comp['abrirVentaPedida']();
    expect(comp.acciones.verDetalle).toHaveBeenCalledWith(ventas[1]);
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: {}, replaceUrl: true }));
  });

  it('sin ?venta no abre nada', () => {
    comp['abrirVentaPedida']();
    expect(comp.acciones.verDetalle).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('sin empresa activa lleva al selector', async () => {
    const sinEmpresa: any = new VentasComponent(
      supabase, { add: vi.fn() } as any, { markForCheck: () => {} } as any, router, ruta, { empresaActiva: () => null } as any
    );
    await sinEmpresa.cargarDatos();
    expect(router.navigate).toHaveBeenCalledWith(['/selector']);
  });
});

describe('DialogoConvertirComponent', () => {
  const cotizacion: any = { id: 'c1', folio: 'WM-00000021', estado: 'PENDIENTE', total: 1000, cliente_nombre: 'CLIENTE', cliente_documento: '20123456789' };
  let supabase: any;
  let mensajes: any;
  let comp: any;
  let convertidas: any[];

  beforeEach(() => {
    supabase = { convertirCotizacionEnVenta: vi.fn(async () => ({ id: 'v1', folio: 'WM-V-00000001' })) };
    mensajes = { add: vi.fn() };
    comp = new DialogoConvertirComponent(supabase, mensajes, { markForCheck: () => {} } as any);
    convertidas = [];
    comp.convertida.subscribe((v: any) => convertidas.push(v));
  });

  it('con un documento válido no lo pide', async () => {
    comp.abrir(cotizacion);
    expect(comp.necesitaDocumento).toBe(false);

    await comp.convertir();

    expect(supabase.convertirCotizacionEnVenta).toHaveBeenCalledWith('c1', comp.datos, null);
    expect(convertidas).toEqual([{ id: 'v1', folio: 'WM-V-00000001' }]);
    expect(comp.abierto).toBe(false);
  });

  it('sin documento válido lo pide y lo envía', async () => {
    comp.abrir({ ...cotizacion, cliente_documento: '12' });
    expect(comp.necesitaDocumento).toBe(true);

    await comp.convertir();
    expect(supabase.convertirCotizacionEnVenta).not.toHaveBeenCalled();
    expect(comp.mostrarFaltantes).toBe(true);
    expect(comp.faltantes).toEqual(['un RUC de 11 dígitos o un DNI de 8']);

    comp.documento = ' 20512345678 ';
    await comp.convertir();
    expect(supabase.convertirCotizacionEnVenta).toHaveBeenCalledWith('c1', comp.datos, '20512345678');
  });

  it('no deja recibir más que el total de la cotización', async () => {
    comp.abrir(cotizacion);
    comp.datos.adelantoMonto = 1001;
    comp.datos.adelantoMetodo = 'EFECTIVO';
    await comp.convertir();
    expect(supabase.convertirCotizacionEnVenta).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza, muestra el motivo y no cierra', async () => {
    supabase.convertirCotizacionEnVenta.mockRejectedValueOnce({ code: 'P0001', message: 'La cotización WM-00000021 ya es la venta WM-V-1.' });
    comp.abrir(cotizacion);
    await comp.convertir();
    expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'La cotización WM-00000021 ya es la venta WM-V-1.' }));
    expect(comp.abierto).toBe(true);
    expect(comp.guardando).toBe(false);
  });

  it('cada vez que se abre empieza limpio', () => {
    comp.abrir(cotizacion);
    comp.datos.adelantoMonto = 50;
    comp.documento = '123';
    comp.abrir(cotizacion);
    expect(comp.datos.adelantoMonto).toBeNull();
    expect(comp.documento).toBe('');
  });
});
