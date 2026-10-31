import { describe, it, expect } from 'vitest';
import {
  IVenta, IVentaComprobante, adelantoDe, cobradoEnElMes, cobradoSinFacturar, comprobanteDesdeArchivo, datosVentaIniciales,
  describirCambio, deudasPorCliente, diasDeAtraso, esDocumentoValido, estadoCobro, estaVencidaVenta, facturadoDe, faltaFacturar,
  faltantesDatosVenta, fechaIso, montoSugeridoFactura, resumenComprobantes, resumenFacturado, textoComprobantes, textoCondicionPago
} from './venta.model';

const hoy = new Date(2026, 9, 30, 15, 30);

function venta(extra: Partial<IVenta> = {}): IVenta {
  return {
    id: 'v1', folio: 'WM-V-00000001', fecha: '2026-10-01', empresa_id: 'WM', estado: 'ACTIVA', estado_entrega: 'PENDIENTE',
    cliente_nombre: 'CLIENTE SAC', cliente_documento: '20123456789', subtotal: 100, descuento_global: 0, igv: 18, total: 118,
    incluye_igv: true, precios_con_igv: false, pagado: 0, saldo: 118, condicion_pago: 'CONTADO',
    venta_items: [], pagos: [], venta_comprobantes: [], ...extra
  };
}

describe('estado del cobro', () => {
  it('sale de lo pagado y de la fecha, no se guarda', () => {
    expect(estadoCobro(venta(), hoy)).toBe('PENDIENTE');
    expect(estadoCobro(venta({ pagado: 18, saldo: 100 }), hoy)).toBe('PARCIAL');
    expect(estadoCobro(venta({ pagado: 118, saldo: 0 }), hoy)).toBe('PAGADA');
    expect(estadoCobro(venta({ estado: 'ANULADA' }), hoy)).toBe('ANULADA');
  });

  it('un saldo con el vencimiento pasado está vencido, aunque tenga pagos', () => {
    const atrasada = venta({ condicion_pago: 'CREDITO', vence_el: '2026-10-29', pagado: 18, saldo: 100 });
    expect(estaVencidaVenta(atrasada, hoy)).toBe(true);
    expect(estadoCobro(atrasada, hoy)).toBe('VENCIDA');
    expect(diasDeAtraso(atrasada, hoy)).toBe(1);
  });

  it('el día del vencimiento todavía no está vencida', () => {
    expect(estaVencidaVenta(venta({ vence_el: '2026-10-30' }), hoy)).toBe(false);
    expect(diasDeAtraso(venta({ vence_el: '2026-10-30' }), hoy)).toBe(0);
  });

  it('pagada, anulada o sin fecha de vencimiento no se vence', () => {
    expect(estaVencidaVenta(venta({ vence_el: '2026-01-01', saldo: 0 }), hoy)).toBe(false);
    expect(estaVencidaVenta(venta({ vence_el: '2026-01-01', estado: 'ANULADA' }), hoy)).toBe(false);
    expect(estaVencidaVenta(venta({ condicion_pago: 'CREDITO', vence_el: null }), hoy)).toBe(false);
  });
});

