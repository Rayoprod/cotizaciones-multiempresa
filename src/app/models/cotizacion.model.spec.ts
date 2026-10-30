import { describe, it, expect } from 'vitest';
import { calcularTotales, estaVencida, modoIgvDe, redondear2, venceEl } from './cotizacion.model';

// Los mismos casos que supabase/pruebas_cotizaciones.sql: el total que ve el
// vendedor mientras edita debe coincidir con el que guarda crear_cotizacion().
describe('redondear2', () => {
  it('redondea la mitad hacia arriba como Postgres, sin errores binarios', () => {
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(2.675)).toBe(2.68);
    expect(redondear2(99.999)).toBe(100);
    expect(redondear2(0.125)).toBe(0.13);
    expect(redondear2(-1.005)).toBe(-1.01);
  });

  it('devuelve 0 para valores no numéricos', () => {
    expect(redondear2(NaN)).toBe(0);
    expect(redondear2(Infinity)).toBe(0);
  });
});

describe('calcularTotales', () => {
  const items = [
    { cantidad: 2.5, precio_unitario: 16 },     // 40.00
    { cantidad: 3, precio_unitario: 33.333 }    // 99.999 → 100.00
  ];

  it('suma importes redondeados por línea y agrega 18% de IGV', () => {
    expect(calcularTotales(items, 'sumar')).toEqual({ subtotal: 140, descuento: 0, igv: 25.2, total: 165.2 });
  });

  it('sin IGV el total es el subtotal', () => {
    expect(calcularTotales(items, 'sin_igv')).toEqual({ subtotal: 140, descuento: 0, igv: 0, total: 140 });
  });

  it('trata cantidades o precios vacíos como 0', () => {
    expect(calcularTotales([{ cantidad: null, precio_unitario: 10 }, { cantidad: 2, precio_unitario: undefined }], 'sumar'))
      .toEqual({ subtotal: 0, descuento: 0, igv: 0, total: 0 });
  });

  it('redondea el IGV del subtotal, no el de cada línea', () => {
    // 3 × 0.35 = 1.05 → IGV 0.189 → 0.19
    expect(calcularTotales([{ cantidad: 3, precio_unitario: 0.35 }], 'sumar')).toEqual({ subtotal: 1.05, descuento: 0, igv: 0.19, total: 1.24 });
  });

  // Los mismos casos que "IGV en tres modos y descuento" en pruebas_cotizaciones.sql.
  const mil = [{ cantidad: 10, precio_unitario: 100 }];

  it('con precios que ya incluyen IGV, el total es la suma y el IGV va dentro', () => {
    expect(calcularTotales(mil, 'incluido')).toEqual({ subtotal: 1000, descuento: 0, igv: 152.54, total: 1000 });
  });

  it('el descuento se resta antes de calcular el IGV, en los tres modos', () => {
    expect(calcularTotales(mil, 'incluido', 100)).toEqual({ subtotal: 1000, descuento: 100, igv: 137.29, total: 900 });
    expect(calcularTotales(mil, 'sumar', 100)).toEqual({ subtotal: 1000, descuento: 100, igv: 162, total: 1062 });
    expect(calcularTotales(mil, 'sin_igv', 100)).toEqual({ subtotal: 1000, descuento: 100, igv: 0, total: 900 });
  });

  it('un descuento mayor al subtotal no deja el total en negativo', () => {
    expect(calcularTotales(mil, 'sumar', 2000)).toEqual({ subtotal: 1000, descuento: 2000, igv: 0, total: 0 });
  });
});

describe('modoIgvDe', () => {
  it('lee el modo de lo que guardó la cotización', () => {
    expect(modoIgvDe({ incluye_igv: true, precios_con_igv: true, igv: 15 })).toBe('incluido');
    expect(modoIgvDe({ incluye_igv: true, precios_con_igv: false, igv: 18 })).toBe('sumar');
    expect(modoIgvDe({ incluye_igv: false, igv: 0 })).toBe('sin_igv');
  });

  it('las cotizaciones más viejas solo tienen el monto de IGV', () => {
    expect(modoIgvDe({ igv: 18 })).toBe('sumar');
    expect(modoIgvDe({ igv: 0 })).toBe('sin_igv');
  });
});

describe('estaVencida', () => {
  const hoy = new Date(2026, 9, 30, 12);
  const pendiente = (fecha: string, condiciones = {}) => ({ estado: 'PENDIENTE' as const, fecha, condiciones });

  it('vale hasta el último día de la validez, inclusive', () => {
    expect(estaVencida(pendiente('2026-10-15T15:00:00', { diasValidez: 15 }), hoy)).toBe(false);
    expect(estaVencida(pendiente('2026-10-14T15:00:00', { diasValidez: 15 }), hoy)).toBe(true);
  });

  it('sin condiciones guardadas asume los 15 días por defecto', () => {
    expect(estaVencida(pendiente('2026-10-14T15:00:00'), hoy)).toBe(true);
    expect(venceEl(pendiente('2026-10-14T15:00:00'))?.getDate()).toBe(29);
  });

  it('si no imprimió validez, no vence', () => {
    expect(estaVencida(pendiente('2026-01-01T15:00:00', { mostrarValidez: false }), hoy)).toBe(false);
    expect(venceEl(pendiente('2026-01-01T15:00:00', { mostrarValidez: false }))).toBeNull();
  });

  it('solo aplica a las Pendientes', () => {
    expect(estaVencida({ estado: 'APROBADA', fecha: '2026-01-01T15:00:00' }, hoy)).toBe(false);
    expect(estaVencida({ estado: 'ANULADA', fecha: '2026-01-01T15:00:00' }, hoy)).toBe(false);
  });

  it('entiende las fechas viejas sin hora', () => {
    expect(estaVencida(pendiente('2026-10-15', { diasValidez: 15 }), hoy)).toBe(false);
    expect(estaVencida(pendiente('2026-10-14', { diasValidez: 15 }), hoy)).toBe(true);
  });
});
