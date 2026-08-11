import { describe, it, expect } from 'vitest';
import { ProductosComponent } from './productos';

describe('ProductosComponent - Product creation logic', () => {
  it('should initialize empty product without id property when abrirNuevo is called', () => {
    const mockSession = { empresaActiva: () => ({ id: 'emp-123', nombre: 'Empresa Test' }) };
    const mockMessage = { add: () => {} };
    const comp = new ProductosComponent({} as any, mockSession as any, {} as any, mockMessage as any);

    comp.productos = [];
    comp.abrirNuevo();

    expect(comp.productoActual.empresa_id).toBe('emp-123');
    expect(comp.productoActual.id).toBeUndefined();
    expect(comp.productoActual.codigo_sku).toMatch(/^PRD-/);
    expect(comp.productoDialog).toBe(true);
  });

  it('should generate incremented SKU automatically', () => {
    const mockSession = { empresaActiva: () => ({ id: 'emp-123' }) };
    const comp = new ProductosComponent({} as any, mockSession as any, {} as any, {} as any);
    comp.productos = [
      { codigo_sku: 'PRD-0001', descripcion: 'P1', unidad: 'm3', precio_unitario_base: 10, empresa_id: 'emp-123' },
      { codigo_sku: 'PRD-0002', descripcion: 'P2', unidad: 'm3', precio_unitario_base: 20, empresa_id: 'emp-123' }
    ];

    const sku = comp.generarSkuAutomatico();
    expect(sku).toBe('PRD-0003');
  });
});