describe('datos de la venta', () => {
  it('arranca al contado, por entregar y con la fecha de hoy', () => {
    expect(datosVentaIniciales(hoy)).toMatchObject({ fecha: '2026-10-30', condicionPago: 'CONTADO', estadoEntrega: 'PENDIENTE', adelantoMonto: null });
  });

  it('la fecha es la local, no la de UTC', () => {
    expect(fechaIso(new Date(2026, 9, 30, 23, 59))).toBe('2026-10-30');
  });

  it('solo un RUC de 11 o un DNI de 8 sirve para vender', () => {
    expect(esDocumentoValido('20123456789')).toBe(true);
    expect(esDocumentoValido(' 12345678 ')).toBe(true);
    expect(esDocumentoValido('123')).toBe(false);
    expect(esDocumentoValido('2012345678A')).toBe(false);
    expect(esDocumentoValido(null)).toBe(false);
  });

  it('dice lo que falta', () => {
    const base = datosVentaIniciales(hoy);
    expect(faltantesDatosVenta(base, 100, hoy)).toEqual([]);
    expect(faltantesDatosVenta({ ...base, fecha: '' }, 100, hoy)).toEqual(['la fecha de la venta']);
    expect(faltantesDatosVenta({ ...base, fecha: '2026-10-31' }, 100, hoy)).toEqual(['una fecha que no sea futura']);
    expect(faltantesDatosVenta({ ...base, condicionPago: 'CREDITO', diasCredito: 0 }, 100, hoy)).toEqual(['días de crédito entre 1 y 365']);
    expect(faltantesDatosVenta({ ...base, adelantoMonto: 101, adelantoMetodo: 'EFECTIVO' }, 100, hoy)).toEqual(['un monto recibido que no supere el total']);
    expect(faltantesDatosVenta({ ...base, adelantoMonto: 10 }, 100, hoy)).toEqual(['cómo se recibió el pago']);
  });

  it('el crédito sin días es válido: no se le pone fecha', () => {
    expect(faltantesDatosVenta({ ...datosVentaIniciales(hoy), condicionPago: 'CREDITO' }, 100, hoy)).toEqual([]);
  });

  it('el adelanto solo se envía si se recibió algo', () => {
    const base = datosVentaIniciales(hoy);
    expect(adelantoDe(base)).toBeNull();
    expect(adelantoDe({ ...base, adelantoMonto: 0, adelantoMetodo: 'EFECTIVO' })).toBeNull();
    expect(adelantoDe({ ...base, adelantoMonto: 50, adelantoMetodo: 'YAPE_PLIN', adelantoReferencia: '  ' }))
      .toEqual({ monto: 50, metodo: 'YAPE_PLIN', referencia: null });
    expect(adelantoDe({ ...base, adelantoMonto: 50, adelantoMetodo: 'TRANSFERENCIA', adelantoReferencia: ' OP-1 ' }))
      .toEqual({ monto: 50, metodo: 'TRANSFERENCIA', referencia: 'OP-1' });
  });
});

describe('textos', () => {
  it('la condición de pago dice cuándo vence', () => {
    expect(textoCondicionPago(venta())).toBe('Contado');
    expect(textoCondicionPago(venta({ condicion_pago: 'CREDITO' }))).toBe('Crédito');
    expect(textoCondicionPago(venta({ condicion_pago: 'CREDITO', dias_credito: 30, vence_el: '2026-11-30' })))
      .toBe('Crédito a 30 días, vence el 30/11/2026');
  });

  it('el historial cuenta qué cambió', () => {
    expect(describirCambio({ tipo: 'AJUSTE', detalle: { antes: { total: 1180 }, despues: { total: 2200 } } }))
      .toBe('Ajuste: total de S/ 1,180.00 a S/ 2,200.00');
    expect(describirCambio({ tipo: 'AJUSTE', detalle: { antes: { total: 100 }, despues: { total: 100 } } })).toBe('Ajuste sin cambio de total');
    expect(describirCambio({ tipo: 'ANULACION', detalle: {} })).toBe('Venta anulada');
    expect(describirCambio({ tipo: 'ENTREGA', detalle: { antes: 'PENDIENTE', despues: 'PARCIAL' } })).toBe('Entrega: Por entregar → Entrega parcial');
    expect(describirCambio({ tipo: 'COMPROBANTE', detalle: { despues: { tipo: 'FACTURA', numero: 'F001-1' } } })).toBe('Comprobante: Factura F001-1');
    expect(describirCambio({ tipo: 'COMPROBANTE', detalle: { despues: { tipo: null, numero: null } } })).toBe('Se quitó el comprobante');
    expect(describirCambio({ tipo: 'PAGO_ANULADO', detalle: { monto: 400 } })).toBe('Pago de S/ 400.00 anulado');
    expect(describirCambio({ tipo: 'COMPROBANTE_ANULADO', detalle: { tipo: 'BOLETA', numero: 'B001-9', monto: 40 } })).toBe('Boleta B001-9 anulada');
  });
});

