import { describe, it, expect } from 'vitest';
import { calcularTotales, redondear2 } from './cotizacion.model';

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
    expect(calcularTotales(items, true)).toEqual({ subtotal: 140, igv: 25.2, total: 165.2 });
  });

  it('sin IGV el total es el subtotal', () => {
    expect(calcularTotales(items, false)).toEqual({ subtotal: 140, igv: 0, total: 140 });
  });

  it('trata cantidades o precios vacíos como 0', () => {
    expect(calcularTotales([{ cantidad: null, precio_unitario: 10 }, { cantidad: 2, precio_unitario: undefined }], true))
      .toEqual({ subtotal: 0, igv: 0, total: 0 });
  });

  it('redondea el IGV del subtotal, no el de cada línea', () => {
    // 3 × 0.35 = 1.05 → IGV 0.189 → 0.19
    expect(calcularTotales([{ cantidad: 3, precio_unitario: 0.35 }], true)).toEqual({ subtotal: 1.05, igv: 0.19, total: 1.24 });
  });
});
