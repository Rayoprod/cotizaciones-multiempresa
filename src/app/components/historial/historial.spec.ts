import { describe, it, expect } from 'vitest';
import { HistorialComponent } from './historial';

describe('HistorialComponent - Customer Name and Document Extraction', () => {
  let comp: any;

  beforeEach(() => {
    comp = new HistorialComponent({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
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
