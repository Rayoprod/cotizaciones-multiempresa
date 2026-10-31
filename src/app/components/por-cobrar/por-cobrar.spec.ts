import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PorCobrarComponent } from './por-cobrar';
import { IVenta, fechaIso } from '../../models';

const venta = (extra: Partial<IVenta> = {}): IVenta => ({
  id: 'v1', folio: 'WM-V-00000001', fecha: '2026-10-01', empresa_id: 'WM', estado: 'ACTIVA', estado_entrega: 'PENDIENTE',
  cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789', subtotal: 100, descuento_global: 0, igv: 18, total: 118,
  incluye_igv: true, precios_con_igv: false, pagado: 0, saldo: 118, condicion_pago: 'CONTADO',
  venta_items: [], pagos: [], venta_comprobantes: [], ...extra
});

const hace = (dias: number) => fechaIso(new Date(Date.now() - dias * 86400000));

describe('PorCobrarComponent', () => {
  const ventas = [
    venta({ id: 'a', fecha: hace(5), cliente_nombre: 'ANDINA', total: 1000, pagado: 400, saldo: 600, pagos: [{ id: 'p', venta_id: 'a', empresa_id: 'WM', fecha: fechaIso(), monto: 400, metodo: 'EFECTIVO', registrado_en: '', anulado: false }] }),
    venta({ id: 'b', fecha: hace(40), cliente_nombre: 'ANDINA', total: 300, saldo: 300, vence_el: hace(10), estado_entrega: 'ENTREGADA' }),
    venta({ id: 'c', fecha: hace(3), cliente_nombre: 'PACIFICO', cliente_documento: '44556677', total: 200, saldo: 200, condicion_pago: 'CREDITO', estado_entrega: 'PARCIAL' }),
    venta({ id: 'pagada', total: 500, pagado: 500, saldo: 0, estado_entrega: 'ENTREGADA' }),
    venta({ id: 'anulada', total: 9000, saldo: 9000, estado: 'ANULADA', estado_entrega: 'ENTREGADA' })
  ];
  let supabase: any;
  let comp: any;

  beforeEach(async () => {
    supabase = { getVentas: vi.fn(async () => ventas) };
    comp = new PorCobrarComponent(
      supabase, { add: vi.fn() } as any, { markForCheck: () => {} } as any, { navigate: vi.fn() } as any,
      { empresaActiva: () => ({ id: 'WM', nombre_comercial: 'WM' }) } as any
    );
    await comp.cargarDatos();
  });

  it('suma lo que se debe, sin lo pagado ni lo anulado', () => {
    expect(comp.totalPorCobrar).toBe(1100);
    expect(comp.totalVencido).toBe(300);
    expect(comp.clientesVencidos).toBe(1);
    expect(comp.deudas.map((d: any) => [d.nombre, d.saldo])).toEqual([['ANDINA', 900], ['PACIFICO', 200]]);
  });

  it('entregado sin pagar es solo lo que ya salió completo', () => {
    expect(comp.entregadoSinPagar).toBe(300);
    expect(comp.ventasEntregadasSinPagar).toBe(1);
  });

  it('cuenta lo cobrado este mes', () => {
    expect(comp.cobradoEsteMes).toBe(400);
  });

  it('filtra por vencidos y por cliente', () => {
    comp.alternarVencidas();
    expect(comp.deudasFiltradas.map((d: any) => d.nombre)).toEqual(['ANDINA']);
    comp.alternarVencidas();
    comp.terminoBusqueda = '44556677';
    comp.aplicarFiltros();
    expect(comp.deudasFiltradas.map((d: any) => d.nombre)).toEqual(['PACIFICO']);
  });

  it('un pago actualiza la deuda del cliente al momento', () => {
    comp.alActualizar({ ...ventas[1], pagado: 300, saldo: 0 });
    expect(comp.totalVencido).toBe(0);
    expect(comp.deudas[0].saldo).toBe(600);
  });

  it('al pagarlo todo, el cliente sale de la lista', () => {
    comp.alActualizar({ ...ventas[2], pagado: 200, saldo: 0 });
    expect(comp.deudas.map((d: any) => d.nombre)).toEqual(['ANDINA']);
  });

  it('dice cuándo toca cobrar', () => {
    expect(comp.textoVencimiento(ventas[1])).toBe('Venció hace 10 días');
    expect(comp.textoVencimiento(venta({ vence_el: '2999-12-31' }))).toBe('Vence el 31/12/2999');
    expect(comp.textoVencimiento(ventas[2])).toBe('Crédito sin fecha');
    expect(comp.textoVencimiento(ventas[0])).toBe('Contado');
  });

  it('abre y cierra las ventas de un cliente', () => {
    comp.alternar('20123456789');
    expect(comp.abiertas.has('20123456789')).toBe(true);
    comp.alternar('20123456789');
    expect(comp.abiertas.has('20123456789')).toBe(false);
  });
});
