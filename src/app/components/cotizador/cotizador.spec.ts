import { describe, it, expect } from 'vitest';
import { CotizadorComponent } from './cotizador';

describe('CotizadorComponent - Customer Name Logic', () => {
  let comp: any;

  beforeEach(() => {
    comp = new CotizadorComponent(
      { markForCheck: () => {} } as any,
      {} as any,
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

  it('should not overwrite custom or cleared price when recalculating item', () => {
    comp.productosBD = [
      { codigo_sku: 'PRD-0001', descripcion: 'Bloque 15x20x40', unidad: 'und', precio_unitario_base: 4.50 }
    ];

    const item: any = {
      sku: 'PRD-0001',
      descripcion: 'Bloque 15x20x40',
      unidad: 'und',
      cantidad: 10,
      precio_unitario: 4.50,
      subtotal: 45
    };
    comp.carrito = [item];

    // User clears price input (backspace -> null)
    item.precio_unitario = null;
    comp.recalcularItem(item);

    // Price should remain null during editing and subtotal should be 0
    expect(item.precio_unitario).toBeNull();
    expect(item.subtotal).toBe(0);

    // User types new custom price (e.g. 3.80)
    item.precio_unitario = 3.80;
    comp.recalcularItem(item);
    expect(item.precio_unitario).toBe(3.80);
    expect(item.subtotal).toBe(38.00);

    // User types 0 (bonus/free sample)
    item.precio_unitario = 0;
    comp.recalcularItem(item);
    expect(item.precio_unitario).toBe(0);
    expect(item.subtotal).toBe(0);
  });

  it('should set base price when selecting suggestion or matching description from empty state', () => {
    comp.productosBD = [
      { codigo_sku: 'PRD-0001', descripcion: 'Bloque 15x20x40', unidad: 'und', precio_unitario_base: 4.50 }
    ];

    const item: any = {
      sku: '',
      descripcion: 'Bloque 15x20x40',
      unidad: '',
      cantidad: null,
      precio_unitario: null,
      subtotal: 0
    };
    comp.carrito = [item];

    comp.alCambiarDescripcion(item);
    expect(item.sku).toBe('PRD-0001');
    expect(item.unidad).toBe('und');
    expect(item.precio_unitario).toBe(4.50);
    expect(item.cantidad).toBe(1);
    expect(item.subtotal).toBe(4.50);
  });
});

