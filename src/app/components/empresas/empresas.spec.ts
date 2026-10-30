import { describe, it, expect } from 'vitest';
import { normalizarLugares } from './empresas';

describe('normalizarLugares', () => {
  it('limpia espacios, quita vacíos y repetidos sin importar mayúsculas', () => {
    expect(normalizarLugares(['  PUESTO EN   OBRA ', '', 'puesto en obra', 'PUESTO EN CANTERA', '   ']))
      .toEqual(['PUESTO EN OBRA', 'PUESTO EN CANTERA']);
  });

  it('acepta null y recorta textos de más de 100 caracteres', () => {
    expect(normalizarLugares(null)).toEqual([]);
    expect(normalizarLugares(['x'.repeat(150)])[0]).toHaveLength(100);
  });
});
