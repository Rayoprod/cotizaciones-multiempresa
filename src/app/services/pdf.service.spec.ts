import { describe, it, expect } from 'vitest';
import { avisoAnulada, condicionesPdf, filasCobroVenta, lineasCondicionesComerciales, lineasDeVenta, lineasTotales } from './pdf.service';

describe('lineasCondicionesComerciales', () => {
  const condiciones = { mostrarValidez: true, diasValidez: 30, mostrarCuentas: true, mostrarContacto: false };
  const base = { igv: 18, incluye_igv: true, vendedor_nombre: 'Ana Quispe' };

  it('imprime el lugar de entrega tal como se guardó', () => {
    const lineas = lineasCondicionesComerciales({ ...base, lugar_entrega: 'PUESTO EN OBRA (CON FLETE)' }, condiciones);
    expect(lineas[0]).toEqual(['Lugar de entrega', 'PUESTO EN OBRA (CON FLETE)']);
  });

  it('sin lugar (empresa que no usa lugares) no hay línea de entrega', () => {
    const lineas = lineasCondicionesComerciales({ ...base, lugar_entrega: null }, condiciones);
    expect(lineas.map(l => l[0])).not.toContain('Lugar de entrega');
    expect(lineas.map(l => l[0])).toEqual(['Impuestos', 'Validez', 'Vendedor']);
  });

  it('respeta validez, revisión y observaciones', () => {
    const lineas = lineasCondicionesComerciales(
      { ...base, incluye_igv: false, tipo_origen: 'revision', folio_origen: 'VDC-00000045', observaciones: 'Entrega en la mañana' },
      { ...condiciones, mostrarValidez: false }
    );
    expect(lineas).toEqual([
      ['Impuestos', 'Los precios NO incluyen IGV'],
      ['Reemplaza a', 'VDC-00000045'],
      ['Vendedor', 'Ana Quispe'],
      ['Observaciones', 'Entrega en la mañana']
    ]);
  });

  it('avisa cómo están los precios en cada modo de IGV', () => {
    const impuestos = (datos: object) =>
      lineasCondicionesComerciales({ igv: 0, ...datos }, condiciones).find(l => l[0] === 'Impuestos')?.[1];
    expect(impuestos({ incluye_igv: true })).toBe('El total incluye IGV (18%)');
    expect(impuestos({ incluye_igv: true, precios_con_igv: true })).toBe('Los precios incluyen IGV (18%)');
    expect(impuestos({ incluye_igv: false })).toBe('Los precios NO incluyen IGV');
  });

  it('nunca imprime el correo: sin nombre no hay línea de vendedor', () => {
    const lineas = lineasCondicionesComerciales({ igv: 18, incluye_igv: true, vendedor_nombre: null }, condiciones);
    expect(lineas.map(l => l[0])).not.toContain('Vendedor');
  });
});

describe('lineasTotales', () => {
  const base = { subtotal: 1000, igv: 180, incluye_igv: true };

  it('al sumar IGV: subtotal, IGV y nada después del total', () => {
    expect(lineasTotales(base)).toEqual({ antes: [['Subtotal', 1000], ['IGV (18%)', 180]], despues: null });
  });

  it('con IGV incluido: solo el total, y debajo lo que lleva dentro', () => {
    expect(lineasTotales({ ...base, igv: 152.54, precios_con_igv: true }))
      .toEqual({ antes: [], despues: ['Incluye IGV (18%):', 152.54] });
  });

  it('con IGV incluido y descuento: se ve de dónde sale el total', () => {
    expect(lineasTotales({ ...base, igv: 137.29, precios_con_igv: true, descuento_global: 100 }))
      .toEqual({ antes: [['Subtotal', 1000], ['Descuento', -100]], despues: ['Incluye IGV (18%):', 137.29] });
  });

  it('sin IGV: subtotal y descuento, sin línea de IGV', () => {
    expect(lineasTotales({ subtotal: 1000, igv: 0, incluye_igv: false, descuento_global: 100 }))
      .toEqual({ antes: [['Subtotal', 1000], ['Descuento', -100]], despues: null });
  });
});

describe('avisoAnulada', () => {
  it('solo en las anuladas, y dice cuál la reemplazó', () => {
    expect(avisoAnulada({ estado: 'PENDIENTE' }, null)).toBeNull();
    expect(avisoAnulada({ estado: 'APROBADA' }, 'VDC-2')).toBeNull();
    expect(avisoAnulada({ estado: 'ANULADA' })).toBe('COTIZACIÓN ANULADA');
    expect(avisoAnulada({ estado: 'ANULADA' }, 'VDC-2')).toBe('COTIZACIÓN ANULADA · Reemplazada por VDC-2');
  });
});

describe('condicionesPdf', () => {
  it('sin condiciones guardadas usa los valores por defecto de la empresa', () => {
    expect(condicionesPdf({ condiciones: {} }, { mostrar_cuentas: true })).toEqual({
      mostrarValidez: true, diasValidez: 15, mostrarCuentas: true, mostrarContacto: false
    });
    // Si la empresa no muestra cuentas, por defecto se muestra el contacto.
    expect(condicionesPdf({}, { mostrar_cuentas: false })).toEqual({
      mostrarValidez: true, diasValidez: 15, mostrarCuentas: false, mostrarContacto: true
    });
  });

  it('respeta las condiciones con las que se guardó la cotización', () => {
    const guardadas = { mostrarValidez: true, diasValidez: 30, mostrarCuentas: false, mostrarContacto: true };
    expect(condicionesPdf({ condiciones: guardadas }, { mostrar_cuentas: true })).toEqual(guardadas);
  });

  it('los ajustes explícitos ganan sobre lo guardado', () => {
    expect(condicionesPdf({ condiciones: { mostrarValidez: true } }, null, { mostrarValidez: false }).mostrarValidez).toBe(false);
  });
});

describe('orden de venta', () => {
  const venta: any = { estado: 'ACTIVA', condicion_pago: 'CREDITO', dias_credito: 30, vence_el: '2026-11-30', pagado: 300, saldo: 880 };

  it('dice cómo se paga, de qué cotización viene y su comprobante', () => {
    expect(lineasDeVenta(venta)).toEqual([['Condición de pago', 'Crédito a 30 días, vence el 30/11/2026']]);
    expect(lineasDeVenta({ ...venta, condicion_pago: 'CONTADO', folio_cotizacion: 'WM-00000021', comprobante_tipo: 'FACTURA', comprobante_numero: 'F001-9' })).toEqual([
      ['Condición de pago', 'Contado'], ['Cotización', 'WM-00000021'], ['Comprobante', 'Factura F001-9']
    ]);
  });

  it('las líneas de la venta van después de los impuestos', () => {
    const lineas = lineasCondicionesComerciales(
      { igv: 0, incluye_igv: false, vendedor_nombre: 'Ana Quispe' },
      { mostrarValidez: false, diasValidez: 15, mostrarCuentas: true, mostrarContacto: false },
      [['Condición de pago', 'Contado']]
    );
    expect(lineas.map(l => l[0])).toEqual(['Impuestos', 'Condición de pago', 'Vendedor']);
  });

  it('bajo el total van lo pagado y el saldo; sin pagos no hace falta', () => {
    expect(filasCobroVenta(venta)).toEqual([['Pagado', 300], ['Saldo', 880]]);
    expect(filasCobroVenta({ ...venta, pagado: 0, saldo: 1180 })).toEqual([]);
    expect(filasCobroVenta({ ...venta, estado: 'ANULADA' })).toEqual([]);
  });
});
