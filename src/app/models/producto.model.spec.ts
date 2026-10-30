import { describe, it, expect } from 'vitest';
import { siguienteSkuProducto, unidadMasUsada } from './producto.model';

describe('unidadMasUsada', () => {
  it('toma la unidad más frecuente del catálogo', () => {
    expect(unidadMasUsada([{ unidad: 'und' }, { unidad: 'und' }, { unidad: 'm3' }])).toBe('und');
  });

  it('sin catálogo o sin unidades, usa m³, que es lo que más se vende', () => {
    expect(unidadMasUsada([])).toBe('m3');
    expect(unidadMasUsada([{ unidad: '' }, { unidad: undefined }, { unidad: '   ' }])).toBe('m3');
  });
});

describe('siguienteSkuProducto', () => {
  it('sigue el número más alto', () => {
    expect(siguienteSkuProducto([{ codigo_sku: 'PRD-0001' }, { codigo_sku: 'PRD-0007' }])).toBe('PRD-0008');
  });

  it('en un catálogo vacío empieza en 1', () => {
    expect(siguienteSkuProducto([])).toBe('PRD-0001');
  });

  it('ignora los códigos con otro formato', () => {
    expect(siguienteSkuProducto([{ codigo_sku: 'ARENA' }, { codigo_sku: 'PRD-0002' }])).toBe('PRD-0003');
  });
});
