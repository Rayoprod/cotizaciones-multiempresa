import { describe, it, expect } from 'vitest';
import { CotizadorComponent } from './cotizador';

describe('CotizadorComponent - Customer Name Logic', () => {
  let comp: any;

  beforeEach(() => {
    comp = new CotizadorComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('should resolve plain string customer names', () => {
    expect(comp.obtenerNombreClienteTexto('CONSTRUCTORA SAC')).toBe('CONSTRUCTORA SAC');
    expect(comp.obtenerNombreClienteTexto('  EMPRESA ABC  ')).toBe('EMPRESA ABC');
  });

  it('should resolve object customer names with different property keys', () => {
    expect(comp.obtenerNombreClienteTexto({ nombre_razon_social: 'CORP 1' })).toBe('CORP 1');
    expect(comp.obtenerNombreClienteTexto({ cliente_nombre: 'CORP 2' })).toBe('CORP 2');
    expect(comp.obtenerNombreClienteTexto({ clientenombre: 'CORP 3' })).toBe('CORP 3');
    expect(comp.obtenerNombreClienteTexto({ clienteNombre: 'CORP 4' })).toBe('CORP 4');
    expect(comp.obtenerNombreClienteTexto({ nombre: 'CORP 5' })).toBe('CORP 5');
    expect(comp.obtenerNombreClienteTexto({ label: 'CORP 6' })).toBe('CORP 6');
  });

  it('should filter out [object Object] or empty objects safely', () => {
    expect(comp.obtenerNombreClienteTexto('[object Object]')).toBe('');
    expect(comp.obtenerNombreClienteTexto({})).toBe('');
    expect(comp.obtenerNombreClienteTexto(null)).toBe('');
  });
});
