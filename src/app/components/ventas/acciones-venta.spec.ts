import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccionesVentaComponent } from './acciones-venta';
import { CLAVE_BORRADOR_COTIZADOR, IVenta, fechaIso } from '../../models';

const venta = (extra: Partial<IVenta> = {}): IVenta => ({
  id: 'v1', folio: 'WM-V-00000001', fecha: '2026-10-01', empresa_id: 'WM', estado: 'ACTIVA', estado_entrega: 'PENDIENTE',
  cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789', subtotal: 1000, descuento_global: 0, igv: 180, total: 1180,
  incluye_igv: true, precios_con_igv: false, pagado: 0, saldo: 1180, condicion_pago: 'CONTADO',
  venta_items: [{ id: 'linea-1', descripcion: 'Arena', unidad: 'm3', cantidad: 10, precio_unitario: 100, importe: 1000 }],
  pagos: [], ...extra
});

describe('AccionesVentaComponent', () => {
  let supabase: any;
  let mensajes: any;
  let router: any;
  let pdf: any;
  let esAdmin: boolean;
  let comp: any;
  let actualizadas: IVenta[];
  const etiquetas = (v: IVenta) => comp.menuDe(v).filter((i: any) => !i.separator).map((i: any) => i.label);

  beforeEach(() => {
    const almacen = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { setItem: (k: string, v: string) => almacen.set(k, v), getItem: (k: string) => almacen.get(k) ?? null });
    supabase = {
      getCambiosVenta: vi.fn(async () => [{ id: 'c1', tipo: 'ENTREGA', fecha: '2026-10-02', detalle: {} }]),
      registrarPago: vi.fn(async () => venta({ pagado: 500, saldo: 680 })),
      anularPago: vi.fn(async () => venta()),
      anularVenta: vi.fn(async () => venta({ estado: 'ANULADA' })),
      marcarEntregaVenta: vi.fn(async (_: string, estado: any) => venta({ estado_entrega: estado })),
      guardarComprobanteVenta: vi.fn(async () => venta({ comprobante_tipo: 'FACTURA', comprobante_numero: 'F001-1' }))
    };
    mensajes = { add: vi.fn() };
    router = { navigate: vi.fn() };
    pdf = { generarYDescargarOrdenVenta: vi.fn(async () => {}) };
    esAdmin = false;
    comp = new AccionesVentaComponent(
      supabase, mensajes, pdf, { markForCheck: () => {} } as any, router,
      { esAdminEmpresaActiva: () => esAdmin, empresaActiva: () => ({ id: 'WM' }) } as any
    );
    actualizadas = [];
    comp.actualizada.subscribe((v: IVenta) => actualizadas.push(v));
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('menú', () => {
    it('un vendedor registra pagos, entrega y factura, pero no ajusta ni anula', () => {
      expect(etiquetas(venta())).toEqual(['Ver detalle', 'Registrar pago', 'Marcar entrega parcial', 'Marcar entregada', 'Anotar factura o boleta']);
    });

    it('el admin además ajusta y anula', () => {
      esAdmin = true;
      expect(etiquetas(venta())).toEqual(['Ver detalle', 'Registrar pago', 'Marcar entrega parcial', 'Marcar entregada', 'Anotar factura o boleta', 'Ajustar', 'Anular']);
    });

    it('sin saldo no ofrece registrar pago', () => {
      expect(etiquetas(venta({ pagado: 1180, saldo: 0 }))).not.toContain('Registrar pago');
    });

    it('no ofrece el estado de entrega en el que ya está', () => {
      expect(etiquetas(venta({ estado_entrega: 'ENTREGADA' }))).toEqual(expect.arrayContaining(['Marcar por entregar', 'Marcar entrega parcial']));
      expect(etiquetas(venta({ estado_entrega: 'ENTREGADA' }))).not.toContain('Marcar entregada');
    });

    it('con comprobante, ofrece cambiarlo', () => {
      expect(etiquetas(venta({ comprobante_tipo: 'FACTURA', comprobante_numero: 'F001-1' }))).toContain('Cambiar factura o boleta');
    });

    it('una venta anulada solo se puede ver, también para el admin', () => {
      esAdmin = true;
      expect(etiquetas(venta({ estado: 'ANULADA' }))).toEqual(['Ver detalle']);
    });
  });

  it('el detalle trae el historial solo si no lo tiene', async () => {
    await comp.verDetalle(venta());
    expect(supabase.getCambiosVenta).toHaveBeenCalledWith('v1');
    expect(comp.detalle.venta_cambios).toHaveLength(1);

    supabase.getCambiosVenta.mockClear();
    await comp.verDetalle(venta({ venta_cambios: [] }));
    expect(supabase.getCambiosVenta).not.toHaveBeenCalled();
  });

  describe('registrar pago', () => {
    it('propone el saldo y hoy, y pide cómo se recibió', async () => {
      comp.abrirPago(venta());
      expect(comp.pago).toMatchObject({ monto: 1180, metodo: null, fecha: fechaIso() });

      await comp.registrarPago();

      expect(supabase.registrarPago).not.toHaveBeenCalled();
      expect(comp.faltantesPago).toEqual(['cómo se recibió']);
      expect(comp.mostrarFaltantesPago).toBe(true);
    });

    it('no acepta más que el saldo, ni 0, ni una fecha futura', () => {
      comp.abrirPago(venta());
      comp.pago.metodo = 'EFECTIVO';
      comp.pago.monto = 1180.01;
      expect(comp.faltantesPago).toEqual(['un monto que no supere el saldo']);
      comp.pago.monto = 0;
      expect(comp.faltantesPago).toEqual(['el monto']);
      comp.pago.monto = 10;
      comp.pago.fecha = '2999-01-01';
      expect(comp.faltantesPago).toEqual(['una fecha que no sea futura']);
    });

    it('al guardar actualiza el detalle y dice cuánto queda', async () => {
      await comp.verDetalle(venta({ venta_cambios: [] }));
      comp.abrirPago(venta());
      Object.assign(comp.pago, { monto: 500, metodo: 'YAPE_PLIN', referencia: ' OP-1 ', nota: '  ' });

      await comp.registrarPago();

      expect(supabase.registrarPago).toHaveBeenCalledWith('v1', { monto: 500, metodo: 'YAPE_PLIN', fecha: fechaIso(), referencia: 'OP-1', nota: null });
      expect(comp.pagoAbierto).toBe(false);
      expect(comp.detalle.saldo).toBe(680);
      expect(actualizadas[0].saldo).toBe(680);
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', detail: 'WM-V-00000001 queda debiendo S/ 680.00.' }));
    });

    it('si el servidor lo rechaza, muestra su motivo y deja la ventana abierta', async () => {
      supabase.registrarPago.mockRejectedValueOnce({ code: '22023', message: 'El pago de S/ 500 supera el saldo de S/ 100.' });
      comp.abrirPago(venta());
      comp.pago.metodo = 'EFECTIVO';

      await comp.registrarPago();

      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'El pago de S/ 500 supera el saldo de S/ 100.' }));
      expect(comp.pagoAbierto).toBe(true);
      expect(comp.guardando).toBe(false);
    });
  });

  describe('anular', () => {
    it('anular una venta pide motivo y dice qué pasa con su cotización', async () => {
      comp.pedirAnularVenta(venta({ folio_cotizacion: 'WM-00000021', estado_entrega: 'PARCIAL' }));
      expect(comp.pedido.mensaje).toContain('La cotización WM-00000021 vuelve a Pendiente.');
      expect(comp.pedido.mensaje).toContain('material entregado');

      await comp.confirmarMotivo();
      expect(supabase.anularVenta).not.toHaveBeenCalled();

      comp.motivo = ' El cliente desistió ';
      await comp.confirmarMotivo();

      expect(supabase.anularVenta).toHaveBeenCalledWith('v1', 'El cliente desistió');
      expect(comp.motivoAbierto).toBe(false);
      expect(actualizadas[0].estado).toBe('ANULADA');
    });

    it('con pagos vigentes no pide motivo: abre el detalle y avisa', () => {
      comp.pedirAnularVenta(venta({ pagado: 100, saldo: 1080, venta_cambios: [] }));
      expect(comp.motivoAbierto).toBe(false);
      expect(comp.detalleAbierto).toBe(true);
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
    });

    it('anular un pago pide motivo y usa el id del pago', async () => {
      const pago: any = { id: 'p1', monto: 400, fecha: '2026-10-05' };
      comp.pedirAnularPago(venta(), pago);
      comp.motivo = 'Se registró dos veces';
      await comp.confirmarMotivo();
      expect(supabase.anularPago).toHaveBeenCalledWith('p1', 'Se registró dos veces');
    });

    it('si el servidor no deja anular, se dice por qué', async () => {
      supabase.anularVenta.mockRejectedValueOnce({ code: '42501', message: 'Solo un admin de la empresa puede anular ventas.' });
      comp.pedirAnularVenta(venta());
      comp.motivo = 'x';
      await comp.confirmarMotivo();
      expect(mensajes.add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Solo un admin de la empresa puede anular ventas.' }));
      expect(comp.motivoAbierto).toBe(true);
    });
  });

  it('marcar la entrega no vuelve a guardar el estado actual', async () => {
    await comp.marcarEntrega(venta(), 'PENDIENTE');
    expect(supabase.marcarEntregaVenta).not.toHaveBeenCalled();

    await comp.marcarEntrega(venta(), 'ENTREGADA');
    expect(supabase.marcarEntregaVenta).toHaveBeenCalledWith('v1', 'ENTREGADA');
    expect(actualizadas[0].estado_entrega).toBe('ENTREGADA');
  });

  it('propone boleta para un DNI y factura para un RUC', () => {
    comp.abrirComprobante(venta({ cliente_documento: '12345678' }));
    expect(comp.comprobante.tipo).toBe('BOLETA');
    comp.abrirComprobante(venta());
    expect(comp.comprobante.tipo).toBe('FACTURA');
    comp.abrirComprobante(venta({ cliente_documento: '12345678', comprobante_tipo: 'FACTURA', comprobante_numero: 'F001-1' }));
    expect(comp.comprobante).toEqual({ tipo: 'FACTURA', numero: 'F001-1' });
  });

  it('ajustar abre el cotizador con las líneas, sus id y lo pagado', () => {
    comp.verDetalle(venta({ venta_cambios: [] }));
    comp.ajustar(venta({ pagado: 300, saldo: 880, condicion_pago: 'CREDITO', dias_credito: 30, descuento_global: 50 }));

    const borrador = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR_COTIZADOR)!);
    expect(borrador).toMatchObject({
      modo: 'ajuste', origen_id: 'v1', folio_origen: 'WM-V-00000001', pagado: 300, descuento: 50, modo_igv: 'sumar',
      datos_venta: { fecha: '2026-10-01', condicionPago: 'CREDITO', diasCredito: 30 }
    });
    expect(borrador.items[0]).toMatchObject({ id: 'linea-1', cantidad: 10, subtotal: 1000 });
    expect(router.navigate).toHaveBeenCalledWith(['/cotizador']);
    expect(comp.detalleAbierto).toBe(false);
  });

  it('la orden de venta se genera con la empresa activa', async () => {
    const v = venta();
    await comp.descargarPdf(v);
    expect(pdf.generarYDescargarOrdenVenta).toHaveBeenCalledWith(v, { id: 'WM' });
    expect(comp.descargando).toBe(false);
  });
});