describe('facturas de una venta', () => {
  const comprobante = (monto: number, extra: Partial<IVentaComprobante> = {}): IVentaComprobante => ({
    id: 'c', venta_id: 'v1', empresa_id: 'WM', tipo: 'FACTURA', numero: 'F001-1', fecha: '2026-10-01', monto, registrado_en: '', anulado: false, ...extra
  });
  // Total 28,000 con IGV: adelanto de 10,000 cobrado y aún sin facturar
  const base = { total: 28000, pagado: 10000, saldo: 18000 };

  it('lo facturado suma lo vigente, no lo anulado', () => {
    expect(facturadoDe(venta())).toBe(0);
    expect(facturadoDe(venta({ venta_comprobantes: [comprobante(10000), comprobante(500.5), comprobante(999, { anulado: true })] }))).toBe(10500.5);
  });

  it('una factura por el adelanto: falta el resto y ya no hay cobrado sin facturar', () => {
    const v = venta({ ...base, venta_comprobantes: [comprobante(10000)] });
    expect(faltaFacturar(v)).toBe(18000);
    expect(cobradoSinFacturar(v)).toBe(0);
    expect(resumenFacturado(v)).toBe('Facturado S/ 10,000.00 de S/ 28,000.00. Falta S/ 18,000.00');
  });

  it('sin facturas avisa lo cobrado sin facturar y lo que falta', () => {
    const v = venta(base);
    expect(cobradoSinFacturar(v)).toBe(10000);
    expect(resumenFacturado(v)).toBe('Falta facturar S/ 28,000.00');
  });

  it('propone facturar primero lo cobrado y, si no hay, lo que falta', () => {
    expect(montoSugeridoFactura(venta(base))).toBe(10000);
    expect(montoSugeridoFactura(venta({ ...base, venta_comprobantes: [comprobante(10000)] }))).toBe(18000);
    expect(montoSugeridoFactura(venta({ ...base, venta_comprobantes: [comprobante(28000)] }))).toBeNull();
  });

  it('completa o de más lo dice, sin marcarlo como error', () => {
    expect(resumenFacturado(venta({ ...base, venta_comprobantes: [comprobante(28000)] }))).toBe('Facturado S/ 28,000.00: completo');
    const deMas = venta({ ...base, venta_comprobantes: [comprobante(28000), comprobante(1000)] });
    expect(faltaFacturar(deMas)).toBe(0);
    expect(resumenFacturado(deMas)).toBe('Facturado S/ 29,000.00: S/ 1,000.00 más que el total');
  });

  it('en una venta sin IGV no se calcula lo que falta: la factura puede llevarlo encima', () => {
    const sinIgv = venta({ ...base, incluye_igv: false });
    expect(faltaFacturar(sinIgv)).toBeNull();
    expect(cobradoSinFacturar(sinIgv)).toBeNull();
    expect(montoSugeridoFactura(sinIgv)).toBeNull();
    expect(resumenFacturado(sinIgv)).toBeNull();
    expect(resumenFacturado({ ...sinIgv, venta_comprobantes: [comprobante(11800)] })).toBe('Facturado S/ 11,800.00');
  });

  it('una venta anulada ya no tiene nada por facturar', () => {
    expect(faltaFacturar(venta({ ...base, estado: 'ANULADA' }))).toBeNull();
    expect(cobradoSinFacturar(venta({ ...base, estado: 'ANULADA' }))).toBeNull();
  });

  it('una fila muestra el número o cuántos son; el PDF y el CSV, todos', () => {
    const una = venta({ venta_comprobantes: [comprobante(10), comprobante(5, { numero: 'F001-9', anulado: true })] });
    expect(resumenComprobantes(venta())).toBeNull();
    expect(resumenComprobantes(una)).toBe('Factura F001-1');
    const dos = venta({ venta_comprobantes: [comprobante(10), comprobante(5, { tipo: 'BOLETA', numero: 'B001-2' })] });
    expect(resumenComprobantes(dos)).toBe('2 comprobantes');
    expect(textoComprobantes(dos)).toBe('Factura F001-1, Boleta B001-2');
    expect(textoComprobantes(venta())).toBeNull();
  });

  it('saca el número del nombre del archivo, si lo trae', () => {
    expect(comprobanteDesdeArchivo('20512345678-01-F001-00001234.pdf')).toEqual({ tipo: 'FACTURA', numero: 'F001-00001234' });
    expect(comprobanteDesdeArchivo('20512345678-03-B001-77.pdf')).toEqual({ tipo: 'BOLETA', numero: 'B001-77' });
    expect(comprobanteDesdeArchivo('Factura F002 123.pdf')).toEqual({ tipo: 'FACTURA', numero: 'F002-123' });
    expect(comprobanteDesdeArchivo('e001_55.jpg')).toEqual({ tipo: 'FACTURA', numero: 'E001-55' });
    expect(comprobanteDesdeArchivo('EB01-5.pdf')).toEqual({ tipo: 'BOLETA', numero: 'EB01-5' });
    expect(comprobanteDesdeArchivo('foto de la factura.jpg')).toBeNull();
    expect(comprobanteDesdeArchivo('FACT-123.pdf')).toBeNull();
  });
});

