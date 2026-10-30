import { describe, it, expect } from 'vitest';
import { condicionesPdf, lineasCondicionesComerciales } from './pdf.service';

describe('lineasCondicionesComerciales', () => {
  const condiciones = { mostrarValidez: true, diasValidez: 30, mostrarCuentas: true, mostrarContacto: false };
  const base = { igv: 18, incluye_igv: true, vendedor: 'ana@correo.com' };

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
      ['Vendedor', 'ana@correo.com'],
      ['Observaciones', 'Entrega en la mañana']
    ]);
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