describe('deudas por cliente', () => {
  const ventas = [
    venta({ id: 'pagada', pagado: 118, saldo: 0 }),
    venta({ id: 'anulada', estado: 'ANULADA' }),
    venta({ id: 'a2', fecha: '2026-10-20', cliente_nombre: 'CLIENTE SAC NUEVO', cliente_telefono: '999', saldo: 100 }),
    venta({ id: 'a1', fecha: '2026-09-01', vence_el: '2026-10-01', saldo: 50.1 }),
    venta({ id: 'b1', fecha: '2026-10-10', cliente_nombre: 'OTRO', cliente_documento: '12345678', saldo: 500 }),
    venta({ id: 'c1', fecha: '2026-10-11', cliente_nombre: 'ATRASADO', cliente_documento: '87654321', vence_el: '2026-10-20', saldo: 300 })
  ];

  it('suma por documento, sin lo pagado ni lo anulado', () => {
    const deudas = deudasPorCliente(ventas, hoy);
    expect(deudas.map(d => d.documento)).toEqual(['87654321', '20123456789', '12345678']);
    const cliente = deudas[1];
    expect(cliente.saldo).toBe(150.1);
    expect(cliente.vencido).toBe(50.1);
    expect(cliente.mayorAtraso).toBe(29);
  });

  it('lo más antiguo primero, y el nombre y teléfono más recientes', () => {
    const cliente = deudasPorCliente(ventas, hoy)[1];
    expect(cliente.ventas.map(v => v.id)).toEqual(['a1', 'a2']);
    expect(cliente.nombre).toBe('CLIENTE SAC NUEVO');
    expect(cliente.telefono).toBe('999');
  });

  it('primero quien tiene más vencido, luego quien debe más', () => {
    expect(deudasPorCliente(ventas, hoy).map(d => d.vencido)).toEqual([300, 50.1, 0]);
  });

  it('sin deudas no hay filas', () => {
    expect(deudasPorCliente([venta({ saldo: 0 })], hoy)).toEqual([]);
  });
});

describe('cobrado en el mes', () => {
  const pago = (fecha: string, monto: number, anulado = false) => ({ id: fecha, venta_id: 'v', empresa_id: 'WM', fecha, monto, metodo: 'EFECTIVO' as const, registrado_en: fecha, anulado });

  it('cuenta por la fecha del pago y sin lo anulado', () => {
    const ventas = [venta({ pagos: [pago('2026-10-01', 100), pago('2026-09-30', 50), pago('2026-10-15', 70, true)] }), venta({ pagos: [pago('2026-10-30', 33.3)] })];
    expect(cobradoEnElMes(ventas, hoy)).toBe(133.3);
  });
});
